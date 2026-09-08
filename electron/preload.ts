import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("lattice", {
  listVaults: () => ipcRenderer.invoke("vault:list"),
  chooseVault: (mode: string, starter?: boolean) =>
    ipcRenderer.invoke("vault:choose", mode, starter),
  removeVault: (id: string) => ipcRenderer.invoke("vault:remove", id),
  updateVault: (vault: unknown) => ipcRenderer.invoke("vault:update", vault),
  reveal: (path: string) => ipcRenderer.invoke("shell:reveal", path),
  tree: (id: string) => ipcRenderer.invoke("fs:tree", id),
  read: (id: string, path: string) => ipcRenderer.invoke("fs:read", id, path),
  write: (id: string, path: string, content: string, mtime?: number) =>
    ipcRenderer.invoke("fs:write", id, path, content, mtime),
  createEntry: (id: string, parent: string, kind: string) =>
    ipcRenderer.invoke("fs:create", id, parent, kind),
  renameEntry: (
    id: string,
    path: string,
    name: string,
    updateLinks?: boolean,
  ) => ipcRenderer.invoke("fs:rename", id, path, name, updateLinks),
  renameImpact: (id: string, path: string) =>
    ipcRenderer.invoke("fs:rename-impact", id, path),
  duplicateEntry: (id: string, path: string) =>
    ipcRenderer.invoke("fs:duplicate", id, path),
  deleteEntry: (id: string, path: string) =>
    ipcRenderer.invoke("fs:delete", id, path),
  search: (id: string) => ipcRenderer.invoke("index:build", id),
  snapshot: (id: string, path: string, content: string, reason: string) =>
    ipcRenderer.invoke("history:snapshot", id, path, content, reason),
  listSnapshots: (id: string, path: string) =>
    ipcRenderer.invoke("history:list", id, path),
  secretSet: (id: string, value: string) =>
    ipcRenderer.invoke("secret:set", id, value),
  secretGet: (id: string) => ipcRenderer.invoke("secret:get", id),
  ai: (request: unknown) => ipcRenderer.invoke("ai:request", request),
  onExternalChange: (callback: (path: string) => void) => {
    const handler = (_: unknown, path: string) => callback(path);
    ipcRenderer.on("fs:external", handler);
    return () => ipcRenderer.removeListener("fs:external", handler);
  },
});
