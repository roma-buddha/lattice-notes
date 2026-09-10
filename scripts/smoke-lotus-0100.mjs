import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lotus-0100-test-"));
const root = path.join(temp, "workspace");
await fs.mkdir(path.join(root, "Work", "Notes"), { recursive: true });
await fs.mkdir(path.join(root, "Personal", "Journal"), { recursive: true });
const alpha = "Work/Notes/Alpha.md",
  beta = "Work/Notes/Beta.md";
const initial =
  "---\ncreated: 2026-08-26\ntags: [one, two]\ncount: 5\n---\n# A selectable heading\n\nPrecise mouse selection must work reliably.\n\n**Strong text** and *italic text*.\n\n> [!note] Scope of this note\n> Normal text with **bold words** and `filename.pdf`.\n\n| Topic | Value |\n| --- | --- |\n| Example | 49% |\n| Second | 51% |\n\nAfter table\n\n```mermaid\nflowchart LR\n  A[Source] --> B[Output]\n```\n\nFinal paragraph.\n";
await fs.writeFile(path.join(root, alpha), initial);
await fs.writeFile(path.join(root, beta), "Beta text\n");
let browser, page, child, clipboardBefore;
const errors = [],
  checks = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await pause(100);
  }
  throw Error(label);
}
async function menu(...labels) {
  for (const label of labels)
    await page.getByRole("menuitem", { name: label, exact: true }).click();
}
async function textRect(selector, needle) {
  return page.locator(selector).evaluate((el, needle) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent.indexOf(needle);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        const r = range.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }
    }
    throw Error("Text not found: " + needle);
  }, needle);
}
async function selectWord(
  needle,
  selector = '.primary-pane [aria-label="Note editor"]',
) {
  const r = await textRect(selector, needle);
  await page.mouse.move(r.x + 0.5, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width + 1, r.y + r.height / 2, { steps: 12 });
  await page.mouse.up();
  await pause(60);
  assert.equal(
    await page.evaluate(() => window.getSelection()?.toString()),
    needle,
    "Mouse selection: " + needle,
  );
  return r;
}
async function saved(note, predicate) {
  await until(async () => {
    try {
      return predicate(await fs.readFile(path.join(root, note), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
  }, "File not saved: " + note);
}
try {
  child = spawn(
    process.env.NOTUS_EXECUTABLE ||
      path.resolve("src-tauri/target/debug/lotus.exe"),
    [],
    {
      windowsHide: true,
      env: {
        ...process.env,
        NOTUS_ROOT: root,
        WEBVIEW2_USER_DATA_FOLDER: path.join(temp, "webview"),
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9241",
      },
    },
  );
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9241");
      return true;
    } catch {
      return false;
    }
  }, "Webview absent");
  await until(() => {
    page = browser
      .contexts()[0]
      .pages()
      .find((p) => /tauri.localhost|127.0.0.1:1420/.test(p.url()));
    return !!page;
  }, "Page absent");
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  clipboardBefore = await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("read_clipboard").catch(() => null),
  );

  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await page.locator(`.organizer-note[title="${alpha}"]`).click();
  const editor = page.locator('.primary-pane [aria-label="Note editor"]');
  await editor.waitFor();
  assert.equal(
    await editor.innerText().then((t) => t.includes("**")),
    false,
    "Bold syntax hidden",
  );
  assert.equal(
    await editor.innerText().then((t) => t.includes("[!note]")),
    false,
    "Callout syntax hidden",
  );
  assert.ok((await page.locator(".cm-callout").count()) > 0);
  await selectWord("mouse");
  await page.keyboard.type("pointer");
  await saved(alpha, (t) => t.includes("Precise pointer selection"));
  let r = await selectWord("pointer");
  await page.mouse.click(r.x + 5, r.y + 5, { button: "right" });
  await menu("Format", "Bold");
  await saved(alpha, (t) => t.includes("**pointer**"));
  assert.equal((await editor.innerText()).includes("**pointer**"), false);
  r = await selectWord("pointer");
  await page.mouse.click(r.x + 5, r.y + 5, { button: "right" });
  await menu("Format", "Italic");
  await saved(alpha, (t) => t.includes("***pointer***"));
  r = await selectWord("pointer");
  await page.mouse.click(r.x + 5, r.y + 5, { button: "right" });
  await menu("Format", "Italic");
  await saved(
    alpha,
    (t) => t.includes("**pointer**") && !t.includes("***pointer***"),
  );
  await page
    .locator(".primary-pane-wrap")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await saved(alpha, (t) => t.includes("***pointer***"));
  await page
    .locator(".primary-pane-wrap")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await saved(
    alpha,
    (t) => t.includes("**pointer**") && !t.includes("***pointer***"),
  );
  r = await selectWord("pointer");
  await page.mouse.click(r.x + 5, r.y + 5, { button: "right" });
  assert.equal(
    await page
      .getByRole("menuitem", { name: "Lock note", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("menuitem", { name: "Search selection", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("menuitem", { name: "Text color", exact: true })
      .count(),
    1,
  );
  const end = await textRect(
    '.primary-pane [aria-label="Note editor"]',
    "reliably.",
  );
  await page.mouse.click(end.x + end.width, end.y + end.height / 2);
  await page
    .getByRole("menu", { name: "Note actions", exact: true })
    .waitFor({ state: "detached" });
  await page.keyboard.type(" Click works.");
  await saved(alpha, (t) => t.includes("Click works."));
  checks.push(
    "Real mouse selection, hidden syntax, combined formatting toggles, two toolbar undos, outside-click dismissal and simplified menus",
  );
  const properties = page.locator(".primary-pane .properties-panel");
  assert.equal(
    await properties
      .getByRole("button", { name: "Properties", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await properties
    .getByRole("button", { name: "Properties", exact: true })
    .click();
  await properties.getByLabel("Value for count", { exact: true }).fill("9");
  await properties
    .getByRole("button", { name: "Properties", exact: true })
    .click();
  await saved(alpha, (t) => t.includes("count: 9"));
  assert.equal(
    await page
      .getByRole("button", { name: "Note properties", exact: true })
      .count(),
    0,
  );
  checks.push("Inline collapsed Properties round-trips YAML without popup");
  const table = page.locator(".primary-pane .editable-table").first();
  await table.scrollIntoViewIfNeeded();
  let cell = table.locator('[data-row="1"][data-column="0"]');
  await cell.locator(".cell-preview").click();
  await selectWord("Example", '.primary-pane [aria-label="Row 1, column 1"]');
  await page
    .getByLabel("Row 1, column 1", { exact: true })
    .click({ button: "right" });
  await menu("Format", "Italic");
  await saved(alpha, (t) => t.includes("*Example*"));
  assert.equal(
    await page.getByLabel("Row 1, column 1", { exact: true }).innerText(),
    "Example",
  );
  await page
    .locator(".primary-pane-wrap")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await saved(
    alpha,
    (t) => t.includes("| Example |") && !t.includes("*Example*"),
  );
  await cell.locator(".cell-editor").click();
  await selectWord("Example", '.primary-pane [aria-label="Row 1, column 1"]');
  await page.keyboard.press("Control+i");
  await saved(alpha, (t) => t.includes("*Example*"));
  const frame = await page
    .getByLabel("Row 1, column 1", { exact: true })
    .evaluate((el) => ({
      outline: getComputedStyle(el.closest(".cm-editor")).outlineStyle,
      bg: getComputedStyle(el.closest(".cm-editor")).backgroundColor,
    }));
  assert.equal(frame.outline, "none");
  let scroll = await table
    .locator(".table-scroll")
    .evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));

  assert.ok(scroll.scroll <= scroll.width + 1, "No table overflow by default");
  const grip = table.getByRole("separator", {
    name: "Resize table",
    exact: true,
  });
  const before = await table.locator("table").boundingBox(),
    g = await grip.boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + 30);
  await page.mouse.down();
  await page.mouse.move(g.x - 130, g.y + 30, { steps: 10 });
  await page.mouse.up();
  await pause(200);
  const after = await table.locator("table").boundingBox();
  assert.ok(after.width < before.width - 80, "Whole table shrinks");
  await cell.click({ button: "right" });
  await menu("Fit to note width");
  scroll = await table
    .locator(".table-scroll")
    .evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  assert.ok(scroll.scroll <= scroll.width + 1);
  const colGrip = table.getByRole("separator", {
    name: "Resize column 1",
    exact: true,
  });
  const colBefore = await table.locator("col").nth(1).boundingBox();
  const cg = await colGrip.boundingBox();
  await page.mouse.move(cg.x + cg.width / 2, cg.y + cg.height / 2);
  await page.mouse.down();
  await page.mouse.move(cg.x + cg.width / 2 + 80, cg.y + cg.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  assert.ok(
    (await table.locator("col").nth(1).boundingBox()).width >
      colBefore.width + 60,
    "Individual column resizing",
  );
  await cell.click({ button: "right" });
  await menu("Fit to note width");
  checks.push(
    "Visual cell editing, normal frame, Markdown italic, table width drag, Fit and overflow-only scrolling",
  );
  const diagram = page.locator(".primary-pane .mermaid-diagram");
  await diagram.scrollIntoViewIfNeeded();
  await diagram.locator(".diagram-svg > svg").waitFor({ timeout: 30000 });
  assert.ok(
    (await diagram.locator(".diagram-svg").innerText()).includes("Source"),
    "Diagram labels must render",
  );
  const db = await diagram.locator(".diagram-viewport").boundingBox(),
    svg = await diagram.locator(".diagram-svg > svg").boundingBox();
  assert.ok(
    svg.width <= db.width && svg.height <= db.height,
    "Diagram fits viewport",
  );
  await diagram
    .getByRole("button", { name: "Zoom in diagram", exact: true })
    .click();
  await diagram
    .getByRole("button", { name: "Fit diagram", exact: true })
    .click();
  await diagram
    .getByRole("button", { name: "Edit diagram", exact: true })
    .click();
  await diagram
    .getByLabel("Mermaid source", { exact: true })
    .fill("not a valid diagram");
  await diagram
    .getByRole("button", { name: "Save diagram", exact: true })
    .click();
  await diagram.getByRole("alert").waitFor({ timeout: 30000 });
  await saved(alpha, (t) => t.includes("not a valid diagram"));
  await diagram
    .getByRole("button", { name: "Edit diagram", exact: true })
    .click();
  await diagram
    .getByLabel("Mermaid source", { exact: true })
    .fill("flowchart LR\n A[Source] --> B[Updated]");
  await diagram
    .getByRole("button", { name: "Save diagram", exact: true })
    .click();
  await saved(alpha, (t) => t.includes("B[Updated]"));
  await diagram.locator(".diagram-svg > svg").waitFor();
  await until(
    async () =>
      (await diagram.locator(".diagram-svg").innerText()).includes("Updated"),
    "Updated diagram labels",
  );
  await page.screenshot({ path: "artifacts/lotus-0100-content-light.png" });
  checks.push(
    "Local Mermaid rendering, Fit/zoom/source editing and preserved fenced Markdown",
  );
  await page
    .locator('.tree-row[data-path="' + beta + '"] .tree-select')
    .click();
  await page.getByRole("tab", { name: "Alpha", exact: true }).click();
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await menu("Side by side");
  await page
    .locator('.tree-row[data-path="' + beta + '"]')
    .dragTo(page.locator(".secondary-pane-wrap .note-heading"));
  await until(
    async () =>
      (await page.locator(".secondary-pane-wrap .note-title").inputValue()) ===
      "Beta",
    "Sidebar drop replaces second pane",
  );
  await page
    .getByRole("tab", { name: "Beta", exact: true })
    .locator("..")
    .dragTo(page.locator(".primary-pane-wrap .note-heading"));
  await until(
    async () =>
      (await page.locator(".primary-pane-wrap .note-title").inputValue()) ===
      "Beta",
    "Tab drop replaces first pane",
  );
  const sharedEditor = page.locator('.secondary-pane [aria-label="Note editor"]');
  await sharedEditor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Shared split edit.");
  await until(async () => (await page.locator('.primary-pane [aria-label="Note editor"]').textContent()).includes("Shared split edit."), "Same-note split updates retain text");
  await page
    .locator('.tree-row[data-path="' + alpha + '"]')
    .dragTo(page.locator(".primary-pane-wrap .note-heading"));
  await until(
    async () =>
      (await page.locator(".primary-pane-wrap .note-title").inputValue()) ===
      "Alpha",
    "Restore first",
  );
  assert.equal(
    await page.locator(".primary-pane .properties-panel").count(),
    1,
  );
  assert.equal(
    await page.locator(".secondary-pane .properties-panel").count(),
    1,
  );
  await page.screenshot({ path: "artifacts/lotus-0100-split.png" });
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await menu("Top and bottom");
  await page
    .locator('.tree-row[data-path="' + alpha + '"]')
    .dragTo(page.locator(".secondary-pane-wrap .note-heading"));
  await until(
    async () =>
      (await page.locator(".secondary-pane-wrap .note-title").inputValue()) ===
      "Alpha",
    "Top/bottom drop",
  );
  const top = await page.locator(".primary-pane-wrap").boundingBox(),
    bottom = await page.locator(".secondary-pane-wrap").boundingBox();
  assert.ok(
    Math.abs(top.height - bottom.height) < 4,
    "Top and bottom equal panes",
  );
  await page.screenshot({ path: "artifacts/lotus-0100-split-down.png" });
  await page
    .locator(".secondary-pane-wrap")
    .getByRole("button", { name: "Close pane", exact: true })
    .click();
  checks.push("Actual sidebar and tab drags replace only targeted pane");
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  assert.equal(await name.inputValue(), "Untitled folder");
  const temporary = page.locator(".file-tree .temporary-row");
  assert.equal(await temporary.locator(".creation-twisty svg").count(), 1);
  assert.ok(
    await temporary.evaluate(
      (el) =>
        parseFloat(getComputedStyle(el).borderRadius) > 0 &&
        getComputedStyle(el).borderTopStyle === "solid",
    ),
  );
  await name.press("Escape");
  assert.equal(await temporary.count(), 0);
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await name.fill("Inline folder");
  await name.press("Enter");
  await page
    .getByRole("button", { name: "Actions for Inline folder", exact: true })
    .click();
  await menu("New note");
  assert.equal(await name.inputValue(), "Untitled");
  assert.equal(
    await name.evaluate((el) => el.selectionEnd - el.selectionStart),
    8,
  );
  await name.fill("Inline note");
  await name.press("Enter");
  await saved(
    "Work/Inline folder/Inline note.md",
    (t) => typeof t === "string",
  );
  await until(
    async () =>
      (await page.locator(".primary-pane-wrap .note-title").inputValue()) ===
      "Inline note",
    "New note opened",
  );
  await page.getByRole("tab", { name: "Alpha", exact: true }).click();
  await until(
    async () =>
      (await page.locator(".primary-pane-wrap .note-title").inputValue()) ===
      "Alpha",
    "Alpha opened after creation",
  );
  await editor.waitFor();
  await page
    .locator(".primary-pane.document-scroll")
    .evaluate((el) => (el.scrollTop = 0));
  r = await selectWord("pointer");
  await page.mouse.click(r.x + 5, r.y + 5, { button: "right" });
  await menu("Add or edit link…");
  const link = page.getByRole("dialog", {
    name: "Add or edit link",
    exact: true,
  });
  const list = await link.locator(".link-note-options").boundingBox(),
    save = await link
      .getByRole("button", { name: "Save link", exact: true })
      .boundingBox();
  assert.ok(
    save.y >= list.y + list.height - 1,
    "Link results cannot overlap footer",
  );
  const linkBox = await link.boundingBox();
  assert.ok(save.x > linkBox.x + linkBox.width / 2, "Save link is on right");
  await page
    .getByRole("textbox", { name: "Website or note path", exact: true })
    .fill("https://example.com");
  await link.getByRole("button", { name: "Save link", exact: true }).click();
  await saved(alpha, (t) => t.includes("[**pointer**](https://example.com)"));
  checks.push(
    "Inline folder/note creation, Escape/Enter, selected names, link dialog footer and saved link",
  );
  await page.getByRole("button", { name: "Choose vault", exact: true }).click();
  await page
    .getByRole("button", { name: "Settings for Work", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
      name: "Choose vault",
      exact: true,
    }),
    settings = page.getByRole("dialog", {
      name: "Vault settings",
      exact: true,
    });
  const pb = await picker.boundingBox(),
    sb = await settings.boundingBox();
  assert.ok(sb.x >= pb.x + pb.width, "Both vault panels side by side");
  await page.setViewportSize({ width: 760, height: 600 });
  await pause(150);
  const np = await picker.boundingBox(),
    ns = await settings.boundingBox();
  assert.ok(
    ns.y >= np.y + np.height - 1 && ns.x + ns.width <= 760 && ns.y + ns.height <= 600,
    "Narrow vault panels stack without sidebar overlap",
  );
  await page.screenshot({ path: "artifacts/lotus-0100-vaults-narrow.png" });
  await page.setViewportSize({ width: 1280, height: 840 });
  await settings
    .getByRole("button", { name: "Rename vault", exact: true })
    .click();
  await settings.getByLabel("Name", { exact: true }).fill("Research");
  await settings.getByLabel("Name", { exact: true }).press("Enter");
  await until(async () => {
    try {
      await fs.access(path.join(root, "Research/Notes/Alpha.md"));
      return true;
    } catch {
      return false;
    }
  }, "Vault rename");
  await settings
    .getByRole("button", { name: "Close vault settings", exact: true })
    .click();
  await page.keyboard.press("Escape");
  checks.push(
    "Right-side vault gear, simultaneous panels and inline vault rename",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const app = page.getByRole("dialog", { name: "Lotus settings", exact: true });
  const nav = await app.locator(".settings-tabs").boundingBox(),
    content = await app.locator(".settings-content").boundingBox();
  assert.ok(content.x >= nav.x + nav.width);
  await app
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  await page
    .locator(".primary-pane-wrap")
    .getByRole("button", { name: "Lock note", exact: true })
    .click();
  await page
    .locator(".reading .mermaid-diagram .diagram-svg > svg")
    .waitFor({ timeout: 30000 });
  assert.equal(await page.locator(".reading .lotus-callout").count(), 1);
  assert.equal(
    await page.locator(".primary-pane .properties-panel").count(),
    1,
  );
  assert.ok((await page.locator(".reading .lotus-callout > p").count()) >= 2);
  await page.screenshot({ path: "artifacts/lotus-0100-content-dark.png" });
  await page.setViewportSize({ width: 760, height: 600 });
  await page.screenshot({ path: "artifacts/lotus-0100-narrow.png" });
  checks.push(
    "Left navigation Settings, rendered callouts/diagrams in locked view, dark and narrow layouts",
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ root, checks, errors }, null, 2));
} catch (e) {
  if (page)
    await page
      .screenshot({ path: "artifacts/lotus-0100-failure.png" })
      .catch(() => {});
  console.error({ root, checks, errors });
  throw e;
} finally {
  if (page && typeof clipboardBefore === "string")
    await page
      .evaluate(
        (text) =>
          window.__TAURI_INTERNALS__.invoke("write_clipboard", { text }),
        clipboardBefore,
      )
      .catch(() => {});
  await browser?.close().catch(() => {});
  child?.kill();
}
