import { invoke } from "@tauri-apps/api/core";
import type { EditorView } from "@codemirror/view";
export type Provider = "groq" | "openrouter" | "google" | "nvidia" | "custom" | "lotus" | "local";
export const providerNames: Record<Provider, string> = {
  groq: "Groq",
  openrouter: "OpenRouter",
  google: "Google Gemini",
  nvidia: "NVIDIA",
  custom: "Custom provider",
  lotus: "Lotus local runtime",
  local: "Local server",
};
export type Connection = {
  provider: Provider;
  model: string;
  name?: string;
  base_url?: string;
  source?: "api" | "local";
};
export type ModelLibrary = { default_root: string; roots: string[] };
export type LibraryFile = { name: string; path: string; relative_path: string; root: string; size: number; modified: number };
export type ComputerSpecs = {
  system: string;
  cpu: string;
  cores: number;
  ram_bytes: number;
  available_ram_bytes: number;
  gpus: { name: string; vram_bytes: number }[];
  drive_bytes: number;
  drive_free_bytes: number;
};
export const connectionName = (connection: Connection) =>
  connection.name || providerNames[connection.provider];
export type Message = { role: "user" | "assistant"; content: string };
export type NoteContext = {
  root: string;
  path: string;
  original: string;
  body: string;
  from: number;
  to: number;
  locked: boolean;
  pane: "primary" | "secondary";
};
export const ai = {
  connections: () => invoke<Connection[]>("ai_connections"),
  models: (provider: Provider, key: string, baseUrl = "") =>
    invoke<string[]>("ai_models", { provider, key, baseUrl }),
  save: (
    provider: Provider,
    key: string,
    model: string,
    name = "",
    baseUrl = "",
  ) => invoke<void>("ai_save", { provider, key, model, name, baseUrl }),
  remove: (provider: Provider) => invoke<void>("ai_remove", { provider }),
  runLotus: (path: string) => invoke<string>("ai_run_lotus", { path }),
  stopLotus: () => invoke<void>("ai_stop_lotus"),
  computerSpecs: (refresh = false) => invoke<ComputerSpecs>("ai_computer_specs", { refresh }),
  library: () => invoke<ModelLibrary>("model_library"),
  chooseModelRoot: () => invoke<ModelLibrary | null>("model_library_choose_root"),
  addModelRoot: () => invoke<ModelLibrary | null>("model_library_add_root"),
  libraryFiles: () => invoke<LibraryFile[]>("model_library_files"),
  revealModel: (path: string) => invoke<void>("model_library_reveal", { path }),
  renameModel: (path: string, name: string) => invoke<LibraryFile>("model_library_rename", { path, name }),
  moveModel: (path: string, targetRoot: string) => invoke<LibraryFile>("model_library_move", { path, targetRoot }),
  deleteModel: (path: string) => invoke<void>("model_library_delete", { path }),
  hfSearch: (query: string) => invoke<{ id: string; downloads: number; likes: number }[]>("hf_search", { query }),
  hfFiles: (repository: string) => invoke<{ path: string; size: number }[]>("hf_files", { repository }),
  hfDownload: (repository: string, file: string, destinationName: string) => invoke<void>("hf_download", { repository, file, destinationName }),
  hfCancel: () => invoke<void>("hf_cancel"),
  chat: (
    provider: Provider,
    messages: Message[],
    context: string | null,
    edit: boolean,
  ) =>
    invoke<{ text: string; replacement: string | null }>("ai_chat", {
      provider,
      messages,
      context,
      edit,
    }),
  stop: () => invoke<void>("ai_stop"),
};
export function editedBody(note: NoteContext, replacement: string) {
  if (note.from < 0 || note.to < note.from || note.to > note.body.length)
    throw new Error("The selection is no longer valid.");
  return note.body.slice(0, note.from) + replacement + note.body.slice(note.to);
}
export function minimalChange(before: string, after: string) {
  let from = 0,
    tail = 0;
  while (
    from < before.length &&
    from < after.length &&
    before[from] === after[from]
  )
    from++;
  while (
    tail < before.length - from &&
    tail < after.length - from &&
    before[before.length - tail - 1] === after[after.length - tail - 1]
  )
    tail++;
  return {
    from,
    to: before.length - tail,
    insert: after.slice(from, after.length - tail),
  };
}
/** Preserve the visible source position when the chat changes the note width. */
export function preserveNotePosition(
  views: (EditorView | null)[],
  changeLayout: () => void,
) {
  const anchors = views.flatMap((view) => {
    const scroll = view?.dom.closest<HTMLElement>(".document-scroll");
    if (!view || !scroll) return [];
    const rect = scroll.getBoundingClientRect();
    const content = view.contentDOM.getBoundingClientRect();
    const pos = view.posAtCoords(
      { x: Math.max(rect.left + 20, content.left + 4), y: rect.top + 20 },
      false,
    );
    if (pos === null) return [];
    const y = view.coordsAtPos(pos)?.top;
    return y === undefined ? [] : [{ view, scroll, pos, y }];
  });
  changeLayout();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const { view, scroll, pos, y } of anchors) {
        if (!view.dom.isConnected || pos > view.state.doc.length) continue;
        const next = view.coordsAtPos(pos)?.top;
        if (next !== undefined) scroll.scrollTop += next - y;
      }
    }),
  );
}
