import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "lattice-smoke-"));
const userData = path.join(root, "profile");
const vault = path.join(root, "Sample Vault");
await fs.mkdir(path.join(vault, "Notes"), { recursive: true });
await fs.mkdir(userData, { recursive: true });
await fs.writeFile(
  path.join(vault, "Notes", "Welcome.md"),
  `---\ntags: [welcome, local-first]\ncreated: 2026-09-08\npublished: false\n---\n# Welcome to Lattice Notes\n\nYour notes remain ordinary files on your computer.\n\n## Connected thinking\n\nThis note connects to [[Project Atlas]] and an [[Unresolved idea]].\n\n- [x] Open a local folder\n- [ ] Shape the next idea\n\n> Your files are the source of truth.\n`,
);
await fs.writeFile(
  path.join(vault, "Notes", "Project Atlas.md"),
  "# Project Atlas\n\nLinked from [[Welcome to Lattice Notes]].\n",
);
await fs.writeFile(
  path.join(userData, "vaults.json"),
  JSON.stringify([
    {
      id: "smoke",
      name: "Sample Vault",
      path: vault,
      pinned: true,
      lastOpened: Date.now(),
      available: true,
    },
  ]),
);

const app = await electron.launch({
  ...(process.env.LATTICE_PACKAGED
    ? {
        executablePath: path.resolve("release/win-unpacked/Lattice Notes.exe"),
      }
    : { args: ["."] }),
  env: { ...process.env, LATTICE_USER_DATA: userData },
});
const page = await app.firstWindow();
await page.waitForSelector(".vault-card");
await fs.mkdir("artifacts", { recursive: true });
await page.screenshot({ path: "artifacts/vault-manager.png" });
await page.locator(".open-button").click();
await page.getByRole("button", { name: "Welcome" }).click();
await page
  .getByRole("heading", { name: "Welcome to Lattice Notes", level: 1 })
  .first()
  .waitFor();
await page.screenshot({ path: "artifacts/workspace-note.png" });
await page.getByTitle("Graph").click();
await page.waitForSelector(".graph-canvas canvas");
await page.waitForTimeout(800);
await page.screenshot({ path: "artifacts/workspace-graph.png" });
console.log(
  "Smoke test passed: vault manager, local note read, index, and graph rendered.",
);
await app.close();
await fs.rm(root, { recursive: true, force: true });
