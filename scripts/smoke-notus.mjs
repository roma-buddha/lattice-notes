import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "notus-040-test-"));
const root = path.join(testDir, "workspace");
await fs.mkdir(root);
const child = spawn(
  process.env.NOTUS_EXECUTABLE ||
    path.resolve("src-tauri/target/release/notus.exe"),
  [],
  {
    env: {
      ...process.env,
      NOTUS_ROOT: root,
      WEBVIEW2_USER_DATA_FOLDER: path.join(testDir, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9235",
    },
    windowsHide: true,
  },
);
let browser, page;
const errors = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(test, message) {
  for (let i = 0; i < 120; i++) {
    if (await test()) return;
    await delay(150);
  }
  throw new Error(message);
}
const exists = (relative) =>
  fs.access(path.join(root, relative)).then(
    () => true,
    () => false,
  );
const content = (relative) => fs.readFile(path.join(root, relative), "utf8");
const invoke = (p, command, args = {}) =>
  p.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const row = (p, relative) =>
  p
    .locator(".tree-row")
    .filter({ has: p.locator(`.tree-select[title="${relative}"]`) });
const editor = (p) => p.locator('.cm-content[contenteditable="true"]');
async function menu(relative) {
  await row(page, relative).locator(".row-actions").click();
  await page.getByRole("menu").waitFor();
}
async function create(kind, name, parent = "") {
  if (kind === "vault")
    await page
      .getByRole("button", { name: "Create vault", exact: true })
      .click();
  else {
    await menu(parent);
    await page
      .getByRole("menuitem", {
        name: kind === "note" ? "New note" : "New folder",
        exact: true,
      })
      .click();
  }
  const input = page.locator(".inline-name input");
  await input.fill(name);
  await input.press("Enter");
  await input.waitFor({ state: "hidden" });
}
async function dragNote(p, note) {
  await row(p, note).dragTo(p.locator(".tab-strip"));
}
async function saved(p) {
  await until(
    async () => (await p.locator(".save-state").textContent()) === "Saved",
    "Note did not save",
  );
}
try {
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9235");
      return true;
    } catch {
      return false;
    }
  }, "Webview did not start");
  const context = browser.contexts()[0];
  await until(
    async () =>
      context.pages().some((p) => p.url().includes("tauri.localhost")),
    "Notus page missing",
  );
  page = context.pages().find((p) => p.url().includes("tauri.localhost"));
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("heading", { name: "Your workspace", exact: true })
    .waitFor();
  assert.equal(await exists(".notus-trash"), true);
  assert.deepEqual((await invoke(page, "snapshot")).entries, []);
  assert.equal(
    await page.getByRole("button", { name: "New tab", exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("tab").count(), 1);
  assert.equal(
    await invoke(page, "plugin:window|is_decorated", { label: "main" }),
    false,
  );
  await create("vault", "Eco-innovation");
  await menu("Eco-innovation");
  assert.deepEqual(await page.getByRole("menuitem").allTextContents(), [
    "New folder",
    "Vault settings",
  ]);
  await page.keyboard.press("Escape");
  await create("folder", "Singapore", "Eco-innovation");
  await menu("Eco-innovation/Singapore");
  assert.equal(
    await page.getByRole("menuitem", { name: "New subfolder" }).count(),
    0,
  );
  await page.getByRole("menuitem", { name: "New note", exact: true }).click();
  assert.equal(
    await page
      .locator(".inline-name input")
      .evaluate((e) => getComputedStyle(e).outlineStyle),
    "none",
  );
  assert.equal(
    await page
      .locator(".inline-name input")
      .evaluate((e) => getComputedStyle(e).borderRadius),
    "0px",
  );
  await page.locator(".inline-name input").fill("Simon");
  await page.locator(".inline-name input").press("Enter");
  const note = "Eco-innovation/Singapore/Simon.md";
  await editor(page).waitFor();
  for (const [parent, kind] of [
    ["Eco-innovation", "note"],
    ["Eco-innovation/Singapore", "folder"],
    ["", "note"],
  ]) {
    assert.equal(
      await invoke(page, "create_entry", {
        parent,
        kind,
        name: "Forbidden",
      }).then(
        () => false,
        () => true,
      ),
      true,
    );
  }
  assert.equal(
    await page.getByRole("button", { name: "Save note (Ctrl+S)" }).count(),
    0,
  );
  await editor(page).fill("# Continuous autosave\n\n");
  const typing = editor(page).pressSequentially(
    "Every character stays safe while I continue typing.",
    { delay: 90 },
  );
  await delay(1500);
  const partial = await content(note);
  assert.ok(
    partial.includes("Every"),
    "Autosave must persist while typing continues",
  );
  assert.ok(
    !partial.includes("typing."),
    "Intermediate checkpoint must precede completion",
  );
  await typing;
  await saved(page);
  await page.getByRole("button", { name: "Lock note", exact: true }).click();
  await page
    .getByRole("button", { name: "Unlock note", exact: true })
    .waitFor();
  assert.equal(await editor(page).count(), 0);
  const locked = await invoke(page, "read_note", { path: note });
  assert.equal(locked.locked, true);
  assert.equal(
    await invoke(page, "write_note", {
      path: note,
      content: "bad",
      revision: locked.revision,
    }).then(
      () => false,
      () => true,
    ),
    true,
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Unlock note", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await create("note", "Overview", "Eco-innovation/Singapore");
  const overview = "Eco-innovation/Singapore/Overview.md";
  await dragNote(page, note);
  await until(
    async () => (await page.getByRole("tab").count()) === 2,
    "Note did not open in a new tab",
  );
  await page.locator(".note-heading h1").filter({ hasText: "Simon" }).waitFor();
  await dragNote(page, overview);
  await until(
    async () => (await page.getByRole("tab").count()) === 3,
    "Third tab did not open",
  );
  await page
    .locator('[data-tab-id="3"]')
    .dragTo(page.locator('[data-tab-id="2"]'));
  await until(
    async () =>
      JSON.stringify(
        await page
          .locator(".note-tab")
          .evaluateAll((els) => els.map((e) => e.dataset.tabId)),
      ) === '["1","3","2"]',
    "Tabs did not reorder",
  );
  await page.locator('[data-tab-id="3"] .tab-close').click();
  // Sidebar selection always uses the permanent main tab, preserving pinned notes.
  await row(page, overview).locator(".tree-select").click();
  await until(
    async () =>
      (await page.locator(".note-tab.active").getAttribute("data-tab-id")) ===
      "1",
    "Sidebar selection did not use the main tab",
  );
  await page.getByRole("tab", { name: "Simon", exact: true }).click();
  await page.getByRole("button", { name: "Tab options for Simon" }).click();
  await page.getByRole("menuitem", { name: "Open in separate window" }).click();
  await until(
    async () =>
      context.pages().filter((p) => p.url().includes("tauri.localhost"))
        .length === 2,
    "Detached window did not open",
  );
  const other = context
    .pages()
    .find((p) => p !== page && p.url().includes("tauri.localhost"));
  other.setDefaultTimeout(12000);
  other.on("pageerror", (e) => errors.push(e.message));
  await editor(other).waitFor();
  assert.equal(await other.locator(".note-heading h1").textContent(), "Simon");
  const label = await other.evaluate(
    () => window.__TAURI_INTERNALS__.metadata.currentWindow.label,
  );
  assert.ok(label.startsWith("note-"));
  assert.equal(
    await invoke(other, "plugin:window|is_resizable", { label }),
    true,
  );
  // Separate native webview and resizing are verified here; physical cross-monitor dragging is manual.
  await row(page, note).locator(".tree-select").click();
  await editor(other).fill("# Shared note\n\nWritten in the detached window.");
  await saved(other);
  await until(
    async () =>
      (await editor(page).textContent()) ===
        "# Shared noteWritten in the detached window." ||
      (await editor(page).textContent()).includes(
        "Written in the detached window.",
      ),
    "Shared edit did not appear",
  );
  await other.getByRole("button", { name: "Lock note", exact: true }).click();
  await page
    .getByRole("button", { name: "Unlock note", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await editor(other).waitFor();
  assert.equal(
    await invoke(page, "delete_entry", { path: note }).then(
      () => false,
      () => true,
    ),
    true,
    "Deletion must not invalidate another open editor",
  );
  // Force a real competing write between reading a base revision and saving a draft.
  await editor(page).fill("My local draft kept safely");
  const disk = await invoke(other, "read_note", { path: note });
  await invoke(other, "write_note", {
    path: note,
    content: "External winning version",
    revision: disk.revision,
  });
  await page
    .getByRole("button", { name: "Save recovery copy", exact: true })
    .waitFor();
  assert.equal(await content(note), "External winning version");
  await page
    .getByRole("button", { name: "Save recovery copy", exact: true })
    .click();
  await until(
    async () =>
      (await page.locator(".note-heading h1").textContent()).includes(
        "recovered",
      ),
    "Recovery not opened",
  );
  await saved(page);
  assert.ok(
    (await editor(page).textContent()).includes("My local draft kept safely"),
  );
  // Return-to-main uses a save/receive/acknowledge handoff before closing the source.
  await other.getByRole("button", { name: "Tab options for Simon" }).click();
  await other.getByRole("menuitem", { name: "Move to main window" }).click();
  await until(async () => other.isClosed(), "Detached window did not reattach");
  assert.ok(
    (await page.locator('[data-tab-id="1"]').textContent()).includes(
      "recovered",
    ),
    "Reattaching must preserve the destination main tab",
  );
  await page.getByRole("tab", { name: "Simon", exact: true }).waitFor();
  await menu(note);
  await page
    .getByRole("menuitem", { name: "Open in separate window", exact: true })
    .click();
  await until(
    async () => context.pages().some((p) => p !== page && !p.isClosed()),
    "Second detached window did not open",
  );
  const returning = context.pages().find((p) => p !== page && !p.isClosed());
  await editor(returning).waitFor();
  const returnLabel = await returning.evaluate(
    () => window.__TAURI_INTERNALS__.metadata.currentWindow.label,
  );
  const transfer = await page.evaluateHandle(
    ({ source, path }) => {
      const data = new DataTransfer();
      data.setData(
        "application/notus-tab",
        JSON.stringify({ source, path, id: 1 }),
      );
      return data;
    },
    { source: returnLabel, path: note },
  );
  await page
    .locator(".tab-strip")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await until(
    async () => returning.isClosed(),
    "Cross-window tab drop did not reattach",
  );
  await menu(note);
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await until(async () => !(await exists(note)), "Note not trashed");
  await until(
    async () => (await page.getByRole("tab").count()) === 1,
    "Deleted note must not leave a blank extra tab",
  );
  assert.equal((await invoke(page, "list_trash")).length, 1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("button", { name: "Restore Simon.md" }).waitFor();
  await page.screenshot({ path: "artifacts/notus-040-trash.png" });
  await page.getByRole("button", { name: "Restore Simon.md" }).click();
  await until(() => exists(note), "Note not restored");
  assert.equal(await content(note), "External winning version");
  await page.getByRole("button", { name: "Close settings" }).click();
  // Folder payloads, safe collision refusal, explicit permanent-delete confirmation.
  await menu("Eco-innovation/Singapore");
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await until(
    async () => !(await exists("Eco-innovation/Singapore")),
    "Folder not trashed",
  );
  await create("folder", "Singapore", "Eco-innovation");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore Singapore", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "already exists" }).waitFor();
  assert.equal((await invoke(page, "list_trash")).length, 1);
  await page.getByRole("button", { name: "Empty Trash…", exact: true }).click();
  assert.equal(
    (await invoke(page, "list_trash")).length,
    1,
    "Confirmation must precede deletion",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal((await invoke(page, "list_trash")).length, 1);
  await page.getByRole("button", { name: "Empty Trash…", exact: true }).click();
  await page
    .getByRole("button", { name: "Permanently delete", exact: true })
    .click();
  await until(
    async () => (await invoke(page, "list_trash")).length === 0,
    "Trash not emptied",
  );
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.getByRole("button", { name: "Close settings" }).click();
  await create("note", "Welcome", "Eco-innovation/Singapore");
  await editor(page).fill(
    "# A quiet place to think\n\nNotus keeps your notes in ordinary Markdown files.\n\n- Vaults for projects\n- Folders for structure\n- Notes for ideas\n\nEverything saves as you write.",
  );
  await saved(page);
  await create("vault", "Personal");
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await page.locator(".inline-name input").fill("A new vault");
  await page.screenshot({ path: "artifacts/notus-040-inline.png" });
  await page.locator(".inline-name input").press("Escape");
  assert.equal(await exists("A new vault"), false);
  await page.getByRole("button", { name: "Lock note", exact: true }).click();
  await delay(4600);
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/notus-040-dark.png" });
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.screenshot({ path: "artifacts/notus-040-light.png" });
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await editor(page).fill("Saved immediately when closing the window.");
  await page.getByRole("button", { name: "Close window", exact: true }).click();
  await until(async () => page.isClosed(), "Window failed to close");
  assert.equal(
    await content("Eco-innovation/Singapore/Welcome.md"),
    "Saved immediately when closing the window.",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        root,
        checks: [
          "strict hierarchy",
          "light inline input",
          "continuous autosave",
          "persistent enforced lock",
          "note-to-tab drop",
          "permanent main tab",
          "native detached window",
          "shared edit and lock",
          "revision conflict recovery",
          "save/ack reattach",
          "internal trash",
          "restore",
          "collision refusal",
          "empty confirmation",
          "both themes",
          "save on close",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page && !page.isClosed())
    await page
      .screenshot({ path: "artifacts/notus-040-failure.png" })
      .catch(() => {});
  console.error("Temporary test workspace:", root);
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  // This process was started with an isolated temporary workspace, never the user's app.
  child.kill();
}
