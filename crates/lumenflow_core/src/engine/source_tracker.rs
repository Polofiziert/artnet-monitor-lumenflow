use std::sync::atomic::{AtomicU32, AtomicU64, AtomicU8, Ordering};

const STALE_TIMEOUT_NANOS: u64 = 10_000_000_000;

/// Tracks up to two distinct source IPs sending ArtDmx to a single universe.
///
/// Art-Net spec allows at most two sources per port-address (for HTP/LTP merging
/// at the receiving node). LumenFlow does **not** merge — it detects and
/// visualises merge conditions. When `active_source_count() >= 2`, the UI
/// displays a "MERGE" badge.
///
/// All fields are atomic — the struct is fully lock-free and can be embedded
/// directly in a `UniverseBuffer` on the hot path.
pub struct SourceTracker {
    source_a_ip: AtomicU32,
    source_a_physical: AtomicU8,
    source_a_last_nanos: AtomicU64,
    source_b_ip: AtomicU32,
    source_b_physical: AtomicU8,
    source_b_last_nanos: AtomicU64,
}

impl SourceTracker {
    /// Creates a new tracker with both slots empty.
    pub fn new() -> Self {
        Self {
            source_a_ip: AtomicU32::new(0),
            source_a_physical: AtomicU8::new(0),
            source_a_last_nanos: AtomicU64::new(0),
            source_b_ip: AtomicU32::new(0),
            source_b_physical: AtomicU8::new(0),
            source_b_last_nanos: AtomicU64::new(0),
        }
    }

    /// Records an ArtDmx packet from the given source.
    ///
    /// Slot assignment logic:
    /// 1. If `ip` matches an existing slot, update its timestamp and physical port.
    /// 2. If a slot is empty (`ip == 0`), claim it via CAS.
    /// 3. If both slots are occupied, check for a stale source (>10 s) and reclaim.
    /// 4. If both slots are active, the packet is ignored (spec: max 2 sources).
    ///
    /// `ip` is the sender's IPv4 address as a `u32` (network byte order).
    /// A value of `0` is reserved as the empty sentinel and must not be passed.
    pub fn record(&self, ip: u32, physical: u8, now_nanos: u64) {
        let ip_a = self.source_a_ip.load(Ordering::Acquire);
        if ip_a == ip {
            self.source_a_physical.store(physical, Ordering::Relaxed);
            self.source_a_last_nanos.store(now_nanos, Ordering::Release);
            return;
        }

        let ip_b = self.source_b_ip.load(Ordering::Acquire);
        if ip_b == ip {
            self.source_b_physical.store(physical, Ordering::Relaxed);
            self.source_b_last_nanos.store(now_nanos, Ordering::Release);
            return;
        }

        if ip_a == 0
            && self.source_a_ip.compare_exchange(0, ip, Ordering::AcqRel, Ordering::Acquire).is_ok()
        {
            self.source_a_physical.store(physical, Ordering::Relaxed);
            self.source_a_last_nanos.store(now_nanos, Ordering::Release);
            return;
        }

        if ip_b == 0
            && self.source_b_ip.compare_exchange(0, ip, Ordering::AcqRel, Ordering::Acquire).is_ok()
        {
            self.source_b_physical.store(physical, Ordering::Relaxed);
            self.source_b_last_nanos.store(now_nanos, Ordering::Release);
            return;
        }

        let ip_a = self.source_a_ip.load(Ordering::Acquire);
        if ip_a != 0 && ip_a != ip {
            let last_a = self.source_a_last_nanos.load(Ordering::Acquire);
            if now_nanos.saturating_sub(last_a) >= STALE_TIMEOUT_NANOS
                && self.source_a_ip.compare_exchange(ip_a, ip, Ordering::AcqRel, Ordering::Acquire).is_ok()
            {
                self.source_a_physical.store(physical, Ordering::Relaxed);
                self.source_a_last_nanos.store(now_nanos, Ordering::Release);
                return;
            }
        }

        let ip_b = self.source_b_ip.load(Ordering::Acquire);
        if ip_b != 0 && ip_b != ip {
            let last_b = self.source_b_last_nanos.load(Ordering::Acquire);
            if now_nanos.saturating_sub(last_b) >= STALE_TIMEOUT_NANOS
                && self.source_b_ip.compare_exchange(ip_b, ip, Ordering::AcqRel, Ordering::Acquire).is_ok()
            {
                self.source_b_physical.store(physical, Ordering::Relaxed);
                self.source_b_last_nanos.store(now_nanos, Ordering::Release);
            }
        }
    }

    /// Returns the number of sources that sent a packet within the last 10 seconds.
    ///
    /// - `0` — no active sources (universe idle)
    /// - `1` — single source (normal)
    /// - `2` — merge condition detected
    pub fn active_source_count(&self, now_nanos: u64) -> u8 {
        let mut count = 0u8;
        let ip_a = self.source_a_ip.load(Ordering::Acquire);
        if ip_a != 0 {
            let last = self.source_a_last_nanos.load(Ordering::Acquire);
            if now_nanos.saturating_sub(last) < STALE_TIMEOUT_NANOS { count += 1; }
        }
        let ip_b = self.source_b_ip.load(Ordering::Acquire);
        if ip_b != 0 {
            let last = self.source_b_last_nanos.load(Ordering::Acquire);
            if now_nanos.saturating_sub(last) < STALE_TIMEOUT_NANOS { count += 1; }
        }
        count
    }

    /// Returns `(ip, physical)` tuples for each slot. Active sources have `ip != 0`;
    /// stale or empty slots are returned as `(0, 0)`.
    pub fn sources(&self, now_nanos: u64) -> [(u32, u8); 2] {
        [
            self.load_slot(&self.source_a_ip, &self.source_a_physical, &self.source_a_last_nanos, now_nanos),
            self.load_slot(&self.source_b_ip, &self.source_b_physical, &self.source_b_last_nanos, now_nanos),
        ]
    }

    /// Clears both source slots, resetting the tracker to its initial state.
    pub fn reset(&self) {
        self.source_a_ip.store(0, Ordering::Release);
        self.source_a_physical.store(0, Ordering::Relaxed);
        self.source_a_last_nanos.store(0, Ordering::Release);
        self.source_b_ip.store(0, Ordering::Release);
        self.source_b_physical.store(0, Ordering::Relaxed);
        self.source_b_last_nanos.store(0, Ordering::Release);
    }

    fn load_slot(&self, ip_atom: &AtomicU32, phys_atom: &AtomicU8, ts_atom: &AtomicU64, now_nanos: u64) -> (u32, u8) {
        let ip = ip_atom.load(Ordering::Acquire);
        if ip == 0 { return (0, 0); }
        let last = ts_atom.load(Ordering::Acquire);
        if now_nanos.saturating_sub(last) < STALE_TIMEOUT_NANOS {
            (ip, phys_atom.load(Ordering::Relaxed))
        } else {
            (0, 0)
        }
    }
}

impl Default for SourceTracker {
    fn default() -> Self { Self::new() }
}

#[cfg(test)]
mod tests {
    use super::*;
    const IP_A: u32 = 0x0A000001;
    const IP_B: u32 = 0x0A000002;
    const IP_C: u32 = 0x0A000003;
    const T0: u64 = 1_000_000_000_000;

    #[test] fn single_source_count_is_one() {
        let st = SourceTracker::new();
        st.record(IP_A, 0, T0);
        assert_eq!(st.active_source_count(T0 + 1_000_000), 1);
    }
    #[test] fn two_different_ips_count_is_two() {
        let st = SourceTracker::new();
        st.record(IP_A, 0, T0);
        st.record(IP_B, 0, T0 + 100);
        assert_eq!(st.active_source_count(T0 + 1_000_000), 2);
    }
    #[test] fn third_ip_ignored_count_stays_two() {
        let st = SourceTracker::new();
        st.record(IP_A, 0, T0);
        st.record(IP_B, 0, T0 + 100);
        st.record(IP_C, 0, T0 + 200);
        assert_eq!(st.active_source_count(T0 + 1_000_000), 2);
        let srcs = st.sources(T0 + 1_000_000);
        let ips: Vec<u32> = srcs.iter().map(|s| s.0).filter(|&ip| ip != 0).collect();
        assert!(ips.contains(&IP_A));
        assert!(ips.contains(&IP_B));
    }
    #[test] fn source_goes_stale_after_10s() {
        let st = SourceTracker::new();
        st.record(IP_A, 0, T0);
        st.record(IP_B, 0, T0);
        assert_eq!(st.active_source_count(T0 + 9_999_999_999), 2);
        assert_eq!(st.active_source_count(T0 + STALE_TIMEOUT_NANOS), 0);
    }
    #[test] fn stale_slot_reclaimed_by_new_ip() {
        let st = SourceTracker::new();
        st.record(IP_A, 0, T0);
        st.record(IP_B, 0, T0);
        let t_stale = T0 + STALE_TIMEOUT_NANOS;
        st.record(IP_C, 1, t_stale);
        assert_eq!(st.active_source_count(t_stale + 1_000), 1);
        let srcs = st.sources(t_stale + 1_000);
        let ips: Vec<u32> = srcs.iter().map(|s| s.0).filter(|&ip| ip != 0).collect();
        assert!(ips.contains(&IP_C));
    }
    #[test] fn same_ip_different_physical_still_tracked() {
        let st = SourceTracker::new();
        st.record(IP_A, 0, T0);
        st.record(IP_A, 1, T0 + 500);
        assert_eq!(st.active_source_count(T0 + 1_000), 1);
        assert_eq!(st.sources(T0 + 1_000)[0], (IP_A, 1));
    }
    #[test] fn reset_clears_all() {
        let st = SourceTracker::new();
        st.record(IP_A, 0, T0);
        st.record(IP_B, 1, T0);
        st.reset();
        assert_eq!(st.active_source_count(T0 + 1_000), 0);
    }
    #[test] fn sources_returns_empty_when_fresh() {
        let st = SourceTracker::new();
        assert_eq!(st.sources(T0), [(0, 0), (0, 0)]);
    }
    #[test] fn partial_staleness_reduces_count() {
        let st = SourceTracker::new();
        st.record(IP_A, 0, T0);
        st.record(IP_B, 0, T0 + 5_000_000_000);
        assert_eq!(st.active_source_count(T0 + STALE_TIMEOUT_NANOS), 1);
    }
    #[test] fn update_refreshes_timestamp() {
        let st = SourceTracker::new();
        st.record(IP_A, 0, T0);
        st.record(IP_A, 0, T0 + 9_000_000_000);
        assert_eq!(st.active_source_count(T0 + 9_000_000_000 + 9_999_999_999), 1);
    }
}
