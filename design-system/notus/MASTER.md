# Lotus interface

Reference: Ohana's cream, ink, warm accent and restrained serif typography. A compact desktop workspace, with no landing page or generated starter content.

- Use the semantic theme tokens in `src/styles.css` for both light and charcoal dark themes.
- Unified 44px top bar: small Lotus branding before collapse/search/theme, closable/reorderable tabs, organizer shortcut after theme and native window controls. Zero tabs means a truly blank canvas. No empty-tab plus, native menu or second title strip. All empty title regions, including the tab-strip background, support native dragging; interactive controls do not.
- Sidebar: searchable vault picker, create/add-existing plus menu, active-vault folders and notes, contextual actions, bottom Settings. Settings contains Appearance, Workspace and internal Trash. Organizer is a top-bar shortcut; import is in the vault plus menu. The picker is a single column with no creation actions. Keep the quick theme control at top. Switching vaults preserves open tabs and folder expansion state.
- Canvas: subtle breadcrumb/title, icon-only lock control with hover/focus tooltip and adjacent save-status indicator, editor or read-only Markdown, word count. No manual Save button; save every second while typing.
- Exactly Vault → Folder → Note. No nested folders or vault-root notes. Migrate existing content without overwriting or changing bytes.
- Menus are row-anchored, keyboard-operable and viewport-clamped. Vault: New folder/Vault settings. Folder: New note/Rename/Delete. Note: Open in tab/Open in separate window/Rename/Delete.
- Create/rename use a focused inline sidebar filename. Enter confirms, Escape cancels without filesystem effects, and validation errors stay beside the input. Vault create/add uses a compact modal with area selection and optional inline area creation.
- Vault settings is a focused sidebar-anchored panel. Remove registration keeps files intact. Delete moves to internal .notus-trash; permanent deletion is separately confirmed in Settings → Trash.
- Sidebar type hierarchy: vault semibold 13px; folder medium 12px; note regular 12px with smaller document icon. Separate vault groups with whitespace and a quiet divider. Inline fields use a subtle focus underline, not a rounded frame.
- Tabs support note drops, reorder, detach and acknowledged cross-window reattach. Do not show tab menus. Ctrl+W closes, Ctrl+Shift+W closes all, Ctrl+Shift+Enter detaches/returns. Extra windows share file revisions and lock state, never silently overwrite competing drafts.
- Frequent navigation and editor actions happen immediately. Only hover/press feedback uses short transitions; respect reduced motion.
- Name every icon button. Keep visible keyboard focus, native modal focus trapping and return focus when dismissed.
- The notebook-shaped L icon belongs to Lotus and is generated from `icon.svg` using the Tauri icon command.
- Text appearance near Lock controls shared family/size/weight preferences without editing Markdown.
- Organizer: main-area closable tab, a compact area-management list with 30 icon choices followed by an Explorer-style vault/folder/note tree, expandable folders, smaller note rows. Drag notes to folders, with visible drop feedback and keyboard-equivalent Move controls. Collision refusal and session-local last-move Undo are required.
- Areas are one visual tag per vault, with named Lucide icons and Uncategorized fallback. Metadata does not introduce any physical directory layer.

## Refinements in 0.6.1

- Sidebar folders never inherit vault-group separators. Keep rows compact and notes indented.
- Vault toolbar above a full-width wrapping name; no sidebar widening. Search is disclosed by its top-bar icon or Ctrl+P; Escape closes and clears it.
- Notes and Organizer share a thin gray, transparent-track scrollbar at the workspace's far-right edge. The organizer content, not its scroll container, is width-limited and centered.
- Table row/column selectors support mouse and keyboard focus; right-click or Shift+F10 opens insertion/deletion actions. No permanent add/remove toolbar.
- First-column emphasis is per table; note alignment is per note. Both remain local display preferences, not Markdown modifications. Alignment excludes code blocks and tables.
