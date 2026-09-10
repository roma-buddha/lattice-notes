import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lotus-090-test-"));
const root = path.join(temp, "workspace");
await fs.mkdir(path.join(root, "Work", "Notes"), { recursive: true });
await fs.mkdir(path.join(root, "Personal", "Journal"), { recursive: true });
const alpha = "Work/Notes/Alpha.md",
  beta = "Work/Notes/Beta.md";
const initial =
  "---\ncreated: 2026-08-26\ntags: [one, two]\ncount: 5\n---\n# A selectable heading\n\nPrecise mouse selection must work reliably.\n\n## Another heading\n\nSecond paragraph for selecting multiple lines.\n\n| Topic | Value |\n| --- | --- |\n| Example | 49% |\n\nAfter table\n";
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
async function selectWord(needle, selector = ".primary-pane .cm-content") {
  const r = await textRect(selector, needle);
  await page.mouse.move(r.x + 0.5, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width - 0.5, r.y + r.height / 2, { steps: 12 });
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
  await until(
    async () => predicate(await fs.readFile(path.join(root, note), "utf8")),
    "File not saved: " + note,
  );
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
  await page.getByRole("button", { name: "Create area", exact: true }).click();
  await page.getByLabel("Area name", { exact: true }).fill("Learning");
  await page
    .locator(".area-form")
    .getByRole("button", { name: "Create area", exact: true })
    .click();
  await page.locator(".area-form").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await page.locator(`.organizer-note[title="${alpha}"]`).click();
  await page.locator(".primary-pane .cm-content").waitFor();
  await selectWord("mouse");
  await page.keyboard.type("pointer");
  await saved(alpha, (t) => t.includes("Precise pointer selection"));
  const r = await textRect(".primary-pane .cm-content", "selection");
  await page.mouse.dblclick(r.x + r.width / 2, r.y + r.height / 2);
  assert.equal(
    await page.evaluate(() => window.getSelection()?.toString()),
    "selection",
  );
  await selectWord("selectable");
  await page.keyboard.type("editable");
  await saved(alpha, (t) => t.includes("# A editable heading"));
  await selectWord("Another");
  // A title is a native text field, not unselectable display text.
  const title = page.locator(".primary-pane-wrap .note-title");
  await title.click();
  await title.press("Control+a");
  assert.equal(
    await title.evaluate((el) => el.selectionEnd - el.selectionStart),
    5,
  );
  checks.push(
    "Real mouse dragging, double-click word selection, editable headings and selectable title",
  );

  assert.equal(
    await page.locator(".document-scroll .properties-panel").count(),
    0,
  );
  await page
    .getByRole("button", { name: "Note properties", exact: true })
    .click();
  const properties = page.getByRole("dialog", {
    name: "Note properties",
    exact: true,
  });
  await properties
    .getByRole("spinbutton", { name: "Value for count" })
    .fill("9");
  await properties
    .getByRole("spinbutton", { name: "Value for count" })
    .press("Enter");
  await saved(alpha, (t) => t.includes("count: 9"));
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Bookmark note", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Remove bookmark", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.locator(".primary-pane .cm-content").click({ button: "right" });
  assert.equal(
    await page.getByRole("menuitem", { name: /bookmark/i }).count(),
    0,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Text appearance", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Text width", { exact: true }).inputValue(),
    "comfortable",
  );
  await page.getByLabel("Text width", { exact: true }).selectOption("wide");
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .locator(".primary-pane")
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--note-content-width").trim(),
      ),
    "1147.5px",
  );
  checks.push(
    "Properties popup writes YAML; bookmark moved to toolbar; per-note width persists",
  );

  for (const direction of ["right", "down"]) {
    await page.getByRole("button", { name: "Split view", exact: true }).click();
    await menu(direction === "right" ? "Side by side" : "Top and bottom");
    const first = await page.locator(".primary-pane-wrap").boundingBox(),
      second = await page.locator(".secondary-pane-wrap").boundingBox();
    assert.ok(
      Math.abs(
        first[direction === "right" ? "width" : "height"] -
          second[direction === "right" ? "width" : "height"],
      ) < 2,
      JSON.stringify({ direction, first, second }),
    );
    assert.equal(
      await page.locator(".secondary-pane-wrap .note-title").inputValue(),
      "Alpha",
    );
    assert.equal(
      await page.locator(".secondary-pane-wrap .note-actions button").count(),
      5,
    );
    await page
      .locator(".secondary-pane-wrap")
      .click({ position: { x: 12, y: 12 } });
    await page.locator(`.file-tree [data-path="${beta}"] .tree-select`).click();
    await until(
      async () =>
        (await page
          .locator(".secondary-pane-wrap .note-title")
          .inputValue()) === "Beta",
      "Second note not opened",
    );
    await page
      .locator(".secondary-pane-wrap")
      .getByRole("button", { name: "Text appearance", exact: true })
      .click();
    await page
      .getByLabel("Text width", { exact: true })
      .selectOption("comfortable");
    await page
      .getByLabel("Note alignment", { exact: true })
      .selectOption("center");
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .locator(".secondary-pane")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--note-text-align").trim(),
        ),
      "center",
    );
    assert.equal(
      await page
        .locator(".primary-pane")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--note-text-align").trim(),
        ),
      "left",
    );
    await page
      .locator(".secondary-pane .cm-content")
      .fill("Independent " + direction);
    await saved(beta, (t) => t.includes("Independent " + direction));
    await page.screenshot({
      path: `artifacts/lotus-090-split-${direction}.png`,
    });
    const divider = page.getByRole("separator", { name: "Resize split panes" });
    await divider.focus();
    await divider.press(direction === "right" ? "ArrowRight" : "ArrowDown");
    assert.equal(await divider.getAttribute("aria-valuenow"), "55");
    await page
      .locator(".secondary-pane-wrap")
      .getByRole("button", { name: "Close pane", exact: true })
      .click();
  }
  checks.push(
    "Both whole-note 50/50 splits, matching controls, independent notes/appearance/autosave, divider and close",
  );

  await page.getByRole("button", { name: "Choose vault", exact: true }).click();
  assert.ok(
    (
      await page
        .getByRole("dialog", { name: "Choose vault", exact: true })
        .boundingBox()
    ).width >= 420,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Current vault settings", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Settings for Personal", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Vault area", { exact: true }).inputValue(),
    "",
  );
  await page
    .getByLabel("Vault area", { exact: true })
    .selectOption({ label: "Learning" });
  await until(
    async () =>
      (await page.locator(".current-vault-area").textContent()).includes(
        "Learning",
      ),
    "Area assignment not saved",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Choose vault", exact: true }).click();
  await page
    .getByRole("button", { name: "Settings for Personal", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("Vault area", { exact: true })
      .locator("option:checked")
      .textContent(),
    "Learning",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Choose vault", exact: true }).click();
  await page
    .getByRole("button", { name: "Create or add vault", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Create vault", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Add existing vault…", exact: true })
      .count(),
    1,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator(".sidebar-footer .settings-button").count(),
    0,
  );
  await page
    .locator(".title-navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  assert.equal(await name.inputValue(), "Untitled folder");
  assert.equal(
    await name.evaluate((el) => el.selectionEnd - el.selectionStart),
    15,
  );
  assert.equal(await page.locator(".inline-hint").count(), 0);
  await name.fill("New folder");
  await name.press("Enter");
  await page.locator('.file-tree [data-path="Work/New folder"]').waitFor();
  await page
    .getByRole("button", { name: "Actions for New folder", exact: true })
    .click();
  await menu("New note");
  assert.equal(
    await page.getByRole("textbox", { name: "Name", exact: true }).inputValue(),
    "Untitled",
  );
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Inline note");
  await page.getByRole("textbox", { name: "Name", exact: true }).press("Enter");
  await until(
    async () =>
      fs.access(path.join(root, "Work/New folder/Inline note.md")).then(
        () => true,
        () => false,
      ),
    "Inline note not created",
  );
  assert.ok(
    (
      await page
        .locator('.file-tree [data-path="Work/Notes"] .tree-select')
        .boundingBox()
    ).height <= 28,
  );
  checks.push(
    "Wider vault picker, per-vault settings, plus menu, top-level settings and dense inline folder creation",
  );

  await page.locator(`.file-tree [data-path="${beta}"] .tree-select`).click();
  const editor = page.locator(".primary-pane .cm-content");
  const actions = [
    ["Format", "Bold", "**sample**"],
    ["Format", "Italic", "*sample*"],
    ["Format", "Strikethrough", "~~sample~~"],
    ["Format", "Highlight", "==sample=="],
    ["Format", "Inline code", "`sample`"],
    ["Format", "Math", "$sample$"],
    ["Format", "Comment", "%%sample%%"],
    ["Paragraph", "Bullet list", "- sample"],
    ["Paragraph", "Numbered list", "1. sample"],
    ["Paragraph", "Task list", "- [ ] sample"],
    ...[1, 2, 3, 4, 5, 6].map((n) => [
      "Paragraph",
      `Heading ${n}`,
      "#".repeat(n) + " sample",
    ]),
    ["Paragraph", "Quote", "> sample"],
    ["Insert", "Callout", "> [!NOTE]\n> sample"],
    ["Insert", "Code block", "```\nsample\n```"],
    ["Insert", "Math block", "$$\nsample\n$$"],
  ];
  for (const [group, action, expected] of actions) {
    await editor.fill("sample");
    await editor.press("Control+a");
    await editor.click({ button: "right" });
    await menu(group, action);
    await saved(beta, (t) => t.includes(expected));
  }
  await editor.fill("$x^2$\n\n$$\nx^2\n$$");
  await page.getByRole("button", { name: "Lock note", exact: true }).click();
  await page.locator(".reading .katex").first().waitFor();
  assert.equal(await page.locator(".reading .katex").count(), 2);
  await page
    .getByRole("button", { name: "Note properties", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Add property", exact: true })
      .count(),
    0,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  checks.push(
    "Every format and paragraph action and block insertion persists actual Markdown; math renders; locked Properties read-only",
  );
  await editor.fill("Color label");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Format", "Text color", "Blue");
  await saved(beta, (t) =>
    t.includes('<span style="color: #357ac2">Color label</span>'),
  );
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Format", "Text color", "Default color");
  await saved(beta, (t) => t === "Color label");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Add or edit link…");
  await page
    .getByRole("textbox", { name: "Website or note path", exact: true })
    .fill("https://example.com");
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  await saved(beta, (t) => t === "[Color label](https://example.com)");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Remove link");
  await saved(beta, (t) => t === "Color label");
  checks.push(
    "Color/default-color and add/remove link commands serialize correctly",
  );
  await editor.press("Control+a"); await editor.click({button:"right"}); await menu("Add or edit link…");
  await page.locator(".link-note-options button").filter({hasText:"Alpha"}).click();
  await page.getByRole("button",{name:"Save link",exact:true}).click();
  await saved(beta,t=>t === "[Color label](Alpha.md)");
  await page.locator(".cm-note-link").click({modifiers:["Control"]});
  await until(async()=>await page.locator(".primary-pane-wrap .note-title").inputValue()==="Alpha","Relative note link did not open");
  await page.locator(`.file-tree [data-path="${beta}"] .tree-select`).click();
  await until(async()=>await page.locator(".primary-pane-wrap .note-title").inputValue()==="Beta","Beta did not reopen");
  // Exercise native clipboard through real user-gesture menu commands.
  await editor.fill("Clipboard sample");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Copy");
  await editor.fill("replace");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Paste");
  await saved(beta, (t) => t === "Clipboard sample");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Cut");
  await saved(beta, (t) => t === "");
  await editor.click({ button: "right" });
  await menu("Paste as plain text");
  await saved(beta, (t) => t === "Clipboard sample");
  await editor.click({ button: "right" });
  await menu("Select all");
  assert.equal(
    await page.evaluate(() => window.getSelection()?.toString()),
    "Clipboard sample",
  );
  await editor.click({ button: "right" });
  await menu("Search selection");
  await page.locator(".note-search-results button").first().waitFor();
  await page
    .getByRole("button", { name: "Find a note (Ctrl+P)", exact: true })
    .click();
  // Test actions that transform back to plain body, and footnote/rule syntax.
  await editor.fill("**sample**");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Format", "Clear formatting");
  await saved(beta, (t) => t === "sample");
  await editor.fill("## sample");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Paragraph", "Body");
  await saved(beta, (t) => t === "sample");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Insert", "Footnote");
  await saved(beta, (t) => /\[\^note-[a-z0-9]+\]: sample/.test(t));
  await editor.fill("sample");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await menu("Insert", "Horizontal rule");
  await saved(beta, (t) => t.includes("sample\n\n---"));
  checks.push(
    "Clipboard cut/copy/paste/plain-paste/select-all, search selection, clear formatting, Body, footnote and rule",
  );
  await editor.fill("Table below");await editor.click({button:"right"});await menu("Insert","Table…");
  await page.getByRole("button",{name:"Insert table",exact:true}).click();
  const table=page.locator(".primary-pane .editable-table");await table.waitFor();
  const cell=table.getByRole("textbox",{name:"Row 1, column 1",exact:true});
  await table.locator('.table-data-row [data-row="1"][data-column="0"] .cell-preview').click();
  await cell.fill("Linked cell");await cell.press("Control+a");await cell.click({button:"right"});
  await menu("Add or edit link…");await page.getByRole("textbox",{name:"Website or note path",exact:true}).fill("https://example.com");
  await page.getByRole("button",{name:"Save link",exact:true}).click();await saved(beta,t=>t.includes("[Linked cell](https://example.com)"));
  await table.locator('.table-data-row [data-row="1"][data-column="0"]').click({button:"right"});await menu("Column alignment","Align column center");await saved(beta,t=>t.includes(":---:"));
  await table.locator('.table-data-row [data-row="1"][data-column="0"]').click({button:"right"});await menu("Rows","Insert row below");
  assert.equal(await table.locator(".table-data-row").count(),5);
  await table.locator('.table-data-row [data-row="1"][data-column="0"]').click({button:"right"});await menu("Rows","Delete row");
  assert.equal(await table.locator(".table-data-row").count(),4);
  checks.push("Insert table, cell link, column alignment, row insertion/deletion persist Markdown; relative note link opens");
  // Closing the first pane retains the second note, then title rename updates disk.
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await menu("Side by side");
  await page
    .locator(".secondary-pane-wrap")
    .click({ position: { x: 10, y: 10 } });
  await page.locator(`.file-tree [data-path="${alpha}"] .tree-select`).click();
  await until(
    async () =>
      (await page.locator(".secondary-pane-wrap .note-title").inputValue()) ===
      "Alpha",
    "Open Alpha in second pane",
  );
  await page
    .locator(".primary-pane-wrap")
    .getByRole("button", { name: "Close pane", exact: true })
    .click();
  await page.locator(".secondary-pane-wrap").waitFor({ state: "detached" });
  await until(
    async () =>
      (await page.locator(".primary-pane-wrap .note-title").inputValue()) ===
      "Alpha",
    "Remaining pane did not fill workspace",
  );
  const renameTitle = page.locator(".primary-pane-wrap .note-title");
  await renameTitle.fill("Alpha renamed");
  await renameTitle.press("Enter");
  await until(
    async () =>
      fs.access(path.join(root, "Work/Notes/Alpha renamed.md")).then(
        () => true,
        () => false,
      ),
    "Title rename not on disk",
  );
  await renameTitle.fill("Alpha");
  await renameTitle.press("Enter");
  await until(
    async () =>
      fs.access(path.join(root, alpha)).then(
        () => true,
        () => false,
      ),
    "Title rename restore not on disk",
  );
  await page.locator(`.file-tree [data-path="${alpha}"].selected`).waitFor();
  await until(
    async () =>
      page.evaluate(
        ({ root, alpha }) =>
          localStorage.getItem(`notus-last:${root}`) === alpha,
        { root, alpha },
      ),
    "Renamed note not registered as last note",
  );
  checks.push(
    "Close first pane preserves second note; title renames actual Markdown and preserves bookmark",
  );
  await page.reload();
  await page.locator(".primary-pane .cm-content").waitFor();
  await page.locator(`.file-tree [data-path="${alpha}"] .tree-select`).click();
  await until(
    async () =>
      (await page.locator(".primary-pane-wrap .note-title").inputValue()) ===
      "Alpha",
    "Alpha did not reopen",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Remove bookmark", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator(".primary-pane")
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--note-content-width").trim(),
      ),
    "1147.5px",
  );
  await page
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  await page.screenshot({ path: "artifacts/lotus-090-dark.png" });
  await page.setViewportSize({ width: 760, height: 600 });
  const nav = await page.locator(".title-navigation").boundingBox(),
    strip = await page.locator(".tab-strip").boundingBox();
  assert.ok(nav.x + nav.width <= strip.x + 1);
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  const settingsBounds = await settingsButton.boundingBox();
  assert.ok(settingsBounds.x + settingsBounds.width <= strip.x, "Settings must not sit under the tabs");
  const headingBounds = await page.locator(".primary-pane-wrap .note-heading").boundingBox();
  assert.ok(headingBounds.height < 180, "Short note title must not stretch the narrow-window header");
  await settingsButton.click();
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.screenshot({ path: "artifacts/lotus-090-narrow.png" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ root, checks, errors }, null, 2));
} catch (e) {
  if (page)
    await page
      .screenshot({ path: "artifacts/lotus-090-failure.png" })
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
