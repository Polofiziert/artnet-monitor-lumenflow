use std::sync::atomic::{AtomicU32, AtomicU64, AtomicU8, Ordering};

/// Art-Net spec: sources re-transmit every 800 ms–1 s. After 800 ms without
/// a packet, treat as stale and emit zeros (universe goes quiet).
const STALE_THRESHOLD_NANOS: u64 = 800_000_000;
const DISCONNECT_THRESHOLD_NANOS: u64 = 4_000_000_000;
const RATE_WINDOW_NANOS: u64 = 1_000_000_000;

/// Liveness state of a universe based on time since last ArtDmx packet.
///
/// Art-Net spec requires active universes to re-transmit every 800 ms–1 s
/// even when data doesn't change. These thresholds detect when that stops.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Staleness {
    /// Received a packet within the last 1.5 seconds.
    Active,
    /// No packet for 1.5–4 seconds — amber badge in UI.
    Stale,
    /// No packet for over 4 seconds — source has disconnected.
    Disconnected,
}

/// Per-universe health metrics tracked on the hot path.
///
/// Covers sequence-error detection, packet rate, and staleness — the three
/// signals the UI needs beyond raw DMX channel data. Embedded alongside
/// `UniverseBuffer` (one instance per active port-address).
///
/// All state is atomic — fully lock-free, no Mutex/RwLock.
pub struct UniverseMetrics {
    sequence_errors: AtomicU64,
    last_sequence: AtomicU8,
    packets_total: AtomicU64,
    packets_this_window: AtomicU32,
    last_rate_reset_nanos: AtomicU64,
    last_update_nanos: AtomicU64,
}

impl UniverseMetrics {
    /// Creates metrics in the initial state: no packets, no errors.
    pub fn new() -> Self {
        Self {
            sequence_errors: AtomicU64::new(0),
            last_sequence: AtomicU8::new(0),
            packets_total: AtomicU64::new(0),
            packets_this_window: AtomicU32::new(0),
            last_rate_reset_nanos: AtomicU64::new(0),
            last_update_nanos: AtomicU64::new(0),
        }
    }

    /// Records reception of an ArtDmx packet for this universe.
    ///
    /// Sequence-error detection follows the Art-Net 4 spec:
    /// - Sequence `0` disables sequencing — no error checking is performed.
    /// - Otherwise the expected next value is `(last % 255) + 1`, which
    ///   correctly wraps `255 → 1` (skipping `0`).
    /// - A mismatch increments the `sequence_errors` counter.
    ///
    /// Called from the single-producer network ingest thread.
    pub fn record_packet(&self, sequence: u8, now_nanos: u64) {
        let last = self.last_sequence.load(Ordering::Acquire);
        if sequence != 0 && last != 0 {
            let expected = (last % 255) + 1;
            if sequence != expected {
                self.sequence_errors.fetch_add(1, Ordering::Relaxed);
            }
        }
        self.last_sequence.store(sequence, Ordering::Release);
        self.packets_total.fetch_add(1, Ordering::Relaxed);
        self.packets_this_window.fetch_add(1, Ordering::Relaxed);
        self.last_update_nanos.store(now_nanos, Ordering::Release);
    }

    /// Returns the cumulative count of out-of-order / dropped packets.
    pub fn sequence_errors(&self) -> u64 {
        self.sequence_errors.load(Ordering::Relaxed)
    }

    /// Returns the approximate packets-per-second rate.
    ///
    /// If more than 1 second has elapsed since the last window reset, the
    /// accumulated count is returned and the window is reset atomically.
    /// If less than 1 second has elapsed, the current partial count is
    /// returned (it will converge to the true rate on the next window).
    ///
    /// Multiple concurrent readers are safe: only one will win the CAS
    /// to reset the window; others receive the current partial count.
    pub fn packets_per_second(&self, now_nanos: u64) -> u32 {
        let last_reset = self.last_rate_reset_nanos.load(Ordering::Acquire);
        let elapsed = now_nanos.saturating_sub(last_reset);
        if elapsed >= RATE_WINDOW_NANOS
            && self.last_rate_reset_nanos.compare_exchange(
                last_reset, now_nanos, Ordering::AcqRel, Ordering::Relaxed
            ).is_ok()
        {
            return self.packets_this_window.swap(0, Ordering::AcqRel);
        }
        self.packets_this_window.load(Ordering::Relaxed)
    }

    /// Classifies universe liveness based on time since the last packet.
    ///
    /// - `Active`       — received within 800 ms (normal)
    /// - `Stale`        — 800 ms – 4 s since last packet (amber warning)
    /// - `Disconnected` — over 4 s since last packet (source gone)
    ///
    /// Returns `Disconnected` if no packet has ever been received.
    pub fn staleness(&self, now_nanos: u64) -> Staleness {
        let last = self.last_update_nanos.load(Ordering::Acquire);
        if last == 0 { return Staleness::Disconnected; }
        let elapsed = now_nanos.saturating_sub(last);
        if elapsed < STALE_THRESHOLD_NANOS {
            Staleness::Active
        } else if elapsed < DISCONNECT_THRESHOLD_NANOS {
            Staleness::Stale
        } else {
            Staleness::Disconnected
        }
    }
}

impl Default for UniverseMetrics {
    fn default() -> Self { Self::new() }
}

#[cfg(test)]
mod tests {
    use super::*;
    const T0: u64 = 1_000_000_000_000;

    #[test] fn sequential_packets_no_errors() {
        let m = UniverseMetrics::new();
        m.record_packet(1, T0);
        m.record_packet(2, T0 + 25_000_000);
        m.record_packet(3, T0 + 50_000_000);
        assert_eq!(m.sequence_errors(), 0);
    }
    #[test] fn out_of_order_packet_increments_error() {
        let m = UniverseMetrics::new();
        m.record_packet(1, T0);
        m.record_packet(3, T0 + 25_000_000);
        assert_eq!(m.sequence_errors(), 1);
    }
    #[test] fn sequence_wraps_255_to_1_no_error() {
        let m = UniverseMetrics::new();
        m.record_packet(254, T0);
        m.record_packet(255, T0 + 25_000_000);
        m.record_packet(1, T0 + 50_000_000);
        assert_eq!(m.sequence_errors(), 0);
    }
    #[test] fn sequence_disabled_zero_no_tracking() {
        let m = UniverseMetrics::new();
        m.record_packet(0, T0);
        m.record_packet(0, T0 + 25_000_000);
        assert_eq!(m.sequence_errors(), 0);
    }
    #[test] fn sequence_zero_incoming_skips_check() {
        let m = UniverseMetrics::new();
        m.record_packet(5, T0);
        m.record_packet(0, T0 + 25_000_000);
        assert_eq!(m.sequence_errors(), 0);
    }
    #[test] fn sequence_zero_last_skips_check() {
        let m = UniverseMetrics::new();
        m.record_packet(0, T0);
        m.record_packet(5, T0 + 25_000_000);
        assert_eq!(m.sequence_errors(), 0);
    }
    #[test] fn multiple_sequence_errors_accumulate() {
        let m = UniverseMetrics::new();
        m.record_packet(1, T0);
        m.record_packet(5, T0 + 25_000_000);
        m.record_packet(10, T0 + 50_000_000);
        assert_eq!(m.sequence_errors(), 2);
    }
    #[test] fn packets_per_second_counts_window() {
        let m = UniverseMetrics::new();
        for i in 0..44u32 {
            m.record_packet(0, T0 + u64::from(i) * 22_000_000);
        }
        let rate = m.packets_per_second(T0 + 1_100_000_000);
        assert_eq!(rate, 44);
        assert_eq!(m.packets_per_second(T0 + 1_100_000_001), 0);
    }
    #[test] fn packets_per_second_partial_window() {
        let m = UniverseMetrics::new();
        m.last_rate_reset_nanos.store(T0, Ordering::Release);
        m.record_packet(0, T0 + 10_000_000);
        m.record_packet(0, T0 + 20_000_000);
        assert_eq!(m.packets_per_second(T0 + 500_000_000), 2);
    }
    #[test] fn staleness_active_within_threshold() {
        let m = UniverseMetrics::new();
        m.record_packet(1, T0);
        assert_eq!(m.staleness(T0 + 100_000_000), Staleness::Active);
        assert_eq!(m.staleness(T0 + 799_999_999), Staleness::Active);
    }
    #[test] fn staleness_stale_between_thresholds() {
        let m = UniverseMetrics::new();
        m.record_packet(1, T0);
        assert_eq!(m.staleness(T0 + 800_000_000), Staleness::Stale);
        assert_eq!(m.staleness(T0 + 3_999_999_999), Staleness::Stale);
    }
    #[test] fn staleness_disconnected_past_threshold() {
        let m = UniverseMetrics::new();
        m.record_packet(1, T0);
        assert_eq!(m.staleness(T0 + 4_000_000_000), Staleness::Disconnected);
    }
    #[test] fn staleness_disconnected_when_never_updated() {
        let m = UniverseMetrics::new();
        assert_eq!(m.staleness(T0), Staleness::Disconnected);
    }
    #[test] fn total_packet_count_increments() {
        let m = UniverseMetrics::new();
        m.record_packet(1, T0);
        m.record_packet(2, T0 + 25_000_000);
        m.record_packet(3, T0 + 50_000_000);
        assert_eq!(m.packets_total.load(Ordering::Relaxed), 3);
    }
}
