#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // FS access is enforced by Tauri capability system. The frontend can only access paths
    // allowed in capabilities/default.json (e.g. $HOME/.freecord/plugins/*). No Rust
    // code bypasses this; all fs operations go through the plugin IPC.
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register("nexchat")?;
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
