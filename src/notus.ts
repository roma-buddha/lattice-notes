import { invoke } from "@tauri-apps/api/core";
export type Entry = {
  name: string;
  path: string;
  kind: "vault" | "folder" | "note";
  children: Entry[];
  identity?: string | null;
};
export type Snapshot = { root: string; entries: Entry[]; legacy_root?: string | null };
export type Area = { id: string; name: string; icon: string };
export type OrganizerState = {
  revision: number;
  areas: Area[];
  assignments: Record<string, string>;
};
export type Document = {
  path: string;
  content: string;
  revision: string;
  locked: boolean;
};
export type SearchResult = { path: string; snippet: string };
export type TrashItem = {
  id: string;
  name: string;
  original: string;
  kind: Entry["kind"];
  deleted: number;
};
export type BackupPreview = { archive:string; revision:string; manifest:{source_root:string;include_vaults:boolean;include_trash:boolean;files:{path:string;size:number;sha256:string}[];settings:Record<string,string>} };
export const api = {
  exportBackup:(settings:Record<string,string>,vaults:boolean,trash:boolean)=>invoke<string|null>("export_backup",{settings,vaults,trash}),
  previewBackup:()=>invoke<BackupPreview|null>("preview_backup"),
  importBackup:(plan:BackupPreview,settings:boolean)=>invoke<{root:string;source_root:string;settings:Record<string,string>}|null>("import_backup",{plan,settings}),
  readClipboard: () => invoke<string>("read_clipboard"),
  writeClipboard: (text: string) => invoke<void>("write_clipboard", { text }),
  previewConversion: (source: string, parent: string, name: string) =>
    invoke<Conversion>("preview_conversion", { source, parent, name }),
  convertVault: (
    source: string,
    parent: string,
    name: string,
    revision: string,
  ) => invoke<Conversion>("convert_vault", { source, parent, name, revision }),
  openExternal: (url: string) => invoke<void>("open_external", { url }),
  organizer: () => invoke<OrganizerState>("get_organizer"),
  saveOrganizer: (value: OrganizerState) =>
    invoke<OrganizerState>("save_organizer", { value }),
  snapshot: () => invoke<Snapshot>("snapshot"),
  search: (query: string) => invoke<SearchResult[]>("search_notes", { query }),
  read: (path: string) => invoke<Document>("read_note", { path }),
  write: (path: string, content: string, revision: string) =>
    invoke<Document>("write_note", { path, content, revision }),
  create: (parent: string, kind: Entry["kind"], name: string) =>
    invoke<string>("create_entry", { parent, kind, name }),
  importMarkdown: (parent: string, sources: string[]) =>
    invoke<string[]>("import_markdown", { parent, sources }),
  relocate: (path: string, parent: string, name: string) =>
    invoke<string>("relocate_entry", { path, parent, name }),
  remove: (path: string) => invoke<void>("delete_entry", { path }),
  reveal: (path: string) => invoke<void>("reveal_vault", { path }),
  chooseRoot: () => invoke<boolean>("choose_root"),
  importVault: () => invoke<string | null>("import_vault"),
  listTrash: () => invoke<TrashItem[]>("list_trash"),
  restore: (id: string) => invoke<string>("restore_trash", { id }),
  purge: (ids: string[]) => invoke<void>("purge_trash", { ids }),
  setLocked: (path: string, locked: boolean, revision: string) =>
    invoke<Document>("set_locked", { path, locked, revision }),
  registerView: (path: string | null, additional: string[] = []) =>
    invoke<void>("register_view", { path, additional }),
  detach: (path: string, atCursor: boolean) =>
    invoke<string>("detach_note", { path, atCursor }),
  focusMain: (path: string) => invoke<boolean>("focus_main", { path }),
};
export type Conversion = {
  source: string;
  destination: string;
  files: [string, string][];
  revision: string;
};
export const parentOf = (path: string) =>
  path.split("/").slice(0, -1).join("/");
export const stem = (path: string) =>
  path
    .split("/")
    .at(-1)!
    .replace(/\.(md|markdown)$/i, "");
export const flatten = (entries: Entry[]): Entry[] =>
  entries.flatMap((e) => [e, ...flatten(e.children)]);
