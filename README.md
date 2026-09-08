# Notus

A Windows Markdown app with a quiet, Ohana-inspired interface. Opens directly into your workspace. No account, server, AI runtime, database, or starter content.

## Stack

- Tauri 2 and a small Rust backend for native windows and validated filesystem operations.
- React 19, TypeScript and Vite for the interface.
- CodeMirror 6 for editing; React Markdown and remark-gfm for reading.
- Plain folders and UTF-8 `.md` files as the source of truth.

Tauri uses Windows WebView2 instead of shipping Chromium with each app. This keeps distribution smaller. The app remains a web interface in a native window; using Rust does not replace careful filesystem validation or save tests.

## Workspace

Default location: your Windows Documents folder, under `Notus`. Click **Workspace** in the sidebar footer to select another parent folder. Switching roots does not move or delete the previous workspace.

```text
Notus/
  Work/                   # vault
    Research/             # subfolder
      Ideas/              # optional deeper subfolder
        First thought.md
  Personal/               # another vault
    Journal/
      September.md
```

Create a vault with the plus beside **VAULTS**. Right-click a row or use its three-dot menu. Vaults offer **New folder**, **New note**, and **Vault settings**; folders offer **New note**, **New subfolder**, **Rename**, and **Delete**; notes offer **Rename** and **Delete**. New notes may live at a vault's root or inside any of its subfolders, never directly in the workspace root.

Creation and renaming happen inline in the sidebar: **Enter** confirms; **Escape** cancels without creating or renaming a file. Errors appear beside the input. Menus open beside their row and stay inside the window; arrow keys navigate, Escape dismisses and restores focus. Deletion requires confirmation and sends files to the Windows Recycle Bin. Drag notes or subfolders onto a folder or vault, including another vault. Duplicate names are rejected without overwriting files. Move/rename does not rewrite links inside other Markdown files.

**Vault settings** supports rename, location/reveal in File Explorer, **Remove from sidebar** (files stay untouched), and a separate confirmed **Delete vault** action. Hidden registrations are a per-workspace local UI preference; restore them through **Hidden vaults** in the sidebar footer. No additional vault settings are invented.

**Import existing vault** copies a chosen folder into the workspace and leaves the source untouched. Imported root-level Markdown files are placed in an `Imported root notes` subfolder. Hidden metadata directories are skipped. New vaults are completely empty. Previous Lattice vaults are not automatically copied, changed, or deleted.

## Editing and recovery

Changes autosave after a short idle period, and pending saves finish before note navigation or window close. Writes use a content revision check and atomic replacement. Drafts are also kept in WebView local storage for crash recovery. If the disk file changed, saving stops and **Save recovery copy** preserves the draft in a separate Markdown file.

Outside edits refresh while the note is clean. Markdown frontmatter is preserved in source and omitted from the reading view. This release supports ordinary Markdown/GFM rendering; it does not provide Obsidian plugins, graph views, attachment management, or wiki-link navigation.

Light/dark theme, sidebar visibility and the last open note are remembered. A single 44px title bar integrates sidebar/search controls, tabs, save status and window controls. Its empty space uses Tauri's native drag region; double-click toggles maximize. Buttons are not drag regions. There is no File/Edit menu or second native title strip. **+** opens an empty tab and never creates a file. Opening a note fills the active tab (or selects an already-open copy); tab switching and closing flush drafts. The last note, not the whole tab set, restores after restarting.

| Shortcut | Action                               |
| -------- | ------------------------------------ |
| Ctrl+N   | Create note in selected vault/folder |
| Ctrl+S   | Save current note                    |
| Ctrl+B   | Toggle sidebar                       |
| Ctrl+P   | Focus sidebar search                 |

## Development

Requires Node.js, Rust MSVC, Visual Studio C++ build tools, and Windows WebView2.

```sh
npm ci
npm run dev
npm run lint
npm test
npm run test:native
npm run package:win
npm run smoke
```

`npm run package:win` produces the NSIS installer in `src-tauri/target/release/bundle/nsis/`.
`npm run smoke` launches the real built Tauri executable against a temporary workspace and WebView profile using a loopback debugging port. It tests exact contextual actions, inline parent placement/cancellation/collisions, tabs, save/recovery, registration removal/restoration, native minimize/maximize/restore, title-bar double-click, viewport clamping and sidebar collapse. Use `NOTUS_EXECUTABLE` to test an installed executable. Explicit `NOTUS_ROOT` overrides bypass single-instance handling so isolated tests never redirect into a user's running app. Test-only environment variables are not set on the desktop shortcut. The earlier 0.2.0 smoke script is retained as historical test context, not the current runner.

The Rust filesystem boundary rejects traversal, Windows reserved names, linked paths and overwrite collisions. Native dialogs are used only to select/import a workspace folder. No broad filesystem plugin is exposed to the frontend.

The source checkout may still be stored under its original `Obsidian Clone` directory; the product, package and installer are named Notus.
