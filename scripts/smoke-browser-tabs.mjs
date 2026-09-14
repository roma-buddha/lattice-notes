import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lotus-browser-test-"));
const root = path.join(temp, "workspace");
await fs.mkdir(path.join(root, "Work", "Notes"), { recursive: true });
await fs.writeFile(
  path.join(root, "Work", "Notes", "Alpha.md"),
  "Alpha note\n",
);
await fs.writeFile(path.join(root, "Work", "Notes", "Beta.md"), "Beta note\n");

const port = 9242;
const app = spawn(
  process.env.NOTUS_EXECUTABLE ??
    path.resolve("src-tauri/target/debug/lotus.exe"),
  [],
  {
    windowsHide: true,
    env: {
      ...process.env,
      NOTUS_ROOT: root,
      WEBVIEW2_USER_DATA_FOLDER: path.join(temp, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  },
);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return;
    await pause(100);
  }
  throw new Error(message);
}

let browser;
try {
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      return true;
    } catch {
      return false;
    }
  }, "Lotus main WebView was not available");
  let page;
  await until(
    () => {
      page = browser
        .contexts()[0]
        .pages()
        .find((candidate) =>
          /tauri.localhost|127.0.0.1:1420/.test(candidate.url()),
        );
      return Boolean(page);
    },
    `Lotus main page was not available: ${browser
      .contexts()[0]
      .pages()
      .map((candidate) => candidate.url())
      .join(", ")}`,
  );
  assert.ok(page, "Lotus main page was not available");
  page.setDefaultTimeout(8_000);

  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await page.locator('.organizer-note[title="Work/Notes/Alpha.md"]').click();
  await page.locator('.tree-row[data-path="Work/Notes/Beta.md"]').waitFor();
  await page
    .getByRole("button", { name: "Open browser tab", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Web address", exact: true })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Web address", exact: true })
    .fill("https://example.com/");
  await page
    .getByRole("textbox", { name: "Web address", exact: true })
    .press("Enter");
  await until(
    () =>
      browser
        .contexts()[0]
        .pages()
        .some((candidate) => candidate.url() === "https://example.com/"),
    "Browser tab did not navigate inside its WebView",
  );
  const dragTab = async (from, to, fraction) => {
    const source = await from.boundingBox();
    const target = await to.boundingBox();
    assert.ok(source && target, "Tab bounds were not available for drag");
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width * fraction, target.y + target.height / 2, { steps: 5 });
    await page.mouse.up();
  };
  const browserTab = page.getByRole("tab", { name: "example.com", exact: true });
  const organizerTab = page.getByRole("tab", { name: "Organizer", exact: true });
  await dragTab(browserTab, organizerTab, 0.2);
  await until(async () => {
    const labels = await page.locator('[role="tab"]').allTextContents();
    return labels.indexOf("example.com") < labels.indexOf("Organizer");
  }, "Dragging the browser tab before a tab did not reorder it");
  await dragTab(browserTab, organizerTab, 0.8);
  await until(async () => {
    const labels = await page.locator('[role="tab"]').allTextContents();
    return labels.indexOf("Organizer") < labels.indexOf("example.com");
  }, "Dragging the browser tab after a tab did not reorder it");

  // An active browser tab must split with the retained note rather than
  // replacing the split layout. The native WebView moves into pane two.
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await page.getByRole("menuitem", { name: "Side by side", exact: true }).click();
  await until(
    async () =>
      (await page.locator(".editor-panes.split-right").count()) === 1 &&
      (await page
        .locator('[aria-label="Second note pane"] [aria-label="Browser"]')
        .count()) === 1,
    "Splitting an active browser tab did not place it beside the note",
  );
  assert.equal(await page.locator(".note-title").inputValue(), "Alpha");
  await browserTab.click();
  await until(
    async () =>
      (await page.locator(".editor-panes.split-right").count()) === 1 &&
      (await page
        .locator('[aria-label="First note pane"] [aria-label="Browser"]')
        .count()) === 1,
    "Selecting a browser tab replaced the split instead of using the active pane",
  );
  await dragTab(browserTab, page.locator('[aria-label="Second note pane"]'), 0.5);
  await until(
    async () =>
      (await page
        .locator('[aria-label="Second note pane"] [aria-label="Browser"]')
        .count()) === 1,
    "Dropping a browser tab on pane two did not move it there",
  );
  await page
    .locator('[aria-label="Second note pane"]')
    .getByRole("button", { name: "Close browser tab", exact: true })
    .click();
  await until(
    async () => (await page.getByRole("tab", { name: "example.com", exact: true }).count()) === 0,
    "Closing the browser from its pane did not remove its tab",
  );
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await page.getByRole("menuitem", { name: "Top and bottom", exact: true }).click();
  await until(
    async () => (await page.locator(".editor-panes.split-down").count()) === 1,
    "The browser split did not change to top and bottom",
  );
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await page.getByRole("menuitem", { name: "Close split", exact: true }).click();

  await page
    .locator('.tree-row[data-path="Work/Notes/Beta.md"] .tree-select')
    .click();
  await until(
    async () =>
      (await page
        .getByRole("tab", { name: "Current note", exact: true })
        .count()) === 1,
    "Sidebar did not replace Current note after a browser tab was open",
  );
  assert.equal(
    await page.getByRole("tab", { name: "Current note", exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Close current note" }).click();
  await until(
    async () =>
      (await page
        .getByRole("tab", { name: "Current note", exact: true })
        .count()) === 0,
    "Closing Current note did not remove its tab",
  );
  await page
    .locator('.tree-row[data-path="Work/Notes/Beta.md"] .tree-select')
    .click();
  await until(
    async () =>
      (await page
        .getByRole("tab", { name: "Current note", exact: true })
        .count()) === 1,
    "Sidebar click did not recreate Current note",
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("lotus-note-pointer-drop", {
        detail: {
          path: "Work/Notes/Alpha.md",
          target: "tabs",
          tabId: 0,
        },
      }),
    ),
  );
  await until(
    async () => (await page.locator(".note-title").inputValue()) === "Alpha",
    "Dropping a note on Current note did not replace its document",
  );
  // A dropped note becomes an extra tab. Switching must always load its own
  // document, even when clicks occur while the previous note is being saved.
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("lotus-note-pointer-drop", {
        detail: { path: "Work/Notes/Beta.md", target: "tabs" },
      }),
    ),
  );
  await page.getByRole("tab", { name: "Beta", exact: true }).waitFor();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("lotus-note-pointer-drop", {
        detail: { path: "Work/Notes/Alpha.md", target: "tabs" },
      }),
    ),
  );
  const alphaTab = page.getByRole("tab", { name: "Alpha", exact: true });
  const betaTab = page.getByRole("tab", { name: "Beta", exact: true });
  await alphaTab.waitFor();
  await betaTab.waitFor();
  await betaTab.click();
  await until(
    async () => (await page.locator(".note-title").inputValue()) === "Beta",
    "Selecting Beta did not replace Alpha in the editor",
  );
  // Small pointer movement inside a temporary tab must still select it rather
  // than being mistaken for a completed reorder.
  const alphaBounds = await alphaTab.boundingBox();
  assert.ok(alphaBounds, "Alpha tab bounds were not available for selection");
  await page.mouse.move(alphaBounds.x + alphaBounds.width / 2, alphaBounds.y + alphaBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(alphaBounds.x + alphaBounds.width / 2 + 9, alphaBounds.y + alphaBounds.height / 2, { steps: 2 });
  await page.mouse.move(alphaBounds.x + alphaBounds.width / 2, alphaBounds.y + alphaBounds.height / 2, { steps: 2 });
  await page.mouse.up();
  await until(
    async () => (await page.locator(".note-title").inputValue()) === "Alpha",
    "A temporary tab with pointer jitter did not replace Beta in the editor",
  );
  await dragTab(betaTab, alphaTab, 0.2);
  await until(async () => {
    const labels = await page.locator('[role="tab"]').allTextContents();
    return labels.indexOf("Beta") < labels.indexOf("Alpha");
  }, "Dragging Beta before Alpha did not reorder the tabs");
  await dragTab(betaTab, alphaTab, 0.8);
  await until(async () => {
    const labels = await page.locator('[role="tab"]').allTextContents();
    return labels.indexOf("Alpha") < labels.indexOf("Beta");
  }, "Dragging Beta after Alpha did not reorder the tabs");
  console.log(
    "Browser navigation, tab selection, and before/after reordering passed.",
  );
} finally {
  await browser?.close().catch(() => {});
  const exited = new Promise((resolve) => app.once("exit", resolve));
  app.kill();
  await Promise.race([exited, pause(3_000)]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fs.rm(temp, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 19 || error?.code !== "EBUSY") throw error;
      await pause(250);
    }
  }
}
