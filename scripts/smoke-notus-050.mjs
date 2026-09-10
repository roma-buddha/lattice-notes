import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "notus-050-test-"));
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
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9236",
    },
    windowsHide: true,
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
  throw new Error(message);
}
const invoke = (p, command, args = {}) =>
  p.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const row = (relative) =>
  page
    .locator(".tree-row")
    .filter({ has: page.locator(`.tree-select[title="${relative}"]`) });
const editor = (p = page) => p.locator('.cm-content[contenteditable="true"]');
const content = (relative) => fs.readFile(path.join(root, relative), "utf8");
async function menu(relative) {
  if (!relative.includes("/"))
    await page
      .getByRole("button", { name: `Actions for ${relative}`, exact: true })
      .click();
  else await row(relative).locator(".row-actions").click();
}
async function create(kind, name, parent = "") {
  if (kind === "vault") {
    await page.getByRole("button", { name: "Add vault", exact: true }).click();
    assert.equal(
      await page
        .getByRole("menuitem", { name: "Add existing vault…", exact: true })
        .count(),
      1,
    );
    await page
      .getByRole("menuitem", { name: "Create vault", exact: true })
      .click();
  } else {
    await menu(parent);
    await page
      .getByRole("menuitem", {
        name: kind === "folder" ? "New folder" : "New note",
        exact: true,
      })
      .click();
  }
  const input = page.locator(".inline-name input");
  assert.equal(await input.count(), 1);
  await input.fill(name);
  await input.press("Enter");
  await input.waitFor({ state: "hidden" });
}
async function choose(name) {
  await page.getByRole("button", { name: "Choose vault", exact: true }).click();
  await page.getByRole("textbox", { name: "Find a vault" }).fill(name);
  await page
    .locator(".vault-options")
    .getByRole("button", { name, exact: true })
    .click();
}
async function organizer() {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Organize workspace", exact: true })
    .waitFor();
}
async function closeAll() {
  await page.locator(".tab-options").first().click();
  await page
    .getByRole("menuitem", { name: "Close all tabs", exact: true })
    .click();
  await until(
    async () => (await page.getByRole("tab").count()) === 0,
    "Tabs did not close",
  );
  assert.equal(await page.locator("#editor-workspace").textContent(), "");
}
try {
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9236");
      return true;
    } catch {
      return false;
    }
  }, "Webview did not start");
  const context = browser.contexts()[0];
  await until(
    async () =>
      context.pages().some((p) => p.url().includes("tauri.localhost")),
    "Page missing",
  );
  page = context.pages().find((p) => p.url().includes("tauri.localhost"));
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByText("No vaults yet.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("tab").count(), 0);
  assert.equal(await page.locator("#editor-workspace").textContent(), "");
  assert.equal(
    await page.locator(".tab-strip").getAttribute("data-tauri-drag-region"),
    "true",
  );
  await create("vault", "Work");
  await create("folder", "Drafts", "Work");
  await create("note", "Alpha", "Work/Drafts");
  const alpha = "Work/Drafts/Alpha.md";
  await editor().fill("# Continuous autosave\n\n");
  const typing = editor().pressSequentially(
    "Keep saving while I type without stopping.",
    { delay: 90 },
  );
  await delay(1500);
  assert.ok((await content(alpha)).includes("Keep"));
  await typing;
  await until(
    async () => (await content(alpha)).includes("stopping."),
    "Autosave failed",
  );
  const original = await content(alpha);
  await page
    .getByRole("button", { name: "Text appearance", exact: true })
    .click();
  await page.getByRole("slider", { name: "Font size" }).fill("22");
  await page.getByRole("combobox", { name: /Font weight/ }).selectOption("600");
  await page.keyboard.press("Escape");
  assert.equal(
    await editor().evaluate((e) => getComputedStyle(e).fontSize),
    "22px",
  );
  assert.equal(
    await editor().evaluate((e) => getComputedStyle(e).fontWeight),
    "600",
  );
  assert.equal(await content(alpha), original);
  await page.getByRole("button", { name: "Lock note", exact: true }).click();
  await page.locator(".reading").waitFor();
  assert.equal(
    await page
      .locator(".reading")
      .evaluate((e) => getComputedStyle(e).fontSize),
    "22px",
  );
  const locked = await invoke(page, "read_note", { path: alpha });
  assert.equal(locked.locked, true);
  assert.equal(
    await invoke(page, "write_note", {
      path: alpha,
      content: "forbidden",
      revision: locked.revision,
    }).then(
      () => false,
      () => true,
    ),
    true,
  );
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await create("vault", "Personal");
  await create("folder", "Ideas", "Personal");
  assert.equal(await row("Work/Drafts").count(), 0);
  assert.equal(
    await page.getByRole("tab", { name: "Alpha", exact: true }).count(),
    1,
  );
  await create("note", "Beta", "Personal/Ideas");
  await editor().fill("# Beta\n\nSecond note.");
  await choose("Work");
  assert.equal(await row("Personal/Ideas").count(), 0);
  assert.equal(await page.getByRole("tab").count(), 2);
  await row(alpha).dragTo(page.locator(".tab-strip"));
  assert.equal(await page.getByRole("tab").count(), 2);
  await page.getByRole("tab", { name: "Alpha", exact: true }).waitFor();
  await page
    .locator(".note-tab")
    .filter({ has: page.getByRole("tab", { name: "Beta", exact: true }) })
    .dragTo(
      page
        .locator(".note-tab")
        .filter({ has: page.getByRole("tab", { name: "Alpha", exact: true }) }),
    );
  assert.deepEqual(await page.getByRole("tab").allTextContents(), [
    "Beta",
    "Alpha",
  ]);
  await organizer();
  await page.getByRole("button", { name: "Create area", exact: true }).click();
  await page.getByRole("textbox", { name: "Area name" }).fill("Professional");
  await page
    .getByRole("button", { name: "briefcase icon", exact: true })
    .click();
  await page
    .locator(".area-form")
    .getByRole("button", { name: "Create area", exact: true })
    .click();
  await page.locator(".area-form").waitFor({ state: "hidden" });
  const state = await invoke(page, "get_organizer");
  await page
    .getByLabel("Area for Work", { exact: true })
    .selectOption(state.areas[0].id);
  await until(
    async () =>
      (await invoke(page, "get_organizer")).assignments.Work ===
      state.areas[0].id,
    "Assignment not saved",
  );
  assert.equal(await content(alpha), original);
  await page.screenshot({ path: "artifacts/notus-050-organizer-light.png" });
  await page.setViewportSize({ width: 680, height: 520 });
  await until(async () => {
    const strip = await page.locator(".tab-strip").boundingBox();
    const active = await page.locator(".note-tab.active").boundingBox();
    return (
      active.x >= strip.x - 1 &&
      active.x + active.width <= strip.x + strip.width + 1
    );
  }, "Active tab should remain visible after resizing");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: "artifacts/notus-050-organizer-compact.png" });
  await page.setViewportSize({ width: 1280, height: 840 });
  await page
    .locator(`.organizer-note[title="${alpha}"]`)
    .dragTo(page.locator('[data-folder="Personal/Ideas"] > summary'));
  await until(
    async () =>
      fs.access(path.join(root, "Personal/Ideas/Alpha.md")).then(
        () => true,
        () => false,
      ),
    "Drag move failed",
  );
  assert.equal(await content("Personal/Ideas/Alpha.md"), original);
  await page
    .getByRole("button", { name: "Undo last move", exact: true })
    .click();
  await until(
    async () =>
      fs.access(path.join(root, alpha)).then(
        () => true,
        () => false,
      ),
    "Undo failed",
  );
  // Keyboard alternative and refusal to overwrite an existing destination.
  await invoke(page, "create_entry", {
    parent: "Personal/Ideas",
    kind: "note",
    name: "Alpha",
  });
  await page
    .locator(`.organizer-note[title="${alpha}"]`)
    .locator("..")
    .getByRole("button", { name: "Move Alpha", exact: true })
    .click();
  await page.locator(".move-note-form select").selectOption("Personal/Ideas");
  await page.getByRole("button", { name: "Move note", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "already exists" }).waitFor();
  assert.equal(await content(alpha), original);
  await page
    .locator(".move-note-form")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  await page.screenshot({ path: "artifacts/notus-050-organizer-dark.png" });
  await closeAll();
  await page.screenshot({ path: "artifacts/notus-050-blank.png" });
  await page.reload();
  await page
    .getByRole("button", { name: "Choose vault", exact: true })
    .waitFor();
  await delay(1000);
  assert.equal(await page.getByRole("tab").count(), 0);
  await choose("Work");
  await row(alpha).locator(".tree-select").click();
  await editor().waitFor();
  assert.equal(
    await editor().evaluate((e) => getComputedStyle(e).fontSize),
    "22px",
  );
  await page
    .getByRole("button", { name: "Tab options for Alpha", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Open in separate window", exact: true })
    .click();
  await until(
    async () =>
      context.pages().some((p) => p !== page && p.url().includes("note=")),
    "Detached window missing",
  );
  const other = context
    .pages()
    .find((p) => p !== page && p.url().includes("note="));
  other.setDefaultTimeout(12000);
  other.on("pageerror", (e) => errors.push(e.message));
  await editor(other).waitFor();
  assert.equal(await page.getByRole("tab").count(), 0);
  assert.equal(
    await editor(other).evaluate((e) => getComputedStyle(e).fontSize),
    "22px",
  );
  // Another active view must prevent unsafe relocation.
  assert.equal(
    await invoke(page, "relocate_entry", {
      path: alpha,
      parent: "Personal/Ideas",
      name: "Moved Alpha.md",
    }).then(
      () => false,
      () => true,
    ),
    true,
  );
  await editor(other).fill("Saved from detached window");
  await other
    .getByRole("button", { name: "Tab options for Alpha", exact: true })
    .click();
  await other
    .getByRole("menuitem", { name: "Move to main window", exact: true })
    .click();
  await until(async () => other.isClosed(), "Detached window did not reattach");
  await editor().waitFor();
  assert.equal(await editor().textContent(), "Saved from detached window");
  // A stale revision cannot overwrite a competing write.
  const stale = await invoke(page, "read_note", { path: alpha });
  await invoke(page, "write_note", {
    path: alpha,
    content: "External revision",
    revision: stale.revision,
  });
  assert.equal(
    await invoke(page, "write_note", {
      path: alpha,
      content: "Stale overwrite",
      revision: stale.revision,
    }).then(
      () => false,
      () => true,
    ),
    true,
  );
  await until(
    async () => (await editor().textContent()) === "External revision",
    "External edit not refreshed",
  );
  // Keep the new hierarchy and Trash workflow safe after the tab model change.
  await menu(alpha);
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await until(
    async () => (await invoke(page, "list_trash")).length === 1,
    "Trash failed",
  );
  assert.equal(await page.getByRole("tab").count(), 0);
  const trash = await invoke(page, "list_trash");
  await invoke(page, "restore_trash", { id: trash[0].id });
  await until(
    async () => (await row(alpha).count()) === 1,
    "Restored note missing",
  );
  await row(alpha).locator(".tree-select").click();
  await editor().fill("Saved when last tab closes");
  await page
    .getByRole("button", { name: "Close tab Alpha", exact: true })
    .click();
  await until(
    async () => (await page.getByRole("tab").count()) === 0,
    "Last tab still open",
  );
  assert.equal(await content(alpha), "Saved when last tab closes");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        root,
        checks: [
          "blank zero-tab startup",
          "vault create/add menu",
          "strict focused sidebar",
          "cross-vault tabs",
          "continuous autosave",
          "display-only typography",
          "lock enforcement",
          "organizer areas persistence",
          "actual drag move",
          "move undo",
          "collision refusal",
          "light and dark",
          "zero-tab restart",
          "native detach and reattach",
          "Trash and restore",
          "save on last-tab close",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page && !page.isClosed())
    await page
      .screenshot({ path: "artifacts/notus-050-failure.png" })
      .catch(() => {});
  console.error("Temporary workspace:", root);
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  child.kill();
}
