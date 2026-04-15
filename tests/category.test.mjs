// Integration tests for category CRUD (create, rename, delete).
//
// These tests load the real index.html + scripts inside jsdom, simulate
// user clicks and key events, and assert the resulting DOM + state.
//
// jsdom is a devDependency only — Netlify builds skip it because
// NODE_ENV=production omits devDependencies.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

// --- Boot the app inside jsdom -------------------------------------

let dom;
let window;
let document;

before(() => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf-8");

  // Create a jsdom instance. runScripts: "outside-only" means we
  // control script execution explicitly — none of the <script src=...>
  // tags in the HTML auto-run. We then read each script file and eval
  // it inside the jsdom context manually.
  dom = new JSDOM(indexHtml, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  window = dom.window;
  document = window.document;

  // Stub a minimal localStorage so app.js can save/load state.
  // jsdom does ship a localStorage but it's per-window; this is fine.

  // app.js calls navigator.serviceWorker — stub it to a no-op
  if (!window.navigator.serviceWorker) {
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {
        register: () => Promise.resolve(),
        addEventListener: () => {},
      },
      configurable: true,
    });
  }

  // app.js may call matchMedia — stub it
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
  }

  // app.js calls window.scrollTo on showList — stub
  window.scrollTo = () => {};

  // Load the scripts in the same order as index.html
  const loadScript = (filename) => {
    const code = fs.readFileSync(path.join(repoRoot, filename), "utf-8");
    window.eval(code);
  };

  loadScript("templates.js");
  loadScript("wizard.js");
  loadScript("app.js");
  // sw-register.js is loaded last but it just registers a SW; safe to skip
});

// --- Helpers --------------------------------------------------------

function clearStorage() {
  window.localStorage.clear();
}

function openShortTrip() {
  // jsdom is shared across tests, so app.js's in-memory state.lists
  // persists between tests too. Clearing localStorage isn't enough.
  // To get a clean slate, we open Short trip and immediately Reset to
  // defaults, which rebuilds the list from the template definition.
  const cards = document.querySelectorAll(".scenario-card");
  if (cards.length === 0) throw new Error("No scenario cards rendered");
  cards[0].click();

  // If the menu has a Reset button (template lists do), use it
  const menuBtn = document.getElementById("menuBtn");
  if (menuBtn && !menuBtn.classList.contains("hidden")) {
    menuBtn.click();
    const resetBtn = document.getElementById("resetBtn");
    if (resetBtn && !resetBtn.classList.contains("hidden")) {
      resetBtn.click();
      // Confirm the reset
      const okBtn = document.getElementById("confirmOkBtn");
      if (okBtn) okBtn.click();
    } else {
      // Close the menu if reset wasn't available
      const closeBtn = document.getElementById("closeMenuBtn");
      if (closeBtn) closeBtn.click();
    }
  }
}

function getCategoryHeaders() {
  return Array.from(document.querySelectorAll(".category-header")).map((el) => el.textContent);
}

function getRenderedCategories() {
  return Array.from(document.querySelectorAll(".item-category[data-cat-idx]"));
}

// --- Tests ----------------------------------------------------------

test("home screen renders the four template cards", () => {
  const cards = document.querySelectorAll(".scenario-card");
  assert.ok(cards.length >= 4, `expected at least 4 scenario cards, got ${cards.length}`);
});

test("opening a list renders category headers", () => {
  openShortTrip();
  const headers = getCategoryHeaders();
  assert.ok(headers.length > 0, "no category headers rendered");
  assert.ok(headers.includes("Clothes"), "missing 'Clothes' category");
});

test("each category has a delete button visible by default", () => {
  openShortTrip();
  const cats = getRenderedCategories();
  for (const cat of cats) {
    const delBtn = cat.querySelector(".category-delete-btn");
    assert.ok(delBtn, "category missing delete button");
  }
});

test("each category has a + Add item button by default", () => {
  openShortTrip();
  const cats = getRenderedCategories();
  for (const cat of cats) {
    const addBtn = cat.querySelector(".category-add-btn");
    assert.ok(addBtn, "category missing + Add item button");
  }
});

test("'+ New category' button appears at the bottom of the list", () => {
  openShortTrip();
  const newCatBtn = document.querySelector(".new-category-btn");
  assert.ok(newCatBtn, "missing + New category button");
});

test("clicking a category header switches it to rename mode", () => {
  openShortTrip();
  const firstHeader = document.querySelector(".category-header");
  const originalName = firstHeader.textContent;
  firstHeader.click();
  // After click, that category's header should be replaced with an input
  const renameInput = document.querySelector(".category-rename-input");
  assert.ok(renameInput, "rename input did not appear after clicking header");
  assert.equal(renameInput.value, originalName, "rename input not pre-filled with original name");
});

test("renaming a category persists the new name", () => {
  openShortTrip();
  const firstHeader = document.querySelector(".category-header");
  firstHeader.click();
  const renameInput = document.querySelector(".category-rename-input");
  renameInput.value = "Renamed Category";
  // Press Enter to save
  const enterEvent = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  renameInput.dispatchEvent(enterEvent);
  // After save, header should show the new name
  const headers = getCategoryHeaders();
  assert.ok(headers.includes("Renamed Category"), `headers after rename: ${JSON.stringify(headers)}`);
});

test("Escape during rename cancels without saving", () => {
  openShortTrip();
  const firstHeader = document.querySelector(".category-header");
  const originalName = firstHeader.textContent;
  firstHeader.click();
  const renameInput = document.querySelector(".category-rename-input");
  renameInput.value = "Should Not Save";
  const escEvent = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  renameInput.dispatchEvent(escEvent);
  const headers = getCategoryHeaders();
  assert.ok(headers.includes(originalName), `Escape didn't restore original; headers: ${JSON.stringify(headers)}`);
  assert.ok(!headers.includes("Should Not Save"), "Escape saved the in-progress text");
});

test("empty rename leaves the original name unchanged", () => {
  openShortTrip();
  const firstHeader = document.querySelector(".category-header");
  const originalName = firstHeader.textContent;
  firstHeader.click();
  const renameInput = document.querySelector(".category-rename-input");
  renameInput.value = "   ";  // only whitespace
  const enterEvent = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  renameInput.dispatchEvent(enterEvent);
  const headers = getCategoryHeaders();
  assert.ok(headers.includes(originalName), "empty rename overwrote the name");
});

test("creating a new category appends it to the list", () => {
  openShortTrip();
  const newCatBtn = document.querySelector(".new-category-btn");
  newCatBtn.click();
  // Now the form should be visible
  const form = document.querySelector(".new-category-form");
  assert.ok(form, "new-category-form did not appear");
  const input = form.querySelector("input");
  input.value = "Travel docs";
  // Submit the form
  const submitEvent = new window.Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(submitEvent);
  // The new category should now appear in the headers
  const headers = getCategoryHeaders();
  assert.ok(headers.includes("Travel docs"), `headers after create: ${JSON.stringify(headers)}`);
  // And it should be at the END
  assert.equal(headers[headers.length - 1], "Travel docs", "new category should be last");
});

test("creating a new category auto-opens its + Add item form", () => {
  openShortTrip();
  document.querySelector(".new-category-btn").click();
  const form = document.querySelector(".new-category-form");
  form.querySelector("input").value = "Mom's snacks";
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  // The newly-created category should have an OPEN add form (not just a button)
  const sections = getRenderedCategories();
  const lastSection = sections[sections.length - 1];
  const addForm = lastSection.querySelector(".category-add-form");
  assert.ok(addForm, "new category did not auto-open its add form");
});

test("deleting a category requires confirmation and removes it", () => {
  openShortTrip();
  const headersBefore = getCategoryHeaders();
  const firstCat = document.querySelector(".item-category[data-cat-idx]");
  const firstName = firstCat.querySelector(".category-header").textContent;
  // Click the delete button
  firstCat.querySelector(".category-delete-btn").click();
  // Confirm dialog should be visible
  const confirmModal = document.getElementById("confirmModal");
  assert.ok(!confirmModal.classList.contains("hidden"), "confirm dialog did not appear");
  // Click the confirm button
  document.getElementById("confirmOkBtn").click();
  // Category should be removed
  const headersAfter = getCategoryHeaders();
  assert.ok(!headersAfter.includes(firstName), `category "${firstName}" was not removed: ${JSON.stringify(headersAfter)}`);
  assert.equal(headersAfter.length, headersBefore.length - 1);
});

test("cancelling delete leaves the category in place", () => {
  openShortTrip();
  const headersBefore = getCategoryHeaders();
  const firstCat = document.querySelector(".item-category[data-cat-idx]");
  firstCat.querySelector(".category-delete-btn").click();
  // Click Cancel instead of Confirm
  document.getElementById("confirmCancelBtn").click();
  const headersAfter = getCategoryHeaders();
  assert.deepEqual(
    JSON.stringify(headersAfter),
    JSON.stringify(headersBefore),
    "delete cancel should leave headers unchanged"
  );
});

test("rename mode hides the delete button (mutual exclusion)", () => {
  openShortTrip();
  const firstHeader = document.querySelector(".category-header");
  firstHeader.click();
  // The category that's now in rename mode should not have a delete button
  const cats = getRenderedCategories();
  const renamingCat = cats.find((c) => c.querySelector(".category-rename-input"));
  assert.ok(renamingCat, "no category is in rename mode");
  const delBtn = renamingCat.querySelector(".category-delete-btn");
  assert.equal(delBtn, null, "delete button should be hidden in rename mode");
});

test("clicking + New category closes any open rename mode", () => {
  openShortTrip();
  // Open a rename
  document.querySelector(".category-header").click();
  assert.ok(document.querySelector(".category-rename-input"), "rename did not open");
  // Now click + New category
  document.querySelector(".new-category-btn").click();
  // Rename input should be gone, new-category form should be present
  assert.equal(document.querySelector(".category-rename-input"), null, "rename input still open after + New category click");
  assert.ok(document.querySelector(".new-category-form"), "new-category form did not appear");
});

test("Reset to defaults restores the original categories after delete", () => {
  openShortTrip();
  const headersBefore = getCategoryHeaders();
  // Delete the first category
  const firstCat = document.querySelector(".item-category[data-cat-idx]");
  firstCat.querySelector(".category-delete-btn").click();
  document.getElementById("confirmOkBtn").click();
  // Sanity: it's gone
  assert.equal(getCategoryHeaders().length, headersBefore.length - 1);
  // Now click the menu and Reset to defaults
  document.getElementById("menuBtn").click();
  document.getElementById("resetBtn").click();
  // Confirm reset
  document.getElementById("confirmOkBtn").click();
  // Categories should be restored
  const headersAfter = getCategoryHeaders();
  assert.equal(headersAfter.length, headersBefore.length, "Reset to defaults did not restore categories");
});
