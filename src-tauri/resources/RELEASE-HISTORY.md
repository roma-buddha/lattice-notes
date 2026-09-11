# Lotus release history

This is Lotus’s built-in release record. It is stored with the application, not in a vault, and opens read-only from **Settings → About**.

## 0.14.4 — Local reliability

- Fixed Lotus local-runtime model IDs so llama.cpp receives the actual ID reported by its server.
- Repaired existing local connections automatically when their saved ID is stale.
- Made local replies concise by default and allowed up to five minutes for a local request.
- Made sidebar moves appear immediately while the filesystem move completes in the background.
- Added pointer-driven tab reordering and a release-history tab.

## 0.14.3 — Reliable note dragging

- Replaced sidebar note dragging’s WebView2-dependent drop path with Lotus pointer capture.
- Added note placement above/below rows, note-to-folder movement, and note-to-tab-strip drops.
- Cleared editable-table selection when clicking outside a table.
- Changed the startup message to **Loading…**.

## 0.14.2 — Standard drag transport

- Accepted the standard text drag transport exposed by Windows WebView2.

## 0.14.1 — Tabs and manual note ordering

- Added persistent note tabs, per-folder manual note ordering, folder moves, and tab transfer groundwork.

## 0.14.0 — Workspace polish

- Added the About section, local computer information, model-library improvements, and local model controls.

## Earlier Lotus and Notus releases

The earlier release series established local Markdown vaults, note editing, tables, diagrams, split panes, import/export, trash, AI chat and editing, model settings, Hugging Face browsing and downloads, sidebar organization, themes, and Windows installers. This document will be extended for every future Lotus release.
