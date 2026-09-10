import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lotus-080-test-"));
const root = path.join(temp, "workspace");
await fs.mkdir(path.join(root, "Work", "Notes"), { recursive: true });
await fs.mkdir(path.join(root, "Personal", "Journal"), { recursive: true });
const notePath = "Work/Notes/Alpha.md";
const initial =
  '---\ncreated: 2026-08-26\ntype: health\ntags: [one, two]\ncount: 5\nactive: true\ncustom:\n  nested: keep\n---\n# A <span style="color: #c44f59">colored</span> heading\n\nA [website](https://example.com) and [Beta](Work/Notes/Beta.md).\n\n| Topic | Value | Other |\n| --- | --- | --- |\n| Long text that must wrap across multiple lines without losing any words in this column | 49.0% | One |\n| Second | 30.0% | Two |\n| Third | 21.0% | Three |\n\nAfter table\n';
await fs.writeFile(path.join(root, notePath), initial);
await fs.writeFile(path.join(root, "Work/Notes/Beta.md"), "Beta text\n");
let browser, page, child;
const errors = [];
const checks = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await pause(100);
  }
  throw Error(label);
}
async function menu(label) {
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
try {
  child = spawn(
    process.env.NOTUS_EXECUTABLE ||
      path.resolve("src-tauri/target/release/lotus.exe"),
    [],
    {
      windowsHide: true,
      env: {
        ...process.env,
        NOTUS_ROOT: root,
        WEBVIEW2_USER_DATA_FOLDER: path.join(temp, "webview"),
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9240",
      },
    },
  );
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9240");
      return true;
    } catch {
      return false;
    }
  }, "Webview did not start");
  await until(() => {
    page = browser
      .contexts()[0]
      .pages()
      .find(
        (p) =>
          p.url().includes("tauri.localhost") ||
          p.url().includes("127.0.0.1:1420"),
      );
    return !!page;
  }, "Page absent");
  page.setDefaultTimeout(7000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  assert.equal(await page.locator(".explorer-vault[open]").count(), 0);
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await page.locator('.organizer-note[title="Work/Notes/Alpha.md"]').click();
  checks.push("Organizer collapsed initially, expand all opens notes");
  await page.locator(".editable-table").waitFor();
  assert.equal(
    await page.locator(".note-heading .properties-panel").count(),
    0,
  );
  assert.equal(
    await page.locator(".document-scroll .properties-panel").count(),
    1,
  );
  assert.equal(await page.getByText("Raw YAML", { exact: true }).count(), 0);
  assert.equal(
    await page.getByRole("textbox", { name: "Value for type" }).inputValue(),
    "health",
  );
  assert.equal(await page.locator(".property-chip").count(), 2);
  await page.getByRole("textbox", { name: "Value for type" }).fill("identity");
  await page.getByRole("textbox", { name: "Value for type" }).press("Tab");
  await until(
    async () =>
      (await fs.readFile(path.join(root, notePath), "utf8")).includes(
        "type: identity",
      ),
    "Properties did not save",
  );
  const yamlText = await fs.readFile(path.join(root, notePath), "utf8");
  assert.ok(yamlText.includes("2026-08-26"));
  assert.ok(!yamlText.includes("T00:"));
  assert.ok(yamlText.includes("count: 5"));
  assert.ok(yamlText.includes("active: true"));
  assert.ok(yamlText.includes("nested: keep"));
  checks.push("Typed YAML properties and tags preserved");
  assert.equal(await page.locator(".cm-inline-color").textContent(), "colored");
  assert.ok(!(await page.locator(".cm-content").innerText()).includes("<span"));
  const preview = page.locator('[data-row="1"][data-column="0"] .cell-preview');
  assert.ok((await preview.boundingBox()).height > 45);
  await preview.click();
  const cell = page.getByRole("textbox", {
    name: "Row 1, column 1",
    exact: true,
  });
  await cell.fill(
    "A wrapped note with enough text to occupy more than one line and remain completely visible.",
  );
  await cell.press("Tab");
  await until(
    async () =>
      (await fs.readFile(path.join(root, notePath), "utf8")).includes(
        "A wrapped note",
      ),
    "Table did not autosave",
  );
  const c1 = page.getByRole("button", { name: "Select column 1", exact: true }),
    c2 = page.getByRole("button", { name: "Select column 2", exact: true });
  const a = await c1.boundingBox(),
    b = await c2.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.locator(".table-selected").count(), 8);
  await c2.click({ button: "right" });
  await menu("Column alignment");
  await menu("Align column center");
  assert.equal(
    await page
      .locator('[data-row="1"][data-column="0"]')
      .evaluate((el) => getComputedStyle(el).textAlign),
    "center",
  );
  assert.equal(
    await page
      .locator('[data-row="1"][data-column="1"]')
      .evaluate((el) => getComputedStyle(el).textAlign),
    "center",
  );
  await until(
    async () =>
      (await fs.readFile(path.join(root, notePath), "utf8")).includes(
        "| :---: | :---: |",
      ),
    "Alignment delimiter not saved",
  );
  await c1.click({ button: "right" });
  await menu("Highlight first column");
  assert.equal(
    await page
      .locator('[data-row="1"][data-column="0"] .cell-preview')
      .evaluate((el) => getComputedStyle(el).fontWeight),
    "400",
  );
  const resize = page.getByRole("separator", {
    name: "Resize column 1",
    exact: true,
  });
  const rect = await resize.boundingBox();
  const before = await page
    .locator("colgroup col")
    .nth(1)
    .evaluate((el) => el.getBoundingClientRect().width);
  await page.mouse.move(rect.x + 3, rect.y + 5);
  await page.mouse.down();
  await page.mouse.move(rect.x + 83, rect.y + 5, { steps: 8 });
  await page.mouse.up();
  const after = await page
    .locator("colgroup col")
    .nth(1)
    .evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(after > before + 50);
  checks.push(
    "Mouse multi-column selection, alignment, first-column normal weight and resize",
  );
  const r1 = page.getByRole("button", { name: "Select row 1", exact: true }),
    r2 = page.getByRole("button", { name: "Select row 2", exact: true });
  const ra = await r1.boundingBox(),
    rb = await r2.boundingBox();
  await page.mouse.move(ra.x + 5, ra.y + 8);
  await page.mouse.down();
  await page.mouse.move(rb.x + 5, rb.y + 8, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.locator(".table-selected").count(), 6);
  await r2.click({ button: "right" });
  assert.equal(await page.locator(".table-selected").count(), 6);
  await page.keyboard.press("Escape");
  const firstCell = page.locator(
      '[data-row="1"][data-column="1"] .cell-preview',
    ),
    lastCell = page.locator('[data-row="3"][data-column="1"] .cell-preview');
  const ca = await firstCell.boundingBox(),
    cb = await lastCell.boundingBox();
  await page.mouse.move(ca.x + 12, ca.y + 12);
  await page.mouse.down();
  await page.mouse.move(cb.x + 12, cb.y + 12, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.locator(".table-selected").count(), 3);
  checks.push("Mouse multi-row and cell-range selection");
  await page.locator('[data-row="2"][data-column="2"] .cell-preview').click();
  const linkCell = page.getByRole("textbox", {
    name: "Row 2, column 3",
    exact: true,
  });
  await linkCell.fill("Source");
  await linkCell.press("Control+a");
  await linkCell.click({ button: "right" });
  await menu("Add or edit link…");
  await page
    .getByRole("textbox", { name: "Website or note path" })
    .fill("https://example.com");
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  await page.locator(".cm-line").last().click();
  assert.equal(
    await page
      .locator('[data-row="2"][data-column="2"] .cell-preview a')
      .textContent(),
    "Source",
  );
  await until(
    async () =>
      (await fs.readFile(path.join(root, notePath), "utf8")).includes(
        "[Source](https://example.com)",
      ),
    "Table link did not save",
  );
  checks.push("Labeled hyperlinks in table cells");
  await page.locator(".cm-line").last().click({ button: "right" });
  await menu("Add to bookmarks");
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.equal(await page.locator(".bookmarks-list button").count(), 1);
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await menu("Side by side");
  await page.locator(".secondary-pane .cm-content").waitFor();
  await page.locator(".secondary-pane .cm-line").last().click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Both panes update");
  await until(
    async () =>
      (await page.locator(".primary-pane .cm-content").innerText()).includes(
        "Both panes update",
      ),
    "Same-note panes not synced",
  );
  await page
    .locator(".file-tree button")
    .filter({ hasText: "Beta" })
    .first()
    .click();
  await until(
    async () =>
      (await page.locator(".pane-label").textContent()).includes("Beta"),
    "Sidebar did not open active second pane",
  );
  await page.locator(".secondary-pane .cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Second pane autosave");
  await until(
    async () =>
      (
        await fs.readFile(path.join(root, "Work/Notes/Beta.md"), "utf8")
      ).includes("Second pane autosave"),
    "Second pane autosave failed",
  );
  await page
    .getByRole("button", { name: "Close second pane", exact: true })
    .click();
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await menu("Top and bottom");
  const upper = await page.locator(".primary-pane").boundingBox(),
    lower = await page.locator(".secondary-pane-wrap").boundingBox();
  assert.ok(lower.y > upper.y + upper.height - 2);
  const divider = page.getByRole("separator", { name: "Resize split panes" });
  const dr = await divider.boundingBox();
  await page.mouse.move(dr.x + 100, dr.y + 2);
  await page.mouse.down();
  await page.mouse.move(dr.x + 100, dr.y + 32, { steps: 5 });
  await page.mouse.up();
  assert.ok(
    (await page.locator(".primary-pane").boundingBox()).height >
      upper.height + 10,
  );
  await page
    .getByRole("button", { name: "Close second pane", exact: true })
    .click();
  checks.push(
    "Bookmarks toggle, independent panes, shared-note synchronization and autosave",
  );
  await page
    .locator(".file-tree button")
    .filter({ hasText: "Beta" })
    .first()
    .click();
  const editor = page.locator(".primary-pane .cm-content");
  await editor.fill("Color label");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Format");
  await menu("Text color");
  await menu("Blue");
  await page.locator(".cm-inline-color").waitFor();
  await until(
    async () =>
      (
        await fs.readFile(path.join(root, "Work/Notes/Beta.md"), "utf8")
      ).includes('style="color: #357ac2"'),
    "Color did not persist",
  );
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Format");
  await menu("Text color");
  await menu("Default color");
  assert.equal(await page.locator(".cm-inline-color").count(), 0);
  await editor.fill("Website label");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Add or edit link…");
  await page
    .getByRole("textbox", { name: "Website or note path" })
    .fill("https://example.com");
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  assert.equal(
    await page.locator(".cm-note-link").textContent(),
    "Website label",
  );
  await until(
    async () =>
      (
        await fs.readFile(path.join(root, "Work/Notes/Beta.md"), "utf8")
      ).includes("[Website label](https://example.com)"),
    "Link not saved",
  );
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Remove link");
  assert.equal(await page.locator(".cm-note-link").count(), 0);
  checks.push(
    "Nested Format/color menus, default color removal, labeled Markdown links",
  );
  await page.getByRole("tab", { name: "Alpha", exact: true }).click();
  await page.getByRole("button", { name: "Lock note", exact: true }).click();
  await page.locator(".reading table").waitFor();
  assert.equal(
    await page.locator(".reading table.highlight-first-column").count(),
    1,
  );
  await page.screenshot({ path: "artifacts/lotus-080-light.png" });
  await page
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  await page.screenshot({ path: "artifacts/lotus-080-dark.png" });
  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  assert.equal(await page.locator(".explorer-vault[open]").count(), 0);
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await page
    .getByRole("button", { name: "Actions for Work", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Convert to folder…", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Destination vault" })
    .selectOption("Personal");
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await page.locator(".conversion-preview").waitFor();
  assert.ok(
    (await page.locator(".conversion-preview").innerText()).includes(
      "Personal/Work/Notes - Alpha.md",
    ),
  );
  await page
    .getByRole("button", { name: "Confirm conversion", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Convert vault to a folder" })
    .waitFor({ state: "hidden" });
  await fs.access(path.join(root, "Personal/Work/Notes - Alpha.md"));
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.ok(
    (await page.locator(".bookmarks-list").innerText()).includes(
      "Notes - Alpha",
    ),
  );
  checks.push(
    "Conversion preview, verified file conversion and bookmark path updates",
  );
  for (let i = 0; i < 40; i++)
    await page.evaluate(
      (i) =>
        window.__TAURI_INTERNALS__.invoke("create_entry", {
          parent: "Personal",
          kind: "folder",
          name: "Folder " + i,
        }),
      i,
    );
  await pause(1200);
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  const organizer = page.locator(".organizer");
  assert.equal(
    await organizer.evaluate((el) => getComputedStyle(el).scrollbarWidth),
    "thin",
  );
  const edge = await organizer.evaluate(
      (el) => el.getBoundingClientRect().right,
    ),
    workspaceEdge = await page
      .locator("#editor-workspace")
      .evaluate((el) => el.getBoundingClientRect().right);
  assert.ok(Math.abs(edge - workspaceEdge) < 2);
  await organizer.hover();
  await page.mouse.wheel(0, 650);
  await until(
    () => organizer.evaluate((el) => el.scrollTop > 100),
    "Organizer does not scroll",
  );
  await page.screenshot({ path: "artifacts/lotus-080-organizer.png" });
  await page.reload();
  await page.getByRole("button", { name: "Bookmarks", exact: true }).waitFor();
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  await until(
    async () =>
      (await page.locator(".bookmarks-list").innerText()).includes(
        "Notes - Alpha",
      ),
    "Bookmarks lost after reload",
  );
  checks.push(
    "Organizer thin far-right wheel scrollbar and bookmarks across reload",
  );
  await page.getByRole("button",{name:"Bookmarks",exact:true}).click();
  await page.getByRole("button",{name:"Find a note (Ctrl+P)",exact:true}).click();
  await page.getByRole("textbox",{name:"Find a note or folder",exact:true}).fill("wrapped");
  await until(async()=>(await page.locator(".note-search-results").innerText()).includes("Notes - Alpha"),"Content search failed");
  await page.getByRole("button",{name:"Find a note (Ctrl+P)",exact:true}).click();
  await page.setViewportSize({width:760,height:600});
  const splitButton=await page.getByRole("button",{name:"Split view",exact:true}).boundingBox();
  const strip=await page.locator(".tab-strip").boundingBox();
  assert.ok(splitButton.x+splitButton.width<=strip.x+1);
  await page.screenshot({path:"artifacts/lotus-080-narrow.png"});
  checks.push("Content search and non-overlapping controls at narrow width");
  assert.deepEqual(errors, []);
  checks.push("Locked rendering, themes, no page errors");
  console.log(JSON.stringify({ result: "PASS", root, checks }, null, 2));
} catch (e) {
  console.error({ root, errors, checks });
  if (page)
    await page
      .screenshot({ path: "artifacts/lotus-080-failure.png" })
      .catch(() => {});
  throw e;
} finally {
  await browser?.close().catch(() => {});
  child?.kill();
}
