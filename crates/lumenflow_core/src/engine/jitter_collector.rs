//! Lock-free aggregate jitter collector.
//!
//! Tracks inter-packet arrival intervals across all ArtDmx/ArtNzs packets.
//! Used by the Network Diagnostics UI to display real-time jitter.

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

const SAMPLE_COUNT: usize = 80;

/// Lock-free aggregate jitter collector.
///
/// Tracks inter-packet arrival intervals (in nanoseconds) across all universes.
/// Single producer: only the UDP listener thread calls `record()`.
/// Single consumer: the emit loop calls `snapshot()` at ~10 Hz.
///
/// # Concurrency
///
/// Uses `Acquire`/`Release` ordering. Store sample before incrementing `write_idx`
/// so `snapshot()` never sees a new index with an unwritten slot.
/// `snapshot()` may be up to one slot behind — acceptable for chart display.
pub struct JitterCollector {
    last_packet_nanos: AtomicU64,
    samples: [AtomicU64; SAMPLE_COUNT],
    write_idx: AtomicUsize,
}

impl JitterCollector {
    /// Creates a new collector with no prior packet timestamps.
    pub fn new() -> Self {
        Self {
            last_packet_nanos: AtomicU64::new(0),
            samples: std::array::from_fn(|_| AtomicU64::new(0)),
            write_idx: AtomicUsize::new(0),
        }
    }

    /// Records reception of an ArtDmx or ArtNzs packet.
    ///
    /// Computes the inter-packet interval (delta) since the last packet and
    /// pushes it into the ring buffer. The first packet produces no delta.
    ///
    /// # Errors
    ///
    /// Infallible. No panics, no allocations.
    #[inline]
    pub fn record(&self, now_nanos: u64) {
        let prev = self.last_packet_nanos.load(Ordering::Acquire);
        self.last_packet_nanos.store(now_nanos, Ordering::Release);

        if prev == 0 {
            return;
        }

        let delta = now_nanos.saturating_sub(prev);
        let idx = self.write_idx.load(Ordering::Acquire) % SAMPLE_COUNT;
        self.samples[idx].store(delta, Ordering::Release);
        self.write_idx.fetch_add(1, Ordering::Release);
    }

    /// Returns a copy of the current jitter samples in nanoseconds, oldest to newest.
    ///
    /// Caller should convert to milliseconds for display: `ns as f64 / 1e6`.
    /// May be up to one slot behind the latest `record()`.
    ///
    /// # Errors
    ///
    /// Infallible. Allocates a `Vec` — caller should not invoke in hot path.
    pub fn snapshot(&self) -> Vec<u64> {
        let idx = self.write_idx.load(Ordering::Acquire);
        let len = idx.min(SAMPLE_COUNT);
        if len == 0 {
            return Vec::new();
        }
        let start = if idx >= SAMPLE_COUNT {
            (idx - SAMPLE_COUNT) % SAMPLE_COUNT
        } else {
            0
        };
        (0..len)
            .map(|i| self.samples[(start + i) % SAMPLE_COUNT].load(Ordering::Acquire))
            .collect()
    }
}

impl Default for JitterCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_packet_produces_no_delta() {
        let c = JitterCollector::new();
        c.record(1_000_000);
        let snap = c.snapshot();
        assert!(snap.is_empty());
    }

    #[test]
    fn second_packet_produces_delta() {
        let c = JitterCollector::new();
        c.record(1_000_000);
        c.record(1_000_000 + 25_000_000); // 25ms later
        let snap = c.snapshot();
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0], 25_000_000);
    }

    #[test]
    fn ring_buffer_wraps() {
        let c = JitterCollector::new();
        c.record(0);
        for i in 1..=100 {
            c.record(i * 22_000_000); // 22ms intervals
        }
        let snap = c.snapshot();
        assert_eq!(snap.len(), SAMPLE_COUNT);
    }
}
