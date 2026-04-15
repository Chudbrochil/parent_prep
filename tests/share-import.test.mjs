// Integration tests for the share preview / import flow.
//
// These tests create their OWN jsdom instance (unlike category.test.mjs
// which shares one) because we need to control window.location and
// stub fetch BEFORE app.js runs its init / detectAndImportFromUrl call.
//
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const FAKE_LIST = {
  name: "Shared test list",
  emoji: "🧳",
  description: "A list shared via unit test",
  categories: [
    {
      name: "Clothes",
      items: [
        { text: "Onesies", checked: false },
        { text: "Sleep sack", checked: false },
      ],
    },
    {
      name: "Diapers",
      items: [
        { text: "12 diapers", checked: false },
        { text: "Wipes", checked: false },
      ],
    },
  ],
};

/**
 * Create a fresh jsdom that loads the full app, with:
 *   - window.location pre-set to the given URL (before scripts run)
 *   - window.fetch stubbed to return fakeFetchResponse on /api/share-get
 *
 * Returns the jsdom instance. app.js has already run its init.
 */
function bootApp({ url = "http://localhost/", fakeFetchResponse = null, fakeFetchStatus = 200 } = {}) {
  const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf-8");

  const dom = new JSDOM(indexHtml, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: url,
  });
  const w = dom.window;

  // Stub browser APIs app.js touches
  if (!w.navigator.serviceWorker) {
    Object.defineProperty(w.navigator, "serviceWorker", {
      value: { register: () => Promise.resolve(), addEventListener: () => {} },
      configurable: true,
    });
  }
  if (!w.matchMedia) {
    w.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
  }
  w.scrollTo = () => {};

  // Stub fetch so detectAndImportFromUrl doesn't hit the network.
  // The `global` inside the jsdom realm is different from Node's global,
  // so we have to set fetch on the window.
  w.fetch = function (url) {
    if (typeof url === "string" && url.indexOf("/api/share-get") !== -1) {
      const body = fakeFetchResponse || { list: FAKE_LIST };
      return Promise.resolve({
        ok: fakeFetchStatus >= 200 && fakeFetchStatus < 300,
        status: fakeFetchStatus,
        json: () => Promise.resolve(body),
      });
    }
    return Promise.reject(new Error("Unexpected fetch: " + url));
  };

  // Load the scripts in order. app.js runs its init synchronously inside
  // the IIFE, which calls detectAndImportFromUrl() which is async (fetch).
  const loadScript = (filename) => {
    const code = fs.readFileSync(path.join(repoRoot, filename), "utf-8");
    w.eval(code);
  };

  loadScript("templates.js");
  loadScript("wizard.js");
  loadScript("app.js");

  return dom;
}

/**
 * Wait for the app's async detectAndImportFromUrl to resolve. We use
 * a microtask flush by awaiting a setTimeout(0) a couple of times.
 */
async function flushAsync(w, times = 5) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => w.setTimeout(resolve, 0));
  }
}

// --- Tests ----------------------------------------------------------

test("visiting /s/:slug renders the preview list directly (no modal)", async () => {
  const dom = bootApp({ url: "http://localhost/s/sunny-elmo-park" });
  const w = dom.window;
  await flushAsync(w);

  // The list detail screen should be visible (home screen hidden)
  const listScreen = w.document.getElementById("listScreen");
  const homeScreen = w.document.getElementById("homeScreen");
  assert.equal(listScreen.classList.contains("hidden"), false, "list screen should be visible");
  assert.equal(homeScreen.classList.contains("hidden"), true, "home screen should be hidden");

  // The header should show the shared list name
  const header = w.document.getElementById("headerTitle");
  assert.ok(header.textContent.includes("Shared test list"), `header: "${header.textContent}"`);

  // Preview banner should be visible
  const banner = w.document.getElementById("previewBanner");
  assert.equal(banner.classList.contains("hidden"), false, "preview banner should be visible");

  // Menu button should be hidden (no menu in preview mode)
  const menuBtn = w.document.getElementById("menuBtn");
  assert.ok(menuBtn.classList.contains("hidden"), "menu button should be hidden in preview");
});

test("visiting ?s=slug (query-string fallback) also works", async () => {
  const dom = bootApp({ url: "http://localhost/?s=sunny-elmo-park" });
  const w = dom.window;
  await flushAsync(w);

  const listScreen = w.document.getElementById("listScreen");
  assert.equal(listScreen.classList.contains("hidden"), false);
  const header = w.document.getElementById("headerTitle");
  assert.ok(header.textContent.includes("Shared test list"));
});

test("preview list renders the shared items in their categories", async () => {
  const dom = bootApp({ url: "http://localhost/s/sunny-elmo-park" });
  const w = dom.window;
  await flushAsync(w);

  const headers = Array.from(w.document.querySelectorAll(".category-header")).map((h) => h.textContent);
  assert.ok(headers.includes("Clothes"), `missing Clothes; got ${JSON.stringify(headers)}`);
  assert.ok(headers.includes("Diapers"));

  const items = Array.from(w.document.querySelectorAll(".item-label")).map((i) => i.textContent);
  assert.ok(items.includes("Onesies"));
  assert.ok(items.includes("12 diapers"));
});

test("the 'Save to my lists' button creates a real custom list", async () => {
  const dom = bootApp({ url: "http://localhost/s/sunny-elmo-park" });
  const w = dom.window;
  await flushAsync(w);

  // Click Save
  const saveBtn = w.document.getElementById("previewSaveBtn");
  assert.ok(saveBtn, "save button should exist");
  saveBtn.click();

  // After save, we should still be on a list screen (the freshly-saved one)
  const listScreen = w.document.getElementById("listScreen");
  assert.equal(listScreen.classList.contains("hidden"), false);

  // The preview banner should now be hidden
  const banner = w.document.getElementById("previewBanner");
  assert.ok(banner.classList.contains("hidden"), "preview banner should be hidden after save");

  // The list should be persisted — check localStorage
  const storageRaw = w.localStorage.getItem("parentprep.lists");
  assert.ok(storageRaw, "localStorage should have lists");
  const storage = JSON.parse(storageRaw);
  const savedLists = Object.values(storage.lists).filter((l) => l.importedFrom === "sunny-elmo-park");
  assert.equal(savedLists.length, 1, `expected 1 saved shared list, got ${savedLists.length}`);
  assert.equal(savedLists[0].name, "Shared test list");
});

test("navigating home from preview discards the preview (no persistence)", async () => {
  const dom = bootApp({ url: "http://localhost/s/sunny-elmo-park" });
  const w = dom.window;
  await flushAsync(w);

  // Click back / navigate home
  const backBtn = w.document.getElementById("backBtn");
  backBtn.click();

  // Home should be visible
  const homeScreen = w.document.getElementById("homeScreen");
  assert.equal(homeScreen.classList.contains("hidden"), false);

  // Storage should NOT have a copy of the shared list
  const storageRaw = w.localStorage.getItem("parentprep.lists");
  if (storageRaw) {
    const storage = JSON.parse(storageRaw);
    const savedLists = Object.values(storage.lists).filter((l) => l.importedFrom === "sunny-elmo-park");
    assert.equal(savedLists.length, 0, "preview should not have been persisted");
  }
});

test("revisiting a slug you already saved navigates to the existing copy", async () => {
  // First visit: save the list
  const dom1 = bootApp({ url: "http://localhost/s/sunny-elmo-park" });
  const w1 = dom1.window;
  await flushAsync(w1);
  w1.document.getElementById("previewSaveBtn").click();

  // Extract localStorage to carry over
  const savedStorage = w1.localStorage.getItem("parentprep.lists");
  assert.ok(savedStorage);

  // Second visit: same slug, but with pre-seeded storage
  const dom2 = new JSDOM(fs.readFileSync(path.join(repoRoot, "index.html"), "utf-8"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "http://localhost/s/sunny-elmo-park",
  });
  const w2 = dom2.window;
  w2.localStorage.setItem("parentprep.lists", savedStorage);
  Object.defineProperty(w2.navigator, "serviceWorker", {
    value: { register: () => Promise.resolve(), addEventListener: () => {} },
    configurable: true,
  });
  w2.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
  w2.scrollTo = () => {};
  w2.fetch = function (url) {
    if (typeof url === "string" && url.indexOf("/api/share-get") !== -1) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ list: FAKE_LIST }),
      });
    }
    return Promise.reject(new Error("Unexpected fetch: " + url));
  };
  for (const f of ["templates.js", "wizard.js", "app.js"]) {
    w2.eval(fs.readFileSync(path.join(repoRoot, f), "utf-8"));
  }
  await flushAsync(w2);

  // There should still be exactly 1 list imported from that slug
  const storage2 = JSON.parse(w2.localStorage.getItem("parentprep.lists"));
  const imported = Object.values(storage2.lists).filter((l) => l.importedFrom === "sunny-elmo-park");
  assert.equal(imported.length, 1, `duplicate imports created: got ${imported.length}`);
});

test("invalid slug pattern does not trigger an import", async () => {
  const dom = bootApp({ url: "http://localhost/s/not-a-valid-slug-format-extra-parts" });
  const w = dom.window;
  await flushAsync(w);

  // Home should be visible (no preview)
  const homeScreen = w.document.getElementById("homeScreen");
  assert.equal(homeScreen.classList.contains("hidden"), false, "home should be visible for invalid slug");
  const listScreen = w.document.getElementById("listScreen");
  assert.equal(listScreen.classList.contains("hidden"), true, "list screen should be hidden");
});

test("404 from share-get shows an error toast and navigates home", async () => {
  const dom = bootApp({
    url: "http://localhost/s/sunny-elmo-park",
    fakeFetchResponse: { error: "Not found" },
    fakeFetchStatus: 404,
  });
  const w = dom.window;
  await flushAsync(w, 10);  // give toast time to appear

  // Home should be visible
  const homeScreen = w.document.getElementById("homeScreen");
  assert.equal(homeScreen.classList.contains("hidden"), false);
});
