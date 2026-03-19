/// Monitoring engine components — protocol *behaviour* detection separated
/// from wire-format parsing (which lives in `crate::artnet`).
///
/// All types in this module are fully lock-free (atomics only, no Mutex/RwLock)
/// and designed to sit on the hot path alongside `UniverseBuffer`.
pub mod diag_buffer;
pub mod discovery;
pub mod jitter_collector;
pub mod source_tracker;
pub mod sync_detector;
pub mod universe_metrics;

pub use diag_buffer::{DiagBuffer, DiagEntry, DiagPriority};
pub use jitter_collector::JitterCollector;
pub use discovery::{
    parse_discovery_targets_from_env, spawn_discovery, spawn_discovery_with_config,
    DiscoveryConfig,
};
pub use source_tracker::SourceTracker;
pub use sync_detector::SyncDetector;
pub use universe_metrics::{Staleness, UniverseMetrics};
