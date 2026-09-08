export type Vault = {
  id: string;
  name: string;
  path: string;
  pinned: boolean;
  lastOpened: number;
  available: boolean;
};
export type FileEntry = {
  name: string;
  path: string;
  relativePath: string;
  kind: "file" | "folder";
  children?: FileEntry[];
  modified?: number;
};
export type NoteDocument = {
  relativePath: string;
  content: string;
  mtimeMs: number;
};
export type LinkRef = {
  raw: string;
  target: string;
  alias?: string;
  heading?: string;
  start: number;
  end: number;
  kind: "wiki" | "markdown";
};
export type IndexedNote = {
  path: string;
  title: string;
  content: string;
  tags: string[];
  properties: Record<string, unknown>;
  links: LinkRef[];
  headings: string[];
};
export type VaultIndex = { notes: IndexedNote[]; unresolved: string[] };
export type AIProvider = {
  id: string;
  name: string;
  kind: "local" | "online";
  baseUrl: string;
  model: string;
  configured: boolean;
};
export type AIRequest = {
  provider: AIProvider;
  prompt: string;
  context: { label: string; content: string }[];
  apiKey?: string;
};
export type AIResult = {
  text: string;
  provider: string;
  model: string;
  external: boolean;
};

declare global {
  interface Window {
    lattice: {
      listVaults(): Promise<Vault[]>;
      chooseVault(
        mode: "create" | "open",
        starter?: boolean,
      ): Promise<Vault | null>;
      removeVault(id: string): Promise<void>;
      updateVault(vault: Vault): Promise<Vault[]>;
      reveal(path: string): Promise<void>;
      tree(vaultId: string): Promise<FileEntry[]>;
      read(vaultId: string, relativePath: string): Promise<NoteDocument>;
      write(
        vaultId: string,
        relativePath: string,
        content: string,
        expectedMtime?: number,
      ): Promise<NoteDocument>;
      createEntry(
        vaultId: string,
        parent: string,
        kind: "file" | "folder",
      ): Promise<string>;
      renameEntry(
        vaultId: string,
        relativePath: string,
        nextName: string,
        updateLinks?: boolean,
      ): Promise<{ path: string; affected: string[] }>;
      renameImpact(vaultId: string, relativePath: string): Promise<string[]>;
      duplicateEntry(vaultId: string, relativePath: string): Promise<string>;
      deleteEntry(vaultId: string, relativePath: string): Promise<void>;
      search(vaultId: string): Promise<VaultIndex>;
      snapshot(
        vaultId: string,
        relativePath: string,
        content: string,
        reason: string,
      ): Promise<void>;
      listSnapshots(
        vaultId: string,
        relativePath: string,
      ): Promise<{ file: string; created: number; reason: string }[]>;
      secretSet(id: string, value: string): Promise<void>;
      secretGet(id: string): Promise<string>;
      ai(request: AIRequest): Promise<AIResult>;
      onExternalChange(callback: (path: string) => void): () => void;
    };
  }
}
