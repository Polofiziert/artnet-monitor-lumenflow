//! Ring buffer for Art-Net diagnostic messages.
//!
//! Stores diagnostic entries from ArtDiagData packets with timestamps and
//! priority. Used by the UI to display a priority-colored log panel.

use std::sync::atomic::{AtomicUsize, Ordering};

const MAX_ENTRIES: usize = 512;
const MAX_MESSAGE_LEN: usize = 256;

/// Diagnostic priority from Art-Net 4 spec.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum DiagPriority {
    Low = 0x10,
    Med = 0x40,
    High = 0x80,
    Critical = 0xe0,
    Volatile = 0xf0,
}

impl DiagPriority {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0x10 => Self::Low,
            0x40 => Self::Med,
            0x80 => Self::High,
            0xe0 => Self::Critical,
            0xf0 => Self::Volatile,
            _ => Self::Low,
        }
    }
}

/// A single diagnostic log entry.
#[derive(Debug, Clone)]
pub struct DiagEntry {
    pub timestamp_nanos: u64,
    pub priority: DiagPriority,
    pub message: String,
    pub source_ip: Option<String>,
}

/// Lock-free ring buffer for diagnostic entries.
///
/// Uses a fixed array and atomic write index. Readers snapshot the
/// current entries. Entries are stored with a bounded message length.
pub struct DiagBuffer {
    entries: [std::sync::Mutex<Option<DiagEntry>>; MAX_ENTRIES],
    write_index: AtomicUsize,
}

impl Default for DiagBuffer {
    fn default() -> Self {
        Self::new()
    }
}

impl DiagBuffer {
    pub fn new() -> Self {
        Self {
            entries: std::array::from_fn(|_| std::sync::Mutex::new(None)),
            write_index: AtomicUsize::new(0),
        }
    }

    /// Pushes a new diagnostic entry. Truncates message to MAX_MESSAGE_LEN.
    pub fn push(&self, priority: DiagPriority, message: &[u8], source_ip: Option<&str>) {
        let timestamp = crate::epoch_nanos();
        let msg_str = String::from_utf8_lossy(message);
        let truncated: String = msg_str.chars().take(MAX_MESSAGE_LEN).collect();
        let src = source_ip.map(String::from);

        let idx = self.write_index.fetch_add(1, Ordering::Relaxed) % MAX_ENTRIES;
        if let Ok(mut guard) = self.entries[idx].lock() {
            *guard = Some(DiagEntry {
                timestamp_nanos: timestamp,
                priority,
                message: truncated,
                source_ip: src,
            });
        }
    }

    /// Returns a snapshot of the most recent entries (newest last).
    pub fn snapshot(&self) -> Vec<DiagEntry> {
        let mut out = Vec::with_capacity(MAX_ENTRIES);
        let start = self.write_index.load(Ordering::Acquire);
        for i in 0..MAX_ENTRIES {
            let idx = (start.wrapping_sub(1).wrapping_sub(i)) % MAX_ENTRIES;
            if let Ok(guard) = self.entries[idx].lock() {
                if let Some(ref e) = *guard {
                    out.push(e.clone());
                }
            }
        }
        out.reverse();
        out
    }
}
