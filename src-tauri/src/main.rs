#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod workspace;
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::Manager;
use workspace::{Document, Snapshot, Workspace};
struct Store {
    workspace: Mutex<Workspace>,
    config: PathBuf,
}
#[tauri::command]
fn snapshot(state: tauri::State<Store>) -> Result<Snapshot, String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .snapshot()
}
#[tauri::command]
fn read_note(state: tauri::State<Store>, path: String) -> Result<Document, String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .read(&path)
}
#[tauri::command]
fn write_note(
    state: tauri::State<Store>,
    path: String,
    content: String,
    revision: String,
) -> Result<Document, String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .write(&path, &content, &revision)
}
#[tauri::command]
fn create_entry(
    state: tauri::State<Store>,
    parent: String,
    kind: String,
    name: String,
) -> Result<String, String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .create(&parent, &kind, &name)
}
#[tauri::command]
fn relocate_entry(
    state: tauri::State<Store>,
    path: String,
    parent: String,
    name: String,
) -> Result<String, String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .relocate(&path, &parent, &name)
}
#[tauri::command]
fn delete_entry(state: tauri::State<Store>, path: String) -> Result<(), String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&path)
}
#[tauri::command]
fn reveal_vault(state: tauri::State<Store>, path: String) -> Result<(), String> {
    let workspace = state.workspace.lock().map_err(|e| e.to_string())?;
    if path.is_empty() || path.contains('/') {
        return Err("Choose a vault.".into());
    }
    let folder = workspace.resolve(&path)?;
    if !folder.is_dir() {
        return Err("This vault no longer exists.".into());
    }
    // Pass a validated path as one argument, never a shell command string.
    std::process::Command::new("explorer.exe")
        .arg(folder.to_string_lossy().trim_start_matches("\\\\?\\"))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn choose_root(state: tauri::State<'_, Store>) -> Result<bool, String> {
    let Some(folder) = rfd::AsyncFileDialog::new()
        .set_title("Choose your Notus workspace folder")
        .pick_folder()
        .await
    else {
        return Ok(false);
    };
    let next = Workspace::new(folder.path().into())?;
    fs::write(
        &state.config,
        serde_json::to_string(&next.root).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    *state.workspace.lock().map_err(|e| e.to_string())? = next;
    Ok(true)
}
#[tauri::command]
async fn import_vault(state: tauri::State<'_, Store>) -> Result<Option<String>, String> {
    let Some(folder) = rfd::AsyncFileDialog::new()
        .set_title("Import a vault (copies files; originals stay in place)")
        .pick_folder()
        .await
    else {
        return Ok(None);
    };
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .import(folder.path())
        .map(Some)
}
fn main() {
    // Explicit workspace overrides support isolated UI tests alongside the user's app.
    // Ordinary launches still enforce a single instance and never open a debug port.
    let builder = tauri::Builder::default();
    let builder = if std::env::var_os("NOTUS_ROOT").is_none() {
        builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
    } else {
        builder
    };
    builder
        .setup(|app| {
            let config_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&config_dir)?;
            let config = config_dir.join("workspace.json");
            let root = std::env::var_os("NOTUS_ROOT")
                .map(PathBuf::from)
                .or_else(|| {
                    fs::read_to_string(&config)
                        .ok()
                        .and_then(|s| serde_json::from_str::<PathBuf>(&s).ok())
                })
                .unwrap_or(app.path().document_dir()?.join("Notus"));
            app.manage(Store {
                workspace: Mutex::new(Workspace::new(root).map_err(std::io::Error::other)?),
                config,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            read_note,
            write_note,
            create_entry,
            relocate_entry,
            delete_entry,
            reveal_vault,
            choose_root,
            import_vault
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Notus");
}
