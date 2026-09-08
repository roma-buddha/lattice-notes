import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "notus-test-"));
const root = path.join(testDir, "workspace");
await fs.mkdir(root);
const executable =
  process.env.NOTUS_EXECUTABLE ||
  path.resolve("src-tauri/target/release/notus.exe");
const child = spawn(executable, [], {
  env: {
    ...process.env,
    NOTUS_ROOT: root,
    WEBVIEW2_USER_DATA_FOLDER: path.join(testDir, "webview"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9235",
  },
  windowsHide: true,
});
let browser;
const errors = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(test, message) {
  for (let i = 0; i < 80; i++) {
    if (await test()) return;
    await delay(150);
  }
  throw new Error(message);
}
try {
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9235");
      return true;
    } catch {
      return false;
    }
  }, "WebView did not start");
  const context = browser.contexts()[0];
  await until(
    async () =>
      context.pages().some((p) => p.url().includes("tauri.localhost")),
    "Notus page missing",
  );
  const page = context.pages().find((p) => p.url().includes("tauri.localhost"));
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  const invoke = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  await page
    .getByRole("heading", { name: "Your workspace", exact: true })
    .waitFor();
  assert.deepEqual(
    await fs.readdir(root),
    [],
    "App preloaded unwanted folders",
  );
  assert.equal(await page.getByText("Write freely.").count(), 0);
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/notus-empty.png" });
  async function create(kind, name) {
    if (kind === "vault")
      await page
        .getByRole("button", { name: "Create vault", exact: true })
        .first()
        .click();
    else
      await page
        .locator(".create-toolbar")
        .getByRole("button", {
          name: kind === "folder" ? "Folder" : "Note",
          exact: true,
        })
        .click();
    await page
      .getByRole("dialog")
      .getByLabel("Name", { exact: true })
      .fill(name);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await create("vault", "Work");
  assert.deepEqual(await fs.readdir(path.join(root, "Work")), []);
  assert.equal(
    await page
      .locator(".create-toolbar")
      .getByRole("button", { name: "Note", exact: true })
      .isDisabled(),
    true,
  );
  const invalid = await invoke("create_entry", {
    parent: "Work",
    kind: "note",
    name: "Rogue",
  }).then(
    () => false,
    () => true,
  );
  assert.equal(invalid, true, "Backend permitted a root note");
  await create("folder", "Research");
  await create("folder", "Ideas");
  await create("note", "First thought");
  const editor = page.locator(".cm-content");
  await editor.fill(
    "# First thought\n\nA note that survives moving between vaults.\n\n- [ ] Follow up\n",
  );
  await create("vault", "Personal");
  assert.match(
    await fs.readFile(
      path.join(root, "Work/Research/Ideas/First thought.md"),
      "utf8",
    ),
    /survives/,
  );
  await create("folder", "Journal");
  await create("note", "Second thought");
  await editor.fill("# Second thought\n\nPersist this immediately.");
  await page
    .getByRole("button", { name: "First thought", exact: true })
    .click();
  await page.getByRole("heading", {name: "First thought", exact: true}).waitFor();
  assert.match(
    await fs.readFile(
      path.join(root, "Personal/Journal/Second thought.md"),
      "utf8",
    ),
    /Persist this/,
  );
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Research note");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await page
    .getByRole("heading", { name: "Research note", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Move to another folder or vault",
      exact: true,
    })
    .click();
  await page.getByLabel("Destination folder").selectOption("Personal/Journal");
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const moved = path.join(root, "Personal/Journal/Research note.md");
  assert.match(await fs.readFile(moved, "utf8"), /survives/);
  assert.equal(
    await fs
      .access(path.join(root, "Work/Research/Ideas/Research note.md"))
      .then(
        () => true,
        () => false,
      ),
    false,
  );
  await editor.fill("# My unsaved version");
  await fs.writeFile(moved, "# External version");
  await until(
    async () =>
      (await page.locator(".save-state").innerText()).includes("Conflict"),
    "Conflict was not detected",
  );
  assert.equal(await fs.readFile(moved, "utf8"), "# External version");
  await page.reload();
  await until(async () => (await page.locator('.save-state').innerText()).includes('Conflict'), 'Recovered draft must keep its original revision');
  assert.match(await editor.innerText(), /My unsaved version/);
  assert.equal(await fs.readFile(moved, 'utf8'), '# External version');
  await page.getByRole("button", { name: "Save recovery copy" }).click();
  await until(
    async () =>
      (await fs.readdir(path.join(root, "Personal/Journal"))).some((n) =>
        n.includes("recovered"),
      ),
    "Recovery copy missing",
  );
  const copy = (await fs.readdir(path.join(root, "Personal/Journal"))).find(
    (n) => n.includes("recovered"),
  );
  await until(
    async () =>
      (await fs.readFile(path.join(root, "Personal/Journal", copy), "utf8")) ===
      "# My unsaved version",
    "Recovery content missing",
  );
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await delay(250);
  await page.screenshot({ path: "artifacts/notus-light.png" });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await delay(250);
  await page.screenshot({ path: "artifacts/notus-dark.png" });
  await page.getByRole("button", { name: "Collapse sidebar (Ctrl+B)" }).click();
  assert.equal(await page.locator(".sidebar").count(), 0);
  await page.reload();
  await page.getByRole("button", { name: "Expand sidebar (Ctrl+B)" }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await until(
    async () => (await editor.innerText()).includes("My unsaved version"),
    "Active note did not restore",
  );
  await page.getByRole("button", { name: "Expand sidebar (Ctrl+B)" }).click();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  const source = page
    .getByRole("button", { name: "Second thought", exact: true })
    .locator("..");
  const target = page
    .getByRole("button", { name: "Ideas", exact: true })
    .locator("..");
  await source.dragTo(target);
  await until(
    async () =>
      fs.access(path.join(root, "Work/Research/Ideas/Second thought.md")).then(
        () => true,
        () => false,
      ),
    "Drag between vaults failed",
  );
  await page
    .getByRole("button", { name: "Second thought", exact: true })
    .click();
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await page
    .getByRole("button", { name: "Move to Recycle Bin", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move to Recycle Bin", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await fs
      .access(path.join(root, "Work/Research/Ideas/Second thought.md"))
      .then(
        () => true,
        () => false,
      ),
    false,
  );
  await page
    .getByRole("button", { name: "Research note", exact: true })
    .click();
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await editor.fill("# Saved on close\n\nNo lost typing.");
  await invoke("plugin:window|close", { label: "main" }).catch(() => {});
  await until(
    async () => (await fs.readFile(moved, "utf8")).includes("No lost typing."),
    "Closing did not flush draft",
  );
  await until(async () => child.exitCode !== null, "App did not close");
  assert.deepEqual(errors, [], "Uncaught frontend errors");
  console.log(
    "PASS: actual Tauri app — empty startup, hierarchy, CRUD, nested folders, autosave/navigation/close, cross-vault move + drag/drop, conflicts/recovery, themes and sidebar persistence.",
  );
  console.log(`Test evidence: ${testDir}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
