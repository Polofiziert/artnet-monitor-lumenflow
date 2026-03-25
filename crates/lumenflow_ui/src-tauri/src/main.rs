#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod network_commands;
mod viewport_culler;

use std::sync::Arc;
use std::sync::atomic::AtomicU64;

use dashmap::DashMap;
use dashmap::DashSet;
use parking_lot::RwLock;
use tracing_subscriber::EnvFilter;
use lumenflow_core::engine::DiagBuffer;
use lumenflow_core::{DeviceRegistry, JitterCollector, SyncDetector, UniverseStore};
use tauri::Manager;

use network_commands::{
    get_network_interfaces_cmd, get_network_settings_cmd, init_network_state,
    set_network_settings_cmd,
};
use viewport_culler::{
    get_artnet_products, get_available_universes, get_controllers, get_devices, get_diag_entries,
    request_device_url, send_art_address, send_ip_prog, set_active_universes, start_emit_loop, start_network_listeners,
    AppState,
};

fn main() {
    // Initialize tracing so RUST_LOG (e.g. lumenflow_core=debug,lumenflow_ui=debug) takes effect.
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let state = AppState {
        universe_store: Arc::new(UniverseStore::new()),
        active_ids: Arc::new(DashSet::new()),
        device_registry: Arc::new(DeviceRegistry::new()),
        device_version: Arc::new(AtomicU64::new(0)),
        controllers_seen: Arc::new(DashMap::new()),
        listener_tx: Arc::new(RwLock::new(None)),
        sync_detector: Arc::new(SyncDetector::new()),
        diag_buffer: Arc::new(DiagBuffer::new()),
        jitter_collector: Arc::new(JitterCollector::new()),
    };

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![
            set_active_universes,
            get_available_universes,
            get_devices,
            get_artnet_products,
            get_controllers,
            get_diag_entries,
            send_ip_prog,
            send_art_address,
            request_device_url,
            get_network_interfaces_cmd,
            get_network_settings_cmd,
            set_network_settings_cmd,
        ])
        .setup(|app| {
            let (network_state, config_rx) = init_network_state(&app.handle().clone());
            app.manage(network_state);

            let state = app.state::<AppState>();
            start_network_listeners(app.handle().clone(), state.inner().clone(), config_rx);
            start_emit_loop(app.handle().clone(), state.inner());

            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
    {
        eprintln!("LumenFlow failed to start: {e}");
        std::process::exit(1);
    }
}
