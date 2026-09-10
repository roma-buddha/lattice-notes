import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "notus-061-test-"));
const root = path.join(temp, "workspace");
await fs.mkdir(root);
const child = spawn(
  process.env.NOTUS_EXECUTABLE ||
    path.resolve("src-tauri/target/release/lotus.exe"),
  [],
  {
    windowsHide: true,
    env: {
      ...process.env,
      NOTUS_ROOT: root,
      WEBVIEW2_USER_DATA_FOLDER: path.join(temp, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9239",
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
      browser = await chromium.connectOverCDP("http://127.0.0.1:9239");
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
  assert.equal(await page.locator(".title-brand").textContent(), "Lotus");
  const initialSidebarWidth = await page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().width);
  await page.getByRole("separator", { name: "Resize sidebar" }).focus();
  await page.keyboard.press("ArrowRight");
  assert.ok((await page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().width)) > initialSidebarWidth);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  assert.equal(await page.locator(".search-box").count(), 0);
  await page.getByRole("button", { name: "Find a note (Ctrl+P)" }).click();
  await page.getByRole("button", { name: "Find a note (Ctrl+P)" }).click();
  assert.equal(await page.locator(".search-box").count(), 0);
  await page.getByRole("button", { name: "Find a note (Ctrl+P)" }).click();
  await page
    .getByRole("textbox", { name: "Find a note or folder", exact: true })
    .fill("test");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".search-box").count(), 0);
  await page.keyboard.press("Control+p");
  assert.equal(
    await page
      .getByRole("textbox", { name: "Find a note or folder", exact: true })
      .inputValue(),
    "",
  );
  await page.keyboard.press("Escape");
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
  assert.equal(await page.locator(".file-tree .tree-select svg").count(), 0);
  assert.equal(await page.locator(".note-heading h1").evaluate((el) => getComputedStyle(el).fontSize), "29.75px");
  await page.getByRole("button", { name: "Add property", exact: true }).click();
  const propertyName = page.getByRole("textbox", { name: "Property name" });
  await propertyName.fill("topic");
  await propertyName.press("Enter");
  await page.getByRole("textbox", { name: "Value for topic" }).fill("testing");
  const editor = page.locator(".cm-content[contenteditable=true]");
  await editor.fill("# Preview heading\n- Preview item");
  await page.keyboard.press("ArrowUp");
  assert.equal(await page.locator(".cm-live-heading").count(), 1);
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
  assert.equal(await page.locator(".table-controls").count(), 0);
  await page.getByRole("button", { name: "Select row 1", exact: true }).click();
  assert.equal(await page.locator(".table-selected").count(), 2);
  await page
    .getByRole("button", { name: "Select row 1", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Insert row below", exact: true })
    .click();
  assert.equal(await page.locator(".table-data-row").count(), 4);
  await page
    .getByRole("button", { name: "Select column 1", exact: true })
    .click();
  assert.equal(await page.locator(".table-selected").count(), 4);
  await page
    .getByRole("button", { name: "Select column 1", exact: true })
    .press("Shift+F10");
  await page
    .getByRole("menuitem", { name: "Insert column right", exact: true })
    .click();
  assert.equal(
    await page.locator(".table-data-row").first().locator("input").count(),
    3,
  );
  await page
    .getByRole("button", { name: "Select column 2", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Align column center", exact: true }).click();
  await page
    .getByRole("button", { name: "Select column 2", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete column", exact: true })
    .click();
  assert.equal(
    await page.locator(".table-data-row").first().locator("input").count(),
    2,
  );
  await page
    .getByRole("button", { name: "Select row 2", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete row", exact: true }).click();
  assert.equal(await page.locator(".table-data-row").count(), 3);
  await page.keyboard.press("Control+s");
  await until(
    async () => (await page.locator(".note-save-status.saved").count()) === 1,
    "Not saved",
  );
  const beforeAppearance = await fs.readFile(
    path.join(root, "Work/Drafts/Alpha.md"),
    "utf8",
  );
  await cell.click({ button: "right" });
  await page
    .getByRole("menuitemcheckbox", {
      name: "Highlight first column",
      exact: true,
    })
    .click();
  assert.equal(
    await page.locator(".editable-table.highlight-first-column").count(),
    1,
  );
  await page
    .getByRole("button", { name: "Text appearance", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Font family" })
    .selectOption("Georgia");
  await page.getByRole("slider", { name: "Font size" }).fill("20");
  for (const alignment of ["center", "right", "justify", "left", "center"]) {
    await page
      .getByRole("combobox", { name: "Note alignment" })
      .selectOption(alignment);
    assert.equal(
      await page
        .locator(".cm-line")
        .first()
        .evaluate((e) => getComputedStyle(e).textAlign),
      alignment,
    );
  }
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
  assert.equal(
    await page
      .locator(".reading")
      .evaluate((e) => getComputedStyle(e).textAlign),
    "center",
  );
  assert.equal(
    await page.locator(".reading table.highlight-first-column").count(),
    1,
  );
  assert.equal(
    await fs.readFile(path.join(root, "Work/Drafts/Alpha.md"), "utf8"),
    beforeAppearance,
  );
  assert.equal(await page.locator(".editable-table").count(), 0);
  assert.ok(
    (await page.locator(".reading table").textContent()).includes(
      "Hello | world typed continuously",
    ),
  );
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await cell.waitFor();
  await page.screenshot({ path: "artifacts/notus-061-table-dark.png" });
  assert.equal(
    await page
      .locator(".document-scroll")
      .evaluate((el) => getComputedStyle(el).scrollbarWidth),
    "thin",
  );
  const noteEdge = await page
    .locator(".document-scroll")
    .evaluate((el) => el.getBoundingClientRect().right);
  const workspaceEdge = await page
    .locator("#editor-workspace")
    .evaluate((el) => el.getBoundingClientRect().right);
  assert.ok(Math.abs(noteEdge - workspaceEdge) < 2);
  for (let i = 0; i < 32; i++)
    await invoke("create_entry", {
      parent: "Personal",
      kind: "folder",
      name: "Extra folder " + i,
    });

  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  // The toolbar button is a toggle: the organizer remained open in a background
  // tab, so the first click closes it and the second opens a fresh active tab.
  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  assert.equal(await page.locator(".organizer-vault").count(), 0);
  assert.equal(await page.locator(".organizer-section").count(), 2);
  const organizer = page.locator(".organizer");
  assert.equal(
    await organizer.evaluate((el) => getComputedStyle(el).scrollbarWidth),
    "thin",
  );
  assert.ok(
    Math.abs(
      (await organizer.evaluate((el) => el.getBoundingClientRect().right)) -
        workspaceEdge,
    ) < 2,
  );
  await until(
    () => organizer.evaluate((el) => el.scrollHeight > el.clientHeight),
    "Organizer did not overflow",
  );
  await organizer.hover();
  await page.mouse.wheel(0, 500);
  await until(
    () => organizer.evaluate((el) => el.scrollTop > 100),
    "Organizer wheel scrolling failed",
  );
  await organizer.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({ path: "artifacts/notus-061-organizer-scroll.png" });
  await organizer.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByRole("textbox", { name: "Filter organizer" }).fill("Alpha");

  await page
    .locator('.organizer-note[title="Work/Drafts/Alpha.md"]')
    .evaluate((el) => {
      el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    });
  await page.getByRole("textbox", { name: "Filter organizer" }).fill("");
  assert.equal(await page.locator(".move-note-button, .move-note-form").count(), 0);
  await page.evaluate(() => {
    const source = document
      .querySelector('.organizer-note[title="Work/Drafts/Alpha.md"]')
      ?.closest("li");
    const target = document.querySelector('[data-folder="Personal/Notes"]');
    if (!source || !target) throw new Error("Drag fixtures missing");
    const data = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: data }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: data }));
  });
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
  await page.screenshot({ path: "artifacts/notus-061-organizer-dark.png" });
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.screenshot({ path: "artifacts/notus-061-organizer-light.png" });
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
  const sidebarWidth = await page
    .locator(".sidebar")
    .evaluate((el) => el.getBoundingClientRect().width);
  const longVault =
    "Digital Finance Course with a complete and deliberately long vault name";
  await invoke("create_entry", { parent: "", kind: "vault", name: longVault });
  await delay(1200);
  await page.getByRole("button", { name: "Choose vault", exact: true }).click();
  await page
    .locator(".vault-options")
    .getByRole("button", { name: longVault, exact: true })
    .click();
  assert.equal(
    await page.locator(".vault-choice strong").textContent(),
    longVault,
  );
  assert.equal(
    await page
      .locator(".vault-choice strong")
      .evaluate((el) => getComputedStyle(el).whiteSpace),
    "normal",
  );
  assert.ok(
    await page
      .locator(".vault-choice strong")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  );
  assert.equal(
    await page
      .locator(".sidebar")
      .evaluate((el) => el.getBoundingClientRect().width),
    sidebarWidth,
  );
  await page.screenshot({ path: "artifacts/notus-061-vault-name.png" });
  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  await page.locator('.organizer-note[title="Work/Drafts/Alpha.md"]').click();
  await page.locator(".cm-line").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open in new window", exact: true }).click();
  await until(
    () => context.pages().some((p) => p.url().includes("note=")),
    "Detached window missing",
  );
  const detached = context.pages().find((p) => p.url().includes("note="));
  await detached
    .getByRole("button", { name: "Lock note", exact: true })
    .waitFor();
  await detached.keyboard.press("Control+Shift+Enter");
  await until(() => detached.isClosed(), "Return to main window failed");
  await page.locator(".editable-table.highlight-first-column").waitFor();
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
          "row/column selection, context menus and deletion",
          "first-column highlight persistence",
          "per-note alignment",
          "full-width thin organizer scrollbar",
          "on-demand search",
          "Markdown read-only rendering",
          "font family",
          "lock",
          "cross-vault move and undo",
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
      .screenshot({ path: "artifacts/notus-061-failure.png" })
      .catch(() => {});
  console.error({ root, errors });
  throw error;
} finally {
  await browser?.close().catch(() => {});
  child.kill();
}
