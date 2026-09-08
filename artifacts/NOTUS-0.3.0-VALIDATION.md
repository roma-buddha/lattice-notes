# Notus 0.3.0 validation

## Implemented

- One 44 CSS pixel header with sidebar/search, real note tabs, an empty-tab plus, save status and window controls. Tauri frameless window, native drag-region integration, no duplicate title strip. Existing Notus cream/charcoal palette and notebook icon retained.
- Exact row menus via three-dot button, right click or Shift+F10; keyboard arrows/Home/End, Escape/outside dismissal, focus return and viewport clamping.
- Inline create/rename in the correct parent, auto-expansion, Enter confirm and Escape cancellation, adjacent collision/invalid-name errors. No create/rename modals or bottom Folder/Note buttons.
- Notes allowed at vault root or in nested folders. Workspace-root notes still rejected by Rust.
- Sidebar-anchored vault settings: rename, location/reveal, hide registration without touching files, restore hidden registrations, separate confirmed Recycle Bin deletion.
- Existing autosave/recovery and cross-vault drag/drop retained. Move/rename still does not rewrite links.

## Verification

- `npm run build`: TypeScript and Vite production build pass. Existing large-chunk advisory remains.
- `npm run lint`: pass.
- `npm test`: 5 Markdown tests pass.
- `npm run test:native`: 3 Rust tests pass, including vault-root creation/cross-vault movement, traversal/name validation, conflicts and source-preserving imports.
- `npm run smoke`: real compiled Tauri/WebView2 app, isolated temporary workspace and browser profile. Passes empty startup; plus creates no file; tab switching flushes drafts; all three exact menu mappings; keyboard focus return; creation in contextual parent rather than selected parent; create/rename cancel without side effects; invalid names and collisions; cross-vault movement; hide/restore persistence without deletion; vault rename; panel bottom-edge clamp; delete cancellation/Recycle Bin; shell context-menu suppression with text-surface preservation; minimize/unminimize/maximize/restore/double-click maximize; sidebar collapse; conflict recovery after reload; recovery copy and save on close.
- Screenshots `notus-030-light.png` and `notus-030-dark.png` are real-app captures with synthetic notes, visually reviewed.
- NSIS installation completed with exit code 0; installed executable reports version 0.3.0. The full smoke suite also passed against that installed executable. Desktop and Start Menu shortcuts point to the verified installed binary with the Notus icon.
- Native Windows inspection confirmed the integrated UI running on the extended monitor and native sidebar input. User mouse activity overlapped the physical drag check; **cross-monitor dragging and edge resizing are not claimed as manually verified**. Native resizability is enabled and checked by the automated suite.
- Production dependency audit: 0 vulnerabilities. Full development audit reports 2 moderate Vitest/mocker advisories; a major test-tool upgrade is outside this UI change.

## Safety and limits

All functional tests use `notus-030-test-*` or `notus-window-*` temporary workspaces; no real user vault is deleted or used as test data. Sample notes deleted by the UI go to the Recycle Bin. Synthetic empty sample folders used only for scrolling are removed after the check. Existing user source changes and earlier release files are preserved.

Notus remains Tauri 2 + Rust + React, not Electron. The prior local Tauri migration is included in the release's source commit so the remote checkout builds coherently. Unrelated old screenshots/build assets are not staged. The last active note restores on restart; the whole tab set is session-only. Windows Snap Layout hover over the custom maximize button is not implemented or promised. The build is unsigned and uses the system WebView2 runtime.

Window integration follows the installed Tauri implementation and the [official window-customization guide](https://tauri.app/learn/window-customization/).
