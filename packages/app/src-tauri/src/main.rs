//! Collecto's manager: everything that writes to the board, as a window.
//!
//! The website only displays. Naming a collection, filling it, moving an image between
//! shelves and removing one all happen here, with the database login and bucket key compiled
//! into this build. Uploading is mostly compression — lossless, in each image's own format —
//! which is CPU work that belongs on your machine rather than a serverless function.

// No console window behind the app in a release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod activity;
mod cache;
mod collections;
mod commands;
mod compress;
mod config;
mod data;
mod db;
mod image_cache;
mod jpeg;
mod names;
mod paths;
mod prefs;
mod protocol;
mod staging;
mod store;
mod time;

use tauri::Manager;

fn main() {
    // reqwest is built without a crypto provider (see Cargo.toml); `ring` is the one sqlx
    // already uses. Installed before any request can be made.
    let _ = rustls::crypto::ring::default_provider().install_default();

    tauri::Builder::default()
        // One window: a second launch raises the first rather than starting another copy
        // against the same board, which would happily upload the same image twice.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, |_ctx, request, responder| {
            protocol::handle(request, responder)
        })
        .setup(|app| {
            paths::init(app.handle())?;
            activity::init(app.handle().clone());
            staging::clean_downloads();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_status,
            commands::save_preferences,
            commands::choose_files,
            commands::stage_files,
            commands::fetch_images,
            commands::list_collections,
            commands::create_collection,
            commands::edit_collection,
            commands::delete_collection,
            commands::list_collection_posts,
            commands::upload_to_collection,
            commands::save_collection_post,
            commands::move_collection_posts,
            commands::delete_collection_post,
            commands::list_logs,
            commands::clear_logs,
            commands::clear_cache,
            commands::open_external,
            commands::open_data_folder,
        ])
        .build(tauri::generate_context!())
        .expect("Collecto could not start")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                staging::clean_downloads();
            }
        });
}
