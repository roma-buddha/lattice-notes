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
