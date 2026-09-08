import { invoke } from "@tauri-apps/api/core";
export type Entry = {
  name: string;
  path: string;
  kind: "vault" | "folder" | "note";
  children: Entry[];
};
export type Snapshot = { root: string; entries: Entry[] };
export type Document = { path: string; content: string; revision: string };
export const api = {
  snapshot: () => invoke<Snapshot>("snapshot"),
  read: (path: string) => invoke<Document>("read_note", { path }),
  write: (path: string, content: string, revision: string) =>
    invoke<Document>("write_note", { path, content, revision }),
  create: (parent: string, kind: Entry["kind"], name: string) =>
    invoke<string>("create_entry", { parent, kind, name }),
  relocate: (path: string, parent: string, name: string) =>
    invoke<string>("relocate_entry", { path, parent, name }),
  remove: (path: string) => invoke<void>("delete_entry", { path }),
  reveal: (path: string) => invoke<void>("reveal_vault", { path }),
  chooseRoot: () => invoke<boolean>("choose_root"),
  importVault: () => invoke<string | null>("import_vault"),
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
