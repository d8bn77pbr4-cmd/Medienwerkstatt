#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod error;
mod keychain;
mod paths;
mod versions;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::load_state,
            commands::save_state,
            commands::project_dir,
            commands::load_project,
            commands::save_project,
            commands::save_project_version,
            commands::list_project_versions,
            commands::restore_project_version,
            commands::save_state_version,
            commands::pick_media_files,
            commands::import_media,
            commands::create_proxy,
            commands::write_file,
            commands::run_ffmpeg,
            commands::analyze,
            commands::extract_frames,
            commands::has_gemini_key,
            commands::set_gemini_key,
            commands::gemini_list_models,
            commands::gemini_generate,
            commands::reveal_in_finder,
        ])
        .run(tauri::generate_context!())
        .expect("Medienwerkstatt konnte nicht gestartet werden");
}
