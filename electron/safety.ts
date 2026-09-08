import path from "node:path";

export function resolveInside(root: string, relative: string) {
  const resolved = path.resolve(root, relative);
  const normalized = path.resolve(root);
  if (resolved !== normalized && !resolved.startsWith(normalized + path.sep)) {
    throw new Error("Path escapes the vault boundary.");
  }
  return resolved;
}

export function isValidWindowsName(name: string) {
  return (
    Boolean(name.trim()) && !/[\\/:*?"<>|]/.test(name) && !/[. ]$/.test(name)
  );
}
