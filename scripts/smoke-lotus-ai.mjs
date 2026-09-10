import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lotus-ai-test-"));
const root = path.join(temp, "workspace");
await fs.mkdir(path.join(root, "Work", "Notes"), { recursive: true });
const notePath = path.join(root, "Work", "Notes", "Alpha.md");
const original =
  "---\ntags: [keep]\n---\n# Example\n\nsame same same\n\nKeep this paragraph unchanged.\n";
await fs.writeFile(notePath, original);
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
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9246",
    },
  },
);
let browser, page;
const errors = [],
  checks = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await pause(100);
  }
  throw Error(label);
}
try {
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9246");
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
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Organize workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await page.locator('.organizer-note[title="Work/Notes/Alpha.md"]').click();
  await page.locator('.primary-pane [aria-label="Note editor"]').waitFor();
  // Only provider IPC is mocked. The editor, saves, locks and conflict checks are native.
  await page.evaluate(() => {
    const native = window.__TAURI_INTERNALS__.invoke;
    window.aiTest = {
      calls: [],
      connections: [],
      reply: "**different**",
      defer: false,
    };
    const mock = async (cmd, args) => {
      const t = window.aiTest;
      if (!cmd.startsWith("ai_")) return native(cmd, args);
      t.calls.push({ cmd, args });
      if (cmd === "ai_connections") return t.connections;
      if (cmd === "ai_models") return ["test-chat-model"];
      if (cmd === "ai_save") {
        t.connections = [...t.connections.filter(c => c.provider !== args.provider), { provider: args.provider, model: args.model, name: args.name, base_url: args.baseUrl }];
        return;
      }
      if (cmd === "ai_remove") {
        t.connections = [];
        return;
      }
      if (cmd === "ai_stop") {
        t.reject?.("Request stopped");
        return;
      }
      if (cmd === "ai_chat") {
        if (t.defer)
          return new Promise((resolve, reject) => {
            t.resolve = resolve;
            t.reject = reject;
          });
        return {
          text: args.edit ? "Review replacement" : "Synthetic answer",
          replacement: args.edit ? t.reply : null,
        };
      }
      throw Error(cmd);
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (url, options) => {
      const cmd = new URL(String(url)).pathname.slice(1);
      if (!cmd.startsWith("ai_")) return nativeFetch(url, options);
      try {
        const value = await mock(cmd, JSON.parse(options.body || "{}"));
        return new Response(JSON.stringify(value ?? null), {
          headers: {
            "Content-Type": "application/json",
            "Tauri-Response": "ok",
          },
        });
      } catch (e) {
        return new Response(JSON.stringify(String(e)), {
          headers: {
            "Content-Type": "application/json",
            "Tauri-Response": "error",
          },
        });
      }
    };
  });
  await page
    .getByRole("button", { name: "Open AI assistant", exact: true })
    .click();
  const chat = page.getByRole("complementary", { name: "AI assistant" });
  await chat.getByRole("button", { name: "AI settings" }).click();
  const settings = page.getByRole("dialog", { name: "Lotus settings" });
  await settings
    .getByLabel("API key", { exact: true })
    .fill("synthetic-not-a-real-key");
  await settings.getByRole("button", { name: "Load models" }).click();
  await settings.getByRole("button", { name: "Test & save" }).click();
  await settings.getByText("Connection tested and saved securely.").waitFor();
  assert.equal(
    await settings.getByLabel("API key", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(localStorage).includes("synthetic-not-a-real-key"),
    ),
    false,
  );
  await page.screenshot({ path: "artifacts/lotus-ai-settings.png" });
  if (process.env.LOTUS_PROVIDER_TEST) {
    for (const [provider, model] of [["google","gemini-test-model"],["nvidia","nvidia/test-model"]]) {
      await settings.getByLabel("Provider",{exact:true}).selectOption(provider);
      await settings.getByLabel("API key",{exact:true}).fill("synthetic-not-a-real-key");
      await settings.getByLabel("Model",{exact:true}).fill(model);
      await settings.getByRole("button",{name:"Test & save"}).click();
      await settings.getByText("Connection tested and saved securely.").waitFor();
      assert.equal(await page.evaluate(p=>window.aiTest.calls.some(c=>c.cmd==="ai_models"&&c.args.provider===p),provider),false);
    }
    await settings.getByLabel("Provider",{exact:true}).selectOption("custom");
    await settings.getByLabel("Provider name",{exact:true}).fill("Example AI");
    await settings.getByLabel("API base URL",{exact:true}).fill("https://example.test/v1");
    await settings.getByLabel("API key",{exact:true}).fill("synthetic-not-a-real-key");
    await settings.getByLabel("Model",{exact:true}).fill("example/chat");
    assert.equal(await settings.getByRole("button",{name:"Test & save"}).isDisabled(),true);
    await settings.getByRole("checkbox").check();
    await settings.getByRole("button",{name:"Test & save"}).click();
    await settings.getByText("Connection tested and saved securely.").waitFor();
    const custom=await page.evaluate(()=>window.aiTest.calls.filter(c=>c.cmd==="ai_save").at(-1).args);
    assert.equal(custom.baseUrl,"https://example.test/v1");
    assert.equal(custom.name,"Example AI");
    await page.screenshot({path:"artifacts/lotus-ai-custom-provider.png"});
    await settings.getByLabel("API base URL",{exact:true}).fill("https://different.test/v1");
    assert.equal(await settings.getByRole("checkbox").isChecked(),false);
    assert.equal(await settings.getByLabel("API key",{exact:true}).inputValue(),"");
    checks.push("Google/NVIDIA manual model IDs; custom provider name and HTTPS URL; explicit endpoint trust; destination changes reset consent and key input");
  }
  await settings.getByRole("button", { name: "Close settings" }).click();
  if(process.env.LOTUS_PROVIDER_TEST) {
    assert.equal(await chat.getByLabel("Chat model").locator("option").count(),4);
    await chat.getByLabel("Chat model").selectOption("custom");
    await chat.getByText(/Example AI \(https:\/\/example.test\/v1\)/).waitFor();
    await chat.getByLabel("Chat model").selectOption("groq");
  }
  checks.push(
    "Model settings: masked transient key, test/save, no localStorage key",
  );
  await chat.getByLabel("Message to AI").fill("Hello");
  assert.equal(
    await chat.getByRole("button", { name: "Send", exact: true }).isDisabled(),
    true,
  );
  await chat.getByRole("checkbox").click();
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await chat.getByText("Synthetic answer").waitFor();
  assert.equal(
    await page.evaluate(
      () => window.aiTest.calls.find((c) => c.cmd === "ai_chat").args.context,
    ),
    null,
  );
  checks.push("Explicit consent and no-note chat sends no note");
  const editor = page.locator('.primary-pane [aria-label="Note editor"]');
  const word = await editor
    .locator(".cm-line")
    .filter({ hasText: "same same same" })
    .evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      const range = document.createRange();
      range.setStart(text, 5);
      range.setEnd(text, 9);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  await page.mouse.move(word.x + 0.5, word.y + word.height / 2);
  await page.mouse.down();
  await page.mouse.move(word.x + word.width + 1, word.y + word.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await pause(150);
  await chat.getByLabel("Context", { exact: true }).selectOption("selection");
  await chat.getByLabel("Mode", { exact: true }).selectOption("edit");
  await chat
    .getByLabel("Message to AI")
    .fill("Make just this word bold and different");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await chat.getByRole("button", { name: "Apply", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.aiTest.calls.filter((c) => c.cmd === "ai_chat").at(-1).args
          .context,
    ),
    "same",
  );
  assert.equal(
    await fs.readFile(notePath, "utf8"),
    original,
    "Preview must not write",
  );
  await page.screenshot({ path: "artifacts/lotus-ai-preview.png" });
  await chat.getByRole("button", { name: "Apply", exact: true }).click();
  await until(
    async () =>
      (await fs.readFile(notePath, "utf8")).includes("same **different** same"),
    "AI selection not saved",
  );
  assert.equal(
    await fs.readFile(notePath, "utf8"),
    original.replace("same same same", "same **different** same"),
  );
  await page
    .locator(".primary-pane-wrap")
    .getByRole("button", { name: /Undo/ })
    .click();
  await until(
    async () => (await fs.readFile(notePath, "utf8")) === original,
    "Undo failed",
  );
  checks.push(
    "Selection replacement, Markdown/frontmatter preservation, preview no write, native save and Undo",
  );
  await chat.getByLabel("Context", { exact: true }).selectOption("note");
  await chat.getByLabel("Message to AI").fill("Prepare an edit before locking");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await chat.getByRole("button", { name: "Apply", exact: true }).waitFor();
  await page
    .locator(".primary-pane-wrap")
    .getByRole("button", { name: "Lock note", exact: true })
    .click();
  await page
    .locator(".primary-pane-wrap")
    .getByRole("button", { name: "Unlock note", exact: true })
    .waitFor();
  await chat.getByRole("button", { name: "Apply", exact: true }).click();
  await chat
    .getByRole("alert")
    .filter({ hasText: /locked/ })
    .waitFor();
  assert.equal(await fs.readFile(notePath, "utf8"), original);
  await chat.getByRole("button", { name: "Discard", exact: true }).click();
  await chat.getByLabel("Message to AI").fill("Edit this locked note");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await chat
    .getByRole("alert")
    .filter({ hasText: /unlocked note/ })
    .waitFor();
  await page
    .locator(".primary-pane-wrap")
    .getByRole("button", { name: "Unlock note", exact: true })
    .click();
  checks.push("Locked notes cannot request or apply edits");
  await chat.getByLabel("Context", { exact: true }).selectOption("note");
  await chat.getByLabel("Message to AI").fill("Replace note");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await chat.getByRole("button", { name: "Apply", exact: true }).waitFor();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Local edit");
  await chat.getByRole("button", { name: "Apply", exact: true }).click();
  await chat
    .getByRole("alert")
    .filter({ hasText: /changed/ })
    .waitFor();
  assert.equal(
    await chat.getByRole("button", { name: "Apply", exact: true }).count(),
    1,
  );
  await chat.getByRole("button", { name: "Discard", exact: true }).click();
  checks.push("Stale edit rejected after typing");
  await until(
    async () => (await fs.readFile(notePath, "utf8")).includes("Local edit"),
    "Local edit not saved",
  );
  await chat.getByLabel("Message to AI").fill("Prepare another edit");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await chat.getByRole("button", { name: "Apply", exact: true }).waitFor();
  const external = original + "External change\n";
  await fs.writeFile(notePath, external);
  await chat.getByRole("button", { name: "Apply", exact: true }).click();
  await chat
    .getByRole("alert")
    .filter({ hasText: /changed/ })
    .waitFor();
  assert.equal(await fs.readFile(notePath, "utf8"), external);
  await chat.getByRole("button", { name: "Discard", exact: true }).click();
  checks.push("External disk changes are not overwritten");
  await chat.getByRole("button", { name: "New chat" }).click();
  await page.evaluate(() => {
    window.aiTest.defer = true;
  });
  await chat.getByLabel("Mode", { exact: true }).selectOption("chat");
  await chat.getByLabel("Message to AI").fill("Wait");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await chat.getByRole("button", { name: "Stop", exact: true }).click();
  await chat.getByText("Stopped. No note was changed.").waitFor();
  checks.push("Stop discards late responses");
  await page.setViewportSize({ width: 850, height: 700 });
  await page.screenshot({ path: "artifacts/lotus-ai-narrow.png" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({ path: "artifacts/lotus-ai-dark.png" });
  assert.ok(await chat.isVisible());
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await chat.getByRole("button", { name: "Close AI assistant" }).click();
  await until(async () => !(await chat.isVisible()), "Close failed");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ root, checks, errors }, null, 2));
} catch (e) {
  await page
    ?.screenshot({ path: "artifacts/lotus-ai-failure.png" })
    .catch(() => {});
  console.error({
    root,
    checks,
    errors,
    diagnostics: await page
      ?.evaluate(() => ({
        calls: window.aiTest?.calls,
        descriptor: Object.getOwnPropertyDescriptor(
          window.__TAURI_INTERNALS__,
          "invoke",
        ),
        text: document.querySelector(".ai-settings")?.textContent,
      }))
      .catch(() => null),
  });
  throw e;
} finally {
  await browser?.close().catch(() => {});
  child.kill();
}
