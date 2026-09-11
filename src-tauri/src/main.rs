#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod conversion;
mod ai;
mod layout;
mod storage;
mod transfer;
mod windows;
mod workspace;
use notify::{event::ModifyKind, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};
use workspace::{Document, Snapshot, Workspace};
struct Store {
    workspace: Mutex<Workspace>,
    config: PathBuf,
    views: Mutex<std::collections::HashMap<String, Vec<String>>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    tab_strips: Mutex<std::collections::HashMap<String, TabStripBounds>>,
}

#[derive(Clone, serde::Deserialize)]
struct TabStripBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale: f64,
    client_origin_x: f64,
}

#[derive(serde::Deserialize)]
struct TabStripInput {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(serde::Serialize)]
struct TabDropTarget {
    label: String,
    client_x: f64,
}

#[tauri::command]
fn register_tab_strip(
    window: tauri::WebviewWindow,
    state: tauri::State<Store>,
    bounds: TabStripInput,
) -> Result<(), String> {
    if bounds.width <= 0.0 || bounds.height <= 0.0 || !bounds.x.is_finite() || !bounds.y.is_finite() {
        return Err("Invalid tab strip bounds.".into());
    }
    let origin = window.inner_position().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let physical = TabStripBounds {
        x: origin.x as f64 + bounds.x * scale,
        y: origin.y as f64 + bounds.y * scale,
        width: bounds.width * scale,
        height: bounds.height * scale,
        scale,
        client_origin_x: origin.x as f64,
    };
    state.tab_strips.lock().map_err(|e| e.to_string())?.insert(window.label().into(), physical);
    Ok(())
}

#[tauri::command]
fn tab_drop_target(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<Store>,
) -> Result<Option<TabDropTarget>, String> {
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let source = window.label();
    let mut strips = state.tab_strips.lock().map_err(|e| e.to_string())?;
    strips.retain(|label, _| app.get_webview_window(label).is_some());
    Ok(strips.iter().find_map(|(label, bounds)| {
        (label != source
            && cursor.x >= bounds.x
            && cursor.y >= bounds.y
            && cursor.x < bounds.x + bounds.width
            && cursor.y < bounds.y + bounds.height)
            .then(|| TabDropTarget {
                label: label.clone(),
                client_x: (cursor.x - bounds.client_origin_x) / bounds.scale,
            })
    }))
}

#[derive(Clone, serde::Serialize)]
struct WorkspaceChange {
    structural: bool,
}

fn watch_workspace(app: &tauri::AppHandle, state: &Store) -> Result<(), String> {
    let root = state.workspace.lock().map_err(|e| e.to_string())?.root.clone();
    let emitter = app.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event {
            // Content changes only reconcile open notes. A full tree walk is for
            // creates, deletes, and renames, rather than every autosave.
            let structural = matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
            );
            let _ = emitter.emit("lotus-workspace-changed", WorkspaceChange { structural });
        }
    }).map_err(|e| e.to_string())?;
    watcher.watch(&root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    *state.watcher.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}
#[tauri::command]
fn get_organizer(state: tauri::State<Store>) -> Result<storage::OrganizerState, String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .organizer()
}
#[tauri::command]
fn save_organizer(
    state: tauri::State<Store>,
    value: storage::OrganizerState,
) -> Result<storage::OrganizerState, String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .save_organizer(value)
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
fn search_notes(state: tauri::State<Store>, query: String) -> Result<Vec<workspace::SearchResult>, String> {
    state.workspace.lock().map_err(|e| e.to_string())?.search(&query, 80)
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
fn import_markdown(
    state: tauri::State<Store>,
    parent: String,
    sources: Vec<String>,
) -> Result<Vec<String>, String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .import_markdown(&parent, &sources)
}
#[tauri::command]
fn relocate_entry(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<Store>,
    path: String,
    parent: String,
    name: String,
) -> Result<String, String> {
    windows::check_other_views(&app, &state, window.label(), &path)?;
    let next = state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .relocate(&path, &parent, &name)?;
    let _ = app.emit(
        "notus-path-moved",
        serde_json::json!({ "old": path, "next": next, "source": window.label() }),
    );
    Ok(next)
}
#[tauri::command]
fn delete_entry(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<Store>,
    path: String,
) -> Result<(), String> {
    windows::check_other_views(&app, &state, window.label(), &path)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&path)
}
#[tauri::command]
fn reveal_vault(state: tauri::State<Store>, path: String) -> Result<(), String> {
    let workspace = state.workspace.lock().map_err(|e| e.to_string())?;
    if path.contains('/') {
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
async fn choose_root(
    app: tauri::AppHandle,
    state: tauri::State<'_, Store>,
) -> Result<bool, String> {
    if app.webview_windows().len() > 1 {
        return Err("Close detached windows before changing the workspace.".into());
    }
    let Some(folder) = rfd::AsyncFileDialog::new()
        .set_title("Choose your Lotus workspace folder")
        .pick_folder()
        .await
    else {
        return Ok(false);
    };
    let next = Workspace::open(folder.path().into())?;
    fs::write(
        &state.config,
        serde_json::to_string(next.home.as_ref().unwrap_or(&next.root))
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    *state.workspace.lock().map_err(|e| e.to_string())? = next;
    watch_workspace(&app, &state)?;
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
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if !["https", "http"].contains(&parsed.scheme()) || parsed.host_str().is_none() {
        return Err("Only http and https website links can be opened.".into());
    }
    #[cfg(windows)]
    {
        let verb: Vec<u16> = "open\0".encode_utf16().collect();
        let target: Vec<u16> = parsed.as_str().encode_utf16().chain(Some(0)).collect();
        let result = unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                target.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };
        if result as isize <= 32 {
            return Err(format!(
                "Windows could not open the default browser (error {}).",
                result as isize
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    Err("Opening websites is supported on Windows.".into())
}
#[tauri::command]
fn preview_conversion(
    state: tauri::State<Store>,
    source: String,
    parent: String,
    name: String,
) -> Result<conversion::Conversion, String> {
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .conversion_preview(&source, &parent, &name)
}
#[tauri::command]
fn convert_vault(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<Store>,
    source: String,
    parent: String,
    name: String,
    revision: String,
) -> Result<conversion::Conversion, String> {
    windows::check_other_views(&app, &state, window.label(), &source)?;
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .convert_vault(&source, &parent, &name, &revision)
}
#[tauri::command]
fn read_clipboard() -> Result<String, String> {
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .get_text()
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn write_clipboard(text: String) -> Result<(), String> {
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .set_text(text)
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn export_backup(
    state: tauri::State<'_, Store>,
    settings: std::collections::BTreeMap<String, String>,
    vaults: bool,
    trash: bool,
) -> Result<Option<String>, String> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_title("Export Lotus backup")
        .add_filter("Lotus ZIP backup", &["zip"])
        .set_file_name("Lotus-backup.zip")
        .save_file()
        .await
    else {
        return Ok(None);
    };
    transfer::export(
        &*state.workspace.lock().map_err(|e| e.to_string())?,
        file.path(),
        settings,
        vaults,
        trash,
    )?;
    Ok(Some(file.path().to_string_lossy().into()))
}
#[tauri::command]
async fn preview_backup() -> Result<Option<transfer::Preview>, String> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_title("Import Lotus backup")
        .add_filter("Lotus ZIP backup", &["zip"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    transfer::preview(file.path()).map(Some)
}
#[tauri::command]
async fn import_backup(
    app: tauri::AppHandle,
    state: tauri::State<'_, Store>,
    plan: transfer::Preview,
    settings: bool,
) -> Result<Option<transfer::Restored>, String> {
    if app.webview_windows().len() > 1 {
        return Err("Close detached windows before importing.".into());
    }
    let Some(folder) = rfd::AsyncFileDialog::new()
        .set_title("Choose parent folder for a separate restored Lotus workspace")
        .pick_folder()
        .await
    else {
        return Ok(None);
    };
    let restored = transfer::restore(&plan, folder.path(), settings)?;
    let root = PathBuf::from(&restored.root);
    let next = Workspace::open(root.parent().ok_or("Invalid restore path")?.into())?;
    fs::write(
        &state.config,
        serde_json::to_vec(next.home.as_ref().unwrap()).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    *state.workspace.lock().map_err(|e| e.to_string())? = next;
    watch_workspace(&app, &state)?;
    Ok(Some(restored))
}
fn main() {
    // Do not inherit the launching application's taskbar identity (e.g. Codex).
    #[cfg(windows)]
    unsafe {
        let id: Vec<u16> = "app.notus.desktop\0".encode_utf16().collect();
        windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(id.as_ptr());
    }
    // Explicit workspace overrides support isolated UI tests alongside the user's app.
    // Ordinary launches still enforce a single instance and never open a debug port.
    let builder = tauri::Builder::default();
    let builder = if std::env::var_os("NOTUS_ROOT").is_none() {
        builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app
                .get_webview_window("main")
                .or_else(|| app.webview_windows().into_values().next())
            {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
    } else {
        builder
    };
    builder
        .setup(|app| {
            // Set both window/taskbar icons explicitly, including debug builds.
            if let Some(icon) = app.default_window_icon() {
                for window in app.webview_windows().into_values() {
                    window.set_icon(icon.clone())?;
                }
            }
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
                .unwrap_or_else(|| {
                    let documents = app.path().document_dir().expect("Documents folder");
                    let legacy = documents.join("Notus");
                    if legacy.exists() {
                        return legacy;
                    }
                    rfd::FileDialog::new()
                        .set_title(
                            "Choose where to create Lotus storage (Cancel uses Documents/Lotus)",
                        )
                        .set_directory(&documents)
                        .pick_folder()
                        .map(|parent| parent.join("Lotus"))
                        .unwrap_or(documents.join("Lotus"))
                });
            let store = Store {
                workspace: Mutex::new(
                    if std::env::var_os("NOTUS_ROOT").is_some() {
                        Workspace::new(root)
                    } else {
                        Workspace::open(root)
                    }
                    .map_err(std::io::Error::other)?,
                ),
                config,
                views: Mutex::new(std::collections::HashMap::new()),
                watcher: Mutex::new(None),
                tab_strips: Mutex::new(std::collections::HashMap::new()),
            };
            watch_workspace(&app.handle(), &store).map_err(std::io::Error::other)?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai::ai_connections,
            ai::ai_models,
            ai::ai_save,
            ai::ai_remove,
            ai::ai_run_lotus,
            ai::ai_stop_lotus,
            ai::ai_computer_specs,
            ai::model_library,
            ai::model_library_choose_root,
            ai::model_library_add_root,
            ai::model_library_files,
            ai::model_library_reveal,
            ai::model_library_rename,
            ai::model_library_move,
            ai::model_library_delete,
            ai::hf_search,
            ai::hf_files,
            ai::hf_download,
            ai::hf_cancel,
            ai::ai_chat,
            ai::ai_stop,
            export_backup,
            preview_backup,
            import_backup,
            read_clipboard,
            write_clipboard,
            get_organizer,
            save_organizer,
            snapshot,
            search_notes,
            read_note,
            write_note,
            create_entry,
            import_markdown,
            relocate_entry,
            open_external,
            preview_conversion,
            convert_vault,
            delete_entry,
            reveal_vault,
            choose_root,
            import_vault,
            windows::register_view,
            windows::detach_note,
            windows::focus_main,
            register_tab_strip,
            tab_drop_target,
            windows::list_trash,
            windows::restore_trash,
            windows::purge_trash,
            windows::set_locked
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Lotus");
}
