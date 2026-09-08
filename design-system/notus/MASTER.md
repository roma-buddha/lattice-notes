# Notus interface

Reference: Ohana's cream, ink, warm accent and restrained serif typography. A compact desktop workspace, with no landing page or generated starter content.

- Use the semantic theme tokens in `src/styles.css` for both light and charcoal dark themes.
- Unified 44px top bar: sidebar/search controls, note tabs, an empty-tab plus, compact save status, and native minimize/maximize/close commands. No separate native title strip, application menu, or large header logo. Use Tauri's native drag regions, not a custom mouse movement simulation; interactive controls are outside drag regions.
- Sidebar begins beneath the title bar: search, vault hierarchy, contextual actions, workspace location/import and theme. Small Notus branding stays in the footer. No permanent folder/note creation toolbar.
- Canvas: subtle note-local breadcrumb above title, Write/Read control, editor, word count. Empty state gives a short sidebar instruction, without repetitive creation buttons.
- Vaults are root-level folders. Notes may be created within vaults or subfolders, never directly in the workspace root.
- Three-dot/right-click menus are row-anchored, keyboard-operable and viewport-clamped. Vault: New folder/New note/Vault settings. Folder: New note/New subfolder/Rename/Delete. Note: Rename/Delete only.
- Create/rename use a focused inline sidebar filename. Enter confirms, Escape cancels without filesystem effects, and validation errors stay beside the input. Only destructive confirmation uses a centered modal.
- Vault settings is a focused sidebar-anchored panel. Remove registration keeps files intact; deleting to the Recycle Bin remains separate and confirmed.
- Frequent navigation and editor actions happen immediately. Only hover/press feedback uses short transitions; respect reduced motion.
- Name every icon button. Keep visible keyboard focus, native modal focus trapping and return focus when dismissed.
- The notebook-shaped N icon belongs to Notus and is generated from `icon.svg` using the Tauri icon command.
