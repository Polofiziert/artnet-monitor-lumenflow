use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use crate::artnet::DMX_CHANNELS_PER_UNIVERSE;
use crate::engine::{SourceTracker, Staleness, UniverseMetrics};

/// Full 15-bit Art-Net 4 port-address space (0..32767).
const MAX_PORT_ADDRESS: usize = 32768;

/// Returns a process-wide monotonic epoch for converting `Instant` to
/// atomic-friendly `u64` nanoseconds without calling `Instant::now()` on
/// every packet.
fn epoch() -> &'static Instant {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    EPOCH.get_or_init(Instant::now)
}

/// Returns nanoseconds since the shared epoch. Used by engine components
/// for lock-free timestamp handling without syscalls on every packet.
#[inline]
pub fn epoch_nanos() -> u64 {
    epoch().elapsed().as_nanos() as u64
}

/// Per-universe DMX buffer storing current channel values and metrics.
///
/// Designed for lock-free single-producer (network thread) writes with
/// concurrent multi-reader access (UI thread, metrics). The DMX data
/// uses individual `AtomicU8` cells so readers never see a torn frame
/// on any single channel, though cross-channel consistency within a
/// frame is best-effort (acceptable for monitoring).
pub struct UniverseBuffer {
    port_address: u16,
    channels: [AtomicU8; DMX_CHANNELS_PER_UNIVERSE],
    sequence: AtomicU8,
    packet_count: AtomicU64,
    last_update_nanos: AtomicU64,
}

impl UniverseBuffer {
    /// Creates a new buffer for the given 15-bit port-address, zeroed.
    pub fn new(port_address: u16) -> Self {
        Self {
            port_address,
            channels: std::array::from_fn(|_| AtomicU8::new(0)),
            sequence: AtomicU8::new(0),
            packet_count: AtomicU64::new(0),
            last_update_nanos: AtomicU64::new(0),
        }
    }

    /// Returns the 15-bit port-address this buffer is assigned to.
    pub fn port_address(&self) -> u16 {
        self.port_address
    }

    /// Updates the buffer with new DMX data from a parsed ArtDmx packet.
    ///
    /// Only writes the channels covered by `data.len()`. This is called
    /// from the network thread (single producer).
    pub fn update(&self, data: &[u8], sequence: u8) {
        let len = data.len().min(DMX_CHANNELS_PER_UNIVERSE);
        for (i, &val) in data[..len].iter().enumerate() {
            self.channels[i].store(val, Ordering::Relaxed);
        }
        self.sequence.store(sequence, Ordering::Release);
        self.packet_count.fetch_add(1, Ordering::Relaxed);
        let nanos = epoch().elapsed().as_nanos() as u64;
        self.last_update_nanos.store(nanos, Ordering::Release);
    }

    /// Snapshots all 512 channel values into the provided output buffer.
    ///
    /// This is called from the render/IPC thread to gather data for the
    /// frontend. The snapshot is consistent per-channel but may span
    /// two frames at the boundary (acceptable for monitoring UIs).
    pub fn snapshot(&self, out: &mut [u8; DMX_CHANNELS_PER_UNIVERSE]) {
        for (i, cell) in self.channels.iter().enumerate() {
            out[i] = cell.load(Ordering::Relaxed);
        }
    }

    /// Returns the current sequence number.
    pub fn sequence(&self) -> u8 {
        self.sequence.load(Ordering::Acquire)
    }

    /// Returns the total number of packets received for this universe.
    pub fn packet_count(&self) -> u64 {
        self.packet_count.load(Ordering::Relaxed)
    }

    /// Returns nanoseconds since epoch of the last DMX update, or 0 if never updated.
    pub fn last_update_nanos(&self) -> u64 {
        self.last_update_nanos.load(Ordering::Acquire)
    }

    /// Returns the elapsed duration since the last update, or `None` if
    /// never updated.
    ///
    /// Uses a shared monotonic epoch and atomic `u64` nanosecond counter
    /// to avoid mutex contention on the hot path (22,000+ calls/sec).
    ///
    /// # Errors
    /// This method is infallible but returns `None` when the buffer has
    /// never been written to.
    pub fn last_update_elapsed(&self) -> Option<Duration> {
        let nanos = self.last_update_nanos.load(Ordering::Acquire);
        if nanos == 0 {
            return None;
        }
        let total = epoch().elapsed();
        Some(total.saturating_sub(Duration::from_nanos(nanos)))
    }
}

/// A slot in the pre-allocated universe array, pairing an initialization
/// flag with the buffer, metrics, and source tracker.
pub struct UniverseSlot {
    initialized: AtomicBool,
    has_nzs: AtomicBool,
    buffer: UniverseBuffer,
    metrics: UniverseMetrics,
    source_tracker: SourceTracker,
}

/// Thread-safe registry of universe buffers indexed by 15-bit port-address.
///
/// Uses a flat pre-allocated array of 32,768 slots (~16.8 MB) to eliminate
/// all lock contention. Direct indexing replaces `DashMap` shard locks.
pub struct UniverseStore {
    slots: Box<[UniverseSlot]>,
}

impl UniverseStore {
    /// Creates a universe store with 32,768 pre-allocated slots.
    ///
    /// One-time cost of ~16.8 MB. Acceptable for a desktop monitoring
    /// application that must handle the full 15-bit Art-Net 4 port-address space.
    pub fn new() -> Self {
        let slots: Vec<UniverseSlot> = (0..MAX_PORT_ADDRESS)
            .map(|i| UniverseSlot {
                initialized: AtomicBool::new(false),
                has_nzs: AtomicBool::new(false),
                buffer: UniverseBuffer::new(i as u16),
                metrics: UniverseMetrics::new(),
                source_tracker: SourceTracker::new(),
            })
            .collect();
        Self {
            slots: slots.into_boxed_slice(),
        }
    }

    /// Returns the number of initialized (active) universes.
    pub fn len(&self) -> usize {
        self.slots
            .iter()
            .filter(|s| s.initialized.load(Ordering::Acquire))
            .count()
    }

    /// Returns `true` if no universes have been initialized.
    pub fn is_empty(&self) -> bool {
        !self
            .slots
            .iter()
            .any(|s| s.initialized.load(Ordering::Acquire))
    }

    /// Updates the DMX data for the given port-address.
    ///
    /// Marks the slot as initialized on first use. Direct array indexing —
    /// no locks, no hash lookups. Silently drops data for out-of-range
    /// port-addresses (> 0x7FFF).
    ///
    /// Records metrics (sequence errors, staleness) and source tracking for
    /// merge detection. `source_ip` is the sender's IPv4 as `u32` (network
    /// byte order); `physical` is the ArtDmx Physical field (or ArtNzs
    /// start_code when `mark_nzs` is true). When `mark_nzs` is true and
    /// `physical` != 0, sets the NZS flag for this universe.
    pub fn update(
        &self,
        port_address: u16,
        data: &[u8],
        sequence: u8,
        source_ip: u32,
        physical: u8,
        mark_nzs: bool,
    ) {
        let idx = port_address as usize;
        if idx >= self.slots.len() {
            return;
        }
        let now_nanos = epoch_nanos();
        let slot = &self.slots[idx];
        slot.buffer.update(data, sequence);
        slot.metrics.record_packet(sequence, now_nanos);
        if source_ip != 0 {
            slot.source_tracker.record(source_ip, physical, now_nanos);
        }
        if mark_nzs && physical != 0 {
            slot.has_nzs.store(true, Ordering::Release);
        }
        slot.initialized.store(true, Ordering::Release);
    }

    /// Snapshots the DMX data for a specific universe into `out`.
    ///
    /// Returns `false` if the universe has never received data or the
    /// port-address is out of the valid 15-bit range.
    pub fn snapshot(&self, port_address: u16, out: &mut [u8; DMX_CHANNELS_PER_UNIVERSE]) -> bool {
        let idx = port_address as usize;
        if idx >= self.slots.len() {
            return false;
        }
        let slot = &self.slots[idx];
        if !slot.initialized.load(Ordering::Acquire) {
            return false;
        }
        slot.buffer.snapshot(out);
        true
    }

    /// Returns a sorted list of all active (initialized) port-addresses.
    pub fn active_universes(&self) -> Vec<u16> {
        let mut out = Vec::new();
        self.active_universes_into(&mut out);
        out
    }

    /// Appends all active port-addresses to `out`, sorted by index.
    ///
    /// Reuses the caller's allocation to avoid per-call heap churn in
    /// tight IPC emit loops.
    pub fn active_universes_into(&self, out: &mut Vec<u16>) {
        out.clear();
        for (i, slot) in self.slots.iter().enumerate() {
            if slot.initialized.load(Ordering::Acquire) {
                out.push(i as u16);
            }
        }
    }

    /// Returns metrics for a universe: staleness, source count, sequence errors,
    /// and whether NZS (non-zero start code) traffic has been seen.
    ///
    /// Returns `None` if the universe has never received data.
    #[inline]
    pub fn slot_metrics(
        &self,
        port_address: u16,
    ) -> Option<(Staleness, u8, u64, bool)> {
        let idx = port_address as usize;
        if idx >= self.slots.len() {
            return None;
        }
        let slot = &self.slots[idx];
        if !slot.initialized.load(Ordering::Acquire) {
            return None;
        }
        let now_nanos = epoch_nanos();
        let staleness = slot.metrics.staleness(now_nanos);
        let source_count = slot.source_tracker.active_source_count(now_nanos);
        let seq_errors = slot.metrics.sequence_errors();
        let has_nzs = slot.has_nzs.load(Ordering::Acquire);
        Some((staleness, source_count, seq_errors, has_nzs))
    }

    /// Returns route info for a universe: source IPs, packets per second, last update time.
    ///
    /// Returns `(source_a_ip, source_b_ip, pkt_per_sec, last_update_nanos)`.
    /// Source IPs are IPv4 in network byte order (u32); 0 means no source.
    ///
    /// Returns `None` if the universe has never received data.
    #[inline]
    pub fn slot_route_info(
        &self,
        port_address: u16,
    ) -> Option<(u32, u32, u32, u64)> {
        let idx = port_address as usize;
        if idx >= self.slots.len() {
            return None;
        }
        let slot = &self.slots[idx];
        if !slot.initialized.load(Ordering::Acquire) {
            return None;
        }
        let now_nanos = epoch_nanos();
        let sources = slot.source_tracker.sources(now_nanos);
        let source_a_ip = sources[0].0;
        let source_b_ip = sources[1].0;
        let pkt_per_sec = slot.metrics.packets_per_second(now_nanos);
        let last_update_nanos = slot.buffer.last_update_nanos();
        Some((source_a_ip, source_b_ip, pkt_per_sec, last_update_nanos))
    }
}

impl Default for UniverseStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_universe_buffer_update_and_snapshot() {
        let buf = UniverseBuffer::new(1);
        let data = [42u8; 512];
        buf.update(&data, 1);

        let mut out = [0u8; 512];
        buf.snapshot(&mut out);
        assert_eq!(out[0], 42);
        assert_eq!(out[511], 42);
        assert_eq!(buf.sequence(), 1);
        assert_eq!(buf.packet_count(), 1);
    }

    #[test]
    fn test_universe_buffer_partial_update() {
        let buf = UniverseBuffer::new(1);
        let data = [0xFF; 128];
        buf.update(&data, 5);

        let mut out = [0u8; 512];
        buf.snapshot(&mut out);
        assert_eq!(out[0], 0xFF);
        assert_eq!(out[127], 0xFF);
        assert_eq!(out[128], 0x00);
    }

    #[test]
    fn test_universe_buffer_last_update_elapsed_none_before_update() {
        let buf = UniverseBuffer::new(1);
        assert!(buf.last_update_elapsed().is_none());
    }

    #[test]
    fn test_universe_buffer_last_update_elapsed_some_after_update() {
        let buf = UniverseBuffer::new(1);
        buf.update(&[0u8; 2], 0);
        let elapsed = buf.last_update_elapsed();
        assert!(elapsed.is_some());
        assert!(elapsed.map_or(false, |d| d < Duration::from_secs(1)));
    }

    #[test]
    fn test_universe_store_insert_and_query() {
        let store = UniverseStore::new();
        assert!(store.is_empty());

        store.update(0x0001, &[100u8; 512], 1, 0x0A000001, 0, false);
        store.update(0x0002, &[200u8; 512], 1, 0x0A000002, 0, false);

        assert_eq!(store.len(), 2);

        let mut out = [0u8; 512];
        assert!(store.snapshot(0x0001, &mut out));
        assert_eq!(out[0], 100);

        assert!(store.snapshot(0x0002, &mut out));
        assert_eq!(out[0], 200);

        assert!(!store.snapshot(0xFFFF, &mut out));
    }

    #[test]
    fn test_universe_store_active_universes_sorted() {
        let store = UniverseStore::new();
        store.update(0x0003, &[0; 2], 0, 0, 0, false);
        store.update(0x0001, &[0; 2], 0, 0, 0, false);
        store.update(0x0002, &[0; 2], 0, 0, 0, false);

        assert_eq!(store.active_universes(), vec![0x0001, 0x0002, 0x0003]);
    }

    #[test]
    fn test_universe_store_active_universes_into_reuses_allocation() {
        let store = UniverseStore::new();
        store.update(0x0010, &[0; 2], 0, 0, 0, false);
        store.update(0x0020, &[0; 2], 0, 0, 0, false);

        let mut buf = Vec::with_capacity(64);
        store.active_universes_into(&mut buf);
        assert_eq!(buf, vec![0x0010, 0x0020]);
        assert!(buf.capacity() >= 64);
    }

    #[test]
    fn test_universe_store_out_of_range_update_is_silent() {
        let store = UniverseStore::new();
        store.update(0xFFFF, &[0; 2], 0, 0, 0, false);
        assert!(store.is_empty());
    }

    #[test]
    fn test_universe_store_nzs_flag_set_when_mark_nzs_and_nonzero_physical() {
        let store = UniverseStore::new();
        store.update(0x0001, &[0x91, 0x80], 1, 0x0A000001, 0x91, true);
        let (_, _, _, has_nzs) = store.slot_metrics(0x0001).expect("slot exists");
        assert!(has_nzs, "NZS with start_code 0x91 must set has_nzs");
    }

    #[test]
    fn test_universe_store_nzs_flag_not_set_when_mark_nzs_but_zero_physical() {
        let store = UniverseStore::new();
        store.update(0x0001, &[0; 2], 1, 0x0A000001, 0, true);
        let (_, _, _, has_nzs) = store.slot_metrics(0x0001).expect("slot exists");
        assert!(!has_nzs, "NZS with start_code 0 must not set has_nzs");
    }

    #[test]
    fn test_universe_store_slot_route_info() {
        let store = UniverseStore::new();
        assert!(store.slot_route_info(0x0001).is_none());

        store.update(0x0001, &[100u8; 512], 1, 0x0A000001, 0, false);
        let (src_a, src_b, pkt, last) = store.slot_route_info(0x0001).expect("slot exists");
        assert_eq!(src_a, 0x0A000001);
        assert_eq!(src_b, 0);
        assert!(pkt >= 1);
        assert!(last > 0);

        store.update(0x0001, &[100u8; 512], 2, 0x0A000002, 0, false);
        let (src_a, src_b, _, _) = store.slot_route_info(0x0001).expect("slot exists");
        assert!(src_a == 0x0A000001 || src_a == 0x0A000002);
        assert!(src_b == 0x0A000001 || src_b == 0x0A000002);
    }
}
