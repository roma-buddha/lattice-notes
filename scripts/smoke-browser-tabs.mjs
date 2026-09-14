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
  console.log(
    "Browser navigation and Current note close, reopen, and drop replacement passed.",
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
