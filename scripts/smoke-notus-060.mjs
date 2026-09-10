import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "notus-060-test-"));
const root = path.join(temp, "workspace");
await fs.mkdir(root);
const child = spawn(
  process.env.NOTUS_EXECUTABLE ||
    path.resolve("src-tauri/target/release/notus.exe"),
  [],
  {
    windowsHide: true,
    env: {
      ...process.env,
      NOTUS_ROOT: root,
      WEBVIEW2_USER_DATA_FOLDER: path.join(temp, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9238",
    },
  },
);
let browser, page;
const errors = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, message) {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await delay(150);
  }
  throw Error(message);
}
const invoke = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
try {
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9238");
      return true;
    } catch {
      return false;
    }
  }, "Webview unavailable");
  const context = browser.contexts()[0];
  await until(
    () => context.pages().some((p) => p.url().includes("tauri.localhost")),
    "Missing page",
  );
  page = context.pages().find((p) => p.url().includes("tauri.localhost"));
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.getByRole("button", { name: "Add vault", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Create vault", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Vault name", exact: true })
    .fill("Work");
  await page.getByRole("combobox", { name: "Vault area" }).selectOption("new");
  await page.getByRole("textbox", { name: "Area name" }).fill("Professional");
  await page.locator(".area-icon-picker summary").click();
  assert.equal(
    await page.locator('[aria-label="Area icons"] button').count(),
    30,
  );
  await page.getByRole("button", { name: "science icon", exact: true }).click();
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "hidden" });
  let state = await invoke("get_organizer");
  assert.equal(state.areas[0].icon, "science");
  assert.equal(state.assignments.Work, state.areas[0].id);
  await invoke("create_entry", {
    parent: "Work",
    kind: "folder",
    name: "Drafts",
  });
  await invoke("create_entry", {
    parent: "Work/Drafts",
    kind: "note",
    name: "Alpha",
  });
  await invoke("create_entry", { parent: "", kind: "vault", name: "Personal" });
  await invoke("create_entry", {
    parent: "Personal",
    kind: "folder",
    name: "Notes",
  });
  await page.getByRole("button", { name: "Choose vault", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Create vault", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .locator(".vault-options")
      .evaluate((el) => getComputedStyle(el).flexDirection),
    "column",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  await page.locator('.organizer-note[title="Work/Drafts/Alpha.md"]').click();
  assert.equal(await page.locator(".tab-options").count(), 0);
  const editor = page.locator(".cm-content[contenteditable=true]");
  await editor.fill("Before table");
  await editor.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert table…" }).click();
  await page.getByRole("spinbutton", { name: "Table rows" }).fill("2");
  await page.getByRole("spinbutton", { name: "Table columns" }).fill("2");
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  const cell = page.getByRole("textbox", {
    name: "Row 1, column 1",
    exact: true,
  });
  await cell.fill("Hello | world");
  await cell.pressSequentially(" typed continuously", { delay: 75 });
  assert.ok((await cell.inputValue()).endsWith("continuously"));
  await until(
    async () =>
      (
        await fs.readFile(path.join(root, "Work/Drafts/Alpha.md"), "utf8")
      ).includes("Hello \\| world typed continuously"),
    "Table autosave failed",
  );
  await page.getByRole("button", { name: "+ Row", exact: true }).click();
  assert.equal(await page.locator(".editable-table tr").count(), 4);
  await page.getByRole("button", { name: "+ Column", exact: true }).click();
  assert.equal(
    await page.locator(".editable-table tr").first().locator("input").count(),
    3,
  );
  await page
    .getByRole("button", { name: "Text appearance", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Font family" })
    .selectOption("Georgia");
  await page.getByRole("slider", { name: "Font size" }).fill("20");
  await page.keyboard.press("Escape");
  assert.ok(
    (
      await page
        .locator(".editable-table")
        .evaluate((el) => getComputedStyle(el).fontFamily)
    ).includes("Georgia"),
  );
  await page.getByRole("button", { name: "Lock note", exact: true }).click();
  await page.locator(".reading table").waitFor();
  assert.equal(await page.locator(".editable-table").count(), 0);
  assert.ok(
    (await page.locator(".reading table").textContent()).includes(
      "Hello | world typed continuously",
    ),
  );
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await cell.waitFor();
  await page.screenshot({ path: "artifacts/notus-060-table-dark.png" });
  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  assert.equal(await page.locator(".organizer-vault").count(), 0);
  await page
    .locator('.organizer-note[title="Work/Drafts/Alpha.md"]')
    .dragTo(page.locator('[data-folder="Personal/Notes"] summary'));
  await until(async () => {
    try {
      await fs.access(path.join(root, "Personal/Notes/Alpha.md"));
      return true;
    } catch {
      return false;
    }
  }, "Cross-vault drag failed");
  await page
    .getByRole("button", { name: "Undo last move", exact: true })
    .click();
  await page.screenshot({ path: "artifacts/notus-060-organizer-dark.png" });
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.screenshot({ path: "artifacts/notus-060-organizer-light.png" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  assert.equal(
    await page
      .locator("dialog")
      .getByRole("button", { name: "Organize workspace", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.keyboard.press("Control+Shift+w");
  await until(
    async () => (await page.getByRole("tab").count()) === 0,
    "Close all failed",
  );
  assert.equal(await page.locator("#editor-workspace").textContent(), "");
  await page.getByRole("button",{name:"Organize workspace",exact:true}).click();
  await page.locator('.organizer-note[title="Work/Drafts/Alpha.md"]').click();
  await page.keyboard.press("Control+Shift+Enter");
  await until(()=>context.pages().some(p=>p.url().includes("note=")), "Detached window missing");
  const detached=context.pages().find(p=>p.url().includes("note="));
  await detached.getByRole("button",{name:"Lock note",exact:true}).waitFor();
  await detached.keyboard.press("Control+Shift+Enter");
  await until(()=>detached.isClosed(),"Return to main window failed");
  await page.locator(".editable-table").waitFor();
  await page.keyboard.press("Control+Shift+w");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        root,
        checks: [
          "vault category setup",
          "30 icons",
          "single-column picker",
          "compact tree",
          "editable table typing/autosave",
          "table row/column controls",
          "Markdown read-only rendering",
          "font family",
          "lock",
          "cross-vault drag and undo",
          "close-all shortcut",
          "light/dark",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: "artifacts/notus-060-failure.png" })
      .catch(() => {});
  console.error({ root, errors });
  throw error;
} finally {
  await browser?.close().catch(() => {});
  child.kill();
}
