import { flatten, type Entry } from "../notus";
/** Match only unambiguous filesystem identities. Never guess between copies. */
export function externalMoves(
  before: Entry[],
  after: Entry[],
): Map<string, string> {
  const old = flatten(before),
    next = flatten(after),
    paths = new Set(next.map((e) => e.path)),
    moves = new Map<string, string>();
  for (const entry of old) {
    if (paths.has(entry.path) || !entry.identity) continue;
    const matches = next.filter(
      (e) => e.identity === entry.identity && e.kind === entry.kind,
    );
    if (matches.length === 1) moves.set(entry.path, matches[0].path);
  }
  return moves;
}
