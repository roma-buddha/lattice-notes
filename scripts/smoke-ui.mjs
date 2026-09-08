import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "notus-030-test-"));
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
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(test, message) {
  for (let i = 0; i < 100; i++) {
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
  page = context.pages().find((p) => p.url().includes("tauri.localhost"));
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  const invoke = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  const win = (command) =>
    invoke(`plugin:window|${command}`, { label: "main" });
  const row = (relative) =>
    page
      .locator(".tree-row")
      .filter({ has: page.locator(`.tree-select[title="${relative}"]`) });
  async function menu(relative, right = false) {
    const item = row(relative);
    await item.scrollIntoViewIfNeeded();
    if (right) await item.locator(".tree-select").click({ button: "right" });
    else await item.locator(".row-actions").click();
    await page.getByRole("menu").waitFor();
  }
  const input = () => page.locator(".inline-name input");
  async function confirm(name) {
    await input().fill(name);
    await input().press("Enter");
    await input().waitFor({ state: "hidden" });
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
          name:
            kind === "note"
              ? "New note"
              : parent.includes("/")
                ? "New subfolder"
                : "New folder",
          exact: true,
        })
        .click();
    }
    await confirm(name);
  }
  await page
    .getByRole("heading", { name: "Your workspace", exact: true })
    .waitFor();
  assert.deepEqual(await fs.readdir(root), []);
  assert.equal(await win("is_decorated"), false);
  assert.equal(await win("is_resizable"), true);
  assert.ok(
    Math.abs(
      (await page.locator(".unified-titlebar").boundingBox()).height - 44,
    ) < 0.5,
    "Title bar must be 44 CSS pixels (allow DPI rounding)",
  );
  assert.equal(
    await page.locator(".brand, .topbar, .create-toolbar").count(),
    0,
  );
  await page.getByRole("button", { name: "New tab", exact: true }).click();
  assert.equal(await page.getByRole("tab").count(), 2);
  assert.deepEqual(await fs.readdir(root), []);
  await page
    .getByRole("button", { name: "Close tab New tab", exact: true })
    .last()
    .click();
  await create("vault", "Digital Transformation");
  await menu("Digital Transformation", true);
  assert.deepEqual(await page.getByRole("menuitem").allTextContents(), [
    "New folder",
    "New note",
    "Vault settings",
  ]);
  await page.keyboard.press("End");
  assert.equal(
    await page
      .getByRole("menuitem", { name: "Vault settings" })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await row("Digital Transformation")
      .locator(".row-actions")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await create("note", "Overview", "Digital Transformation");
  assert.equal(await exists("Digital Transformation/Overview.md"), true);
  assert.equal(
    await invoke("create_entry", {
      parent: "",
      kind: "note",
      name: "Rogue",
    }).then(
      () => false,
      () => true,
    ),
    true,
  );
  await create("folder", "Chapter 1", "Digital Transformation");
  await create("folder", "Research", "Digital Transformation/Chapter 1");
  await create("note", "Eco-innovation", "Digital Transformation/Chapter 1");
  const editor = page.locator(".cm-content");
  await editor.fill(
    "# Designing a more sustainable future\n\nEco-innovation connects thoughtful research with practical changes in how we work.\n\n## Research questions\n\n- Where can digital tools reduce material waste?\n- How do we measure the impact of a new idea?\n- Which changes are useful enough to last?\n\n> Start with a small experiment. Learn from what changes.\n",
  );
  await page.getByRole("button", { name: "New tab", exact: true }).click();
  await until(
    async () =>
      (
        await fs.readFile(
          path.join(root, "Digital Transformation/Chapter 1/Eco-innovation.md"),
          "utf8",
        )
      ).includes("small experiment"),
    "New tab did not flush draft",
  );
  await row("Digital Transformation/Overview.md")
    .locator(".tree-select")
    .click();
  await page
    .locator(".note-heading")
    .getByRole("heading", { name: "Overview", exact: true })
    .waitFor();
  await editor.fill(
    "# Overview\n\nA workspace for research, chapters and connected ideas.",
  );
  await page.getByRole("tab", { name: "Eco-innovation", exact: true }).click();
  await page
    .getByRole("heading", { name: "Eco-innovation", exact: true })
    .waitFor();
  assert.match(
    await fs.readFile(
      path.join(root, "Digital Transformation/Overview.md"),
      "utf8",
    ),
    /connected ideas/,
  );
  // Parent from context menu must override selected note's parent.
  await menu("Digital Transformation/Chapter 1/Research", true);
  assert.deepEqual(await page.getByRole("menuitem").allTextContents(), [
    "New note",
    "New subfolder",
    "Rename",
    "Delete",
  ]);
  await page.getByRole("menuitem", { name: "New note", exact: true }).click();
  assert.equal(
    await input().evaluate((el) => el === document.activeElement),
    true,
  );
  await input().fill("Cancelled draft");
  await input().press("Escape");
  assert.equal(
    await exists(
      "Digital Transformation/Chapter 1/Research/Cancelled draft.md",
    ),
    false,
  );
  await create("note", "Sources", "Digital Transformation/Chapter 1/Research");
  assert.equal(
    await exists("Digital Transformation/Chapter 1/Research/Sources.md"),
    true,
  );
  assert.equal(
    await exists("Digital Transformation/Chapter 1/Sources.md"),
    false,
  );
  await menu("Digital Transformation/Chapter 1/Research/Sources.md");
  assert.deepEqual(await page.getByRole("menuitem").allTextContents(), [
    "Rename",
    "Delete",
  ]);
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await input().fill("Cancelled rename");
  await input().press("Escape");
  assert.equal(
    await exists("Digital Transformation/Chapter 1/Research/Sources.md"),
    true,
  );
  await menu("Digital Transformation/Chapter 1/Research/Sources.md");
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await input().fill("bad:name");
  await input().press("Enter");
  await page.locator(".inline-error").waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await confirm("Evidence");
  await menu("Digital Transformation/Chapter 1/Research");
  await page.getByRole("menuitem", { name: "New note", exact: true }).click();
  await input().fill("Evidence");
  await input().press("Enter");
  await page.locator(".inline-error").waitFor();
  assert.match(
    await page.locator(".inline-error").innerText(),
    /already exists/,
  );
  await input().press("Escape");
  await create("vault", "Personal");
  await row("Digital Transformation/Chapter 1/Research/Evidence.md").dragTo(
    row("Personal"),
  );
  await until(
    () => exists("Personal/Evidence.md"),
    "Cross-vault root move failed",
  );
  await menu("Personal");
  await page.getByRole("menuitem", { name: "Vault settings" }).click();
  await page
    .getByRole("button", { name: "Remove from sidebar", exact: true })
    .click();
  await until(
    async () => (await row("Personal").count()) === 0,
    "Vault remained registered",
  );
  assert.equal(await exists("Personal/Evidence.md"), true);
  await page.reload();
  await page.getByRole("button", { name: "Hidden vaults (1)" }).waitFor();
  assert.equal(await row("Personal").count(), 0);
  await page.getByRole("button", { name: "Hidden vaults (1)" }).click();
  await page
    .getByRole("button", { name: "Restore Personal", exact: true })
    .click();
  await menu("Personal");
  await page.getByRole("menuitem", { name: "Vault settings" }).click();
  await page.getByRole("button", { name: "Rename vault", exact: true }).click();
  await confirm("Ideas");
  assert.equal(await exists("Ideas/Evidence.md"), true);
  // Bottom-edge panel clamping against isolated synthetic vaults.
  for (let i = 1; i <= 18; i++)
    await invoke("create_entry", {
      parent: "",
      kind: "vault",
      name: `Sample ${String(i).padStart(2, "0")}`,
    });
  await until(
    async () => (await row("Sample 18").count()) === 1,
    "Tree did not refresh",
  );
  await menu("Sample 18");
  await page.getByRole("menuitem", { name: "Vault settings" }).click();
  const bounds = await page
    .getByRole("dialog", { name: "Vault settings" })
    .boundingBox();
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  assert.ok(
    bounds.x >= 8 &&
      bounds.y >= 44 &&
      bounds.x + bounds.width <= viewport.width - 7 &&
      bounds.y + bounds.height <= viewport.height - 7,
    "Panel escaped viewport",
  );
  await page.keyboard.press("Escape");
  for (let i = 1; i <= 18; i++)
    await fs.rmdir(path.join(root, `Sample ${String(i).padStart(2, "0")}`));
  await until(
    async () => (await row("Sample 18").count()) === 0,
    "Tree did not refresh after sample cleanup",
  );
  await menu("Ideas/Evidence.md");
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await exists("Ideas/Evidence.md"), true);
  await menu("Ideas/Evidence.md");
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Move to Recycle Bin", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await exists("Ideas/Evidence.md"), false);
  await row("Digital Transformation/Chapter 1/Eco-innovation.md")
    .locator(".tree-select")
    .click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  assert.equal(
    await page
      .locator(".sidebar")
      .evaluate(
        (el) =>
          !el.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
          ),
      ),
    true,
  );
  assert.equal(
    await page
      .locator(".reading")
      .evaluate(
        (el) =>
          !el.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
          ),
      ),
    false,
  );
  await page
    .getByRole("button", { name: "Maximize window", exact: true })
    .click();
  await until(() => win("is_maximized"), "Maximize failed");
  await page
    .getByRole("button", { name: "Restore window", exact: true })
    .click();
  await until(async () => !(await win("is_maximized")), "Restore failed");
  await page.locator(".title-drag-space").dblclick();
  await until(() => win("is_maximized"), "Title-bar double-click failed");
  await page
    .getByRole("button", { name: "Restore window", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Minimize window", exact: true })
    .click();
  await until(() => win("is_minimized"), "Minimize failed");
  await win("unminimize");
  await until(async () => !(await win("is_minimized")), "Unminimize failed");
  await page.getByRole("button", { name: "Collapse sidebar (Ctrl+B)" }).click();
  assert.equal(await page.locator(".sidebar").count(), 0);
  await page.getByRole("button", { name: "Expand sidebar (Ctrl+B)" }).click();
  await page.getByRole("button", { name: "New tab", exact: true }).click();
  await row("Digital Transformation/Overview.md")
    .locator(".tree-select")
    .click();
  await page
    .locator(".note-heading")
    .getByRole("heading", { name: "Overview", exact: true })
    .waitFor();
  await page.getByRole("tab", { name: "Eco-innovation", exact: true }).click();
  await page
    .getByRole("heading", { name: "Eco-innovation", exact: true })
    .waitFor();
  await page.locator(".toast").waitFor({ state: "hidden" });
  await fs.mkdir("artifacts", { recursive: true });
  await menu("Digital Transformation/Chapter 1");
  await delay(200);
  await page.screenshot({ path: "artifacts/notus-030-light.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await menu("Digital Transformation/Chapter 1/Eco-innovation.md");
  await delay(200);
  await page.screenshot({ path: "artifacts/notus-030-dark.png" });
  await page.keyboard.press("Escape");
  // Save conflict and close regression checks against temporary files only.
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await editor.fill("# My unsaved version");
  const noteFile = path.join(
    root,
    "Digital Transformation/Chapter 1/Eco-innovation.md",
  );
  await fs.writeFile(noteFile, "# External version");
  await until(
    async () =>
      (await page.locator(".save-state").innerText()).includes("Conflict"),
    "Conflict not detected",
  );
  await page.reload();
  await until(
    async () =>
      (await page.locator(".save-state").innerText()).includes("Conflict"),
    "Recovery lost base revision",
  );
  assert.match(await editor.innerText(), /My unsaved version/);
  await page.getByRole("button", { name: "Save recovery copy" }).click();
  await until(
    async () =>
      (await fs.readdir(path.dirname(noteFile))).some((n) =>
        n.includes("recovered"),
      ),
    "Recovery copy missing",
  );
  assert.equal(await fs.readFile(noteFile, "utf8"), "# External version");
  await page
    .getByRole("heading", { name: /Eco-innovation recovered/ })
    .waitFor();
  await until(
    async () =>
      (await page.locator(".save-state").innerText()).includes("Saved"),
    "Recovery write did not finish",
  );
  await editor.fill("# Saved on close\n\nNo lost typing.");
  await page
    .getByRole("button", { name: "Close window", exact: true })
    .click()
    .catch(() => {});
  await until(async () => child.exitCode !== null, "App did not close");
  const copy = (await fs.readdir(path.dirname(noteFile))).find((n) =>
    n.includes("recovered"),
  );
  assert.match(
    await fs.readFile(path.join(path.dirname(noteFile), copy), "utf8"),
    /No lost typing/,
  );
  assert.deepEqual(errors, [], "Uncaught frontend errors");
  console.log(
    "PASS: real Tauri — integrated header/window controls, tabs/save, exact menus, inline parent/cancel/rename/collision, viewport clamp, registration/restore, cross-vault moves, recoverable delete, conflict recovery and close flush.",
  );
  console.log(`Isolated test evidence: ${testDir}`);
} catch (error) {
  if (page) {
    console.error(
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
    await page
      .screenshot({ path: "artifacts/notus-030-failure.png" })
      .catch(() => {});
  }
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
