# Notus 0.3.0

A cleaner Markdown workspace, keeping the Notus design and Tauri/Rust stack.

- Single integrated title bar with note tabs, sidebar controls, save status and minimize/maximize/close.
- Context menus beside vault, folder and note rows; no browser menu in the app shell.
- Create and rename inline. Enter saves; Escape cancels without creating a file.
- Vault settings with reveal, rename and removal from the sidebar without deleting files.
- Notes at vault root or inside nested folders; cross-vault drag/drop and recoverable deletion.
- Existing autosave, conflict protection and draft recovery retained.

## Windows x64

Use `Notus_0.3.0_x64-setup.exe` to install. The ZIP contains the standalone executable and README; Windows WebView2 must be installed. Builds are unsigned, so Windows may display its standard publisher warning.

The default note location remains Documents/Notus. Installing this version does not import, move or delete previous Lattice/Notus vaults. Existing releases remain available.

## Verification and limits

Typecheck/build, lint, 5 Markdown tests, 3 Rust tests and the real-app isolated UI suite pass. Tests cover contextual placement/cancellation, exact menus, tab/save behavior, registration restoration, native window controls, recovery and Recycle Bin deletion.

Move/rename does not update Markdown links. Full tab-session persistence and Windows Snap Layout hover are not included. Physical cross-monitor drag/edge resizing was not conclusively verified because user activity overlapped the native test; native drag regions/resizing are enabled. Production dependency audit is clean; the development-only test tools have two moderate advisories.
