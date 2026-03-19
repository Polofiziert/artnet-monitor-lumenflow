use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

const SYNC_TIMEOUT_NANOS: u64 = 4_000_000_000;

/// Detects the presence of ArtSync packets on the network.
///
/// LumenFlow is a **monitor** — it does not perform synchronous DMX output.
/// This detector tracks whether any controller is sending ArtSync so the UI
/// can display a sync-mode indicator and correlate it with ArtDmx timing.
///
/// The 4-second timeout matches the Art-Net 4 spec: nodes exit sync mode
/// if no ArtSync arrives within that window.
///
/// Fully lock-free — safe to call from both the network ingest thread
/// and the UI/IPC read thread concurrently.
pub struct SyncDetector {
    active: AtomicBool,
    source_ip: AtomicU32,
    last_seen_nanos: AtomicU64,
}

impl SyncDetector {
    /// Creates a detector with no sync activity recorded.
    pub fn new() -> Self {
        Self {
            active: AtomicBool::new(false),
            source_ip: AtomicU32::new(0),
            last_seen_nanos: AtomicU64::new(0),
        }
    }

    /// Records reception of an ArtSync packet.
    ///
    /// Called from the network ingest thread when OpCode 0x5200 is parsed.
    /// Updates the source IP, timestamp, and sets the active flag.
    pub fn on_sync(&self, source_ip: u32, now_nanos: u64) {
        self.source_ip.store(source_ip, Ordering::Release);
        self.last_seen_nanos.store(now_nanos, Ordering::Release);
        self.active.store(true, Ordering::Release);
    }

    /// Returns `true` if an ArtSync was received within the last 4 seconds.
    ///
    /// Returns `false` if no ArtSync has ever been received, or if the
    /// most recent one is older than the 4-second timeout.
    pub fn is_active(&self, now_nanos: u64) -> bool {
        if !self.active.load(Ordering::Acquire) { return false; }
        let last = self.last_seen_nanos.load(Ordering::Acquire);
        if last == 0 { return false; }
        now_nanos.saturating_sub(last) < SYNC_TIMEOUT_NANOS
    }

    /// Returns the IPv4 address (as `u32`) of the sync source, or `None`
    /// if no ArtSync has been recorded.
    ///
    /// This returns the IP regardless of timeout — use [`is_active`](Self::is_active)
    /// to check whether sync mode is currently in effect.
    pub fn source_ip(&self) -> Option<u32> {
        let ip = self.source_ip.load(Ordering::Acquire);
        if ip == 0 { None } else { Some(ip) }
    }

    /// Returns the epoch-nanos timestamp of the last received ArtSync.
    /// Returns `0` if no ArtSync has been received.
    pub fn last_seen_nanos(&self) -> u64 {
        self.last_seen_nanos.load(Ordering::Acquire)
    }
}

impl Default for SyncDetector {
    fn default() -> Self { Self::new() }
}

#[cfg(test)]
mod tests {
    use super::*;
    const CTRL_IP: u32 = 0x0A000064;
    const CTRL_IP_2: u32 = 0x0A0000C8;
    const T0: u64 = 1_000_000_000_000;

    #[test] fn no_sync_received_is_inactive() {
        let sd = SyncDetector::new();
        assert!(!sd.is_active(T0));
        assert_eq!(sd.source_ip(), None);
        assert_eq!(sd.last_seen_nanos(), 0);
    }
    #[test] fn sync_received_becomes_active() {
        let sd = SyncDetector::new();
        sd.on_sync(CTRL_IP, T0);
        assert!(sd.is_active(T0 + 1_000));
        assert_eq!(sd.source_ip(), Some(CTRL_IP));
    }
    #[test] fn sync_active_at_3_9_seconds() {
        let sd = SyncDetector::new();
        sd.on_sync(CTRL_IP, T0);
        assert!(sd.is_active(T0 + 3_900_000_000));
    }
    #[test] fn sync_inactive_at_4_1_seconds() {
        let sd = SyncDetector::new();
        sd.on_sync(CTRL_IP, T0);
        assert!(!sd.is_active(T0 + 4_100_000_000));
    }
    #[test] fn sync_inactive_at_exact_boundary() {
        let sd = SyncDetector::new();
        sd.on_sync(CTRL_IP, T0);
        assert!(!sd.is_active(T0 + SYNC_TIMEOUT_NANOS));
    }
    #[test] fn multiple_syncs_same_ip() {
        let sd = SyncDetector::new();
        sd.on_sync(CTRL_IP, T0);
        sd.on_sync(CTRL_IP, T0 + 1_000_000_000);
        sd.on_sync(CTRL_IP, T0 + 2_000_000_000);
        assert_eq!(sd.source_ip(), Some(CTRL_IP));
        assert!(sd.is_active(T0 + 5_999_999_999));
        assert!(!sd.is_active(T0 + 6_000_000_000));
    }
    #[test] fn sync_from_new_ip_updates_source() {
        let sd = SyncDetector::new();
        sd.on_sync(CTRL_IP, T0);
        sd.on_sync(CTRL_IP_2, T0 + 500_000_000);
        assert_eq!(sd.source_ip(), Some(CTRL_IP_2));
        assert!(sd.is_active(T0 + 500_000_000 + 1_000));
    }
    #[test] fn last_seen_updates_on_each_sync() {
        let sd = SyncDetector::new();
        sd.on_sync(CTRL_IP, T0);
        assert_eq!(sd.last_seen_nanos(), T0);
        sd.on_sync(CTRL_IP, T0 + 1_000_000_000);
        assert_eq!(sd.last_seen_nanos(), T0 + 1_000_000_000);
    }
    #[test] fn source_ip_persists_after_timeout() {
        let sd = SyncDetector::new();
        sd.on_sync(CTRL_IP, T0);
        assert!(!sd.is_active(T0 + 5_000_000_000));
        assert_eq!(sd.source_ip(), Some(CTRL_IP));
    }
}
