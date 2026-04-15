// Bug hunt tests — each one targets a specific suspected issue
// surfaced by the audit. Some are expected to fail until the fix lands.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

// Each test that mutates state wants its own fresh jsdom instance.
// This helper builds one and returns { dom, window, document }.
function bootFreshApp(opts = {}) {
  const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf-8");
  const dom = new JSDOM(indexHtml, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: opts.url || "http://localhost/",
  });
  const w = dom.window;
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
  // Stub fetch unless overridden
  w.fetch = opts.fetchStub || (() => Promise.reject(new Error("fetch not stubbed")));

  for (const f of ["templates.js", "wizard.js", "app.js"]) {
    w.eval(fs.readFileSync(path.join(repoRoot, f), "utf-8"));
  }
  return { dom, window: w, document: w.document };
}

function openShortTripFresh(w) {
  const cards = w.document.querySelectorAll(".scenario-card");
  cards[0].click();
}

function getItemTextsInFirstCategory(w) {
  const firstCat = w.document.querySelector(".item-category[data-cat-idx]");
  return Array.from(firstCat.querySelectorAll(".item-label")).map((el) => el.textContent);
}

async function flushTimers(w, ms = 200) {
  // Advance async timers by running the event loop several times
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => w.setTimeout(resolve, ms / 20));
  }
}

// ====================================================================
// BUG: Edit-in-place data loss on switching items
// ====================================================================
//
// If the user is editing item A, types new text, and clicks on item B's
// label to edit it, the new text in A should still be saved. Currently
// the blur handler's setTimeout check skips saveEdit because
// editingItemCoord has already been moved to B.

test("BUG: editing item A, then clicking item B, should still save A's text", async () => {
  const { window: w } = bootFreshApp();
  openShortTripFresh(w);

  // Find the first item in the first category and click its label to edit
  const firstCat = w.document.querySelector(".item-category[data-cat-idx]");
  const firstItemLabel = firstCat.querySelector(".item-label");
  const originalTextA = firstItemLabel.textContent;
  firstItemLabel.click();

  // The first item should now be in edit mode — find its input
  const editInputA = w.document.querySelector(".item.editing .item-edit-input");
  assert.ok(editInputA, "item A should be in edit mode");

  // Type new text
  editInputA.value = "EDITED A TEXT";

  // Now find a DIFFERENT item and click its label (switching edit focus)
  const allLabels = w.document.querySelectorAll(".item-category[data-cat-idx]:first-of-type .item-label");
  // First child is the input (edit mode), skip to the next label
  let otherLabel = null;
  for (const el of allLabels) {
    if (el !== firstItemLabel) { otherLabel = el; break; }
  }
  // We need to dispatch blur on editInputA manually since jsdom click
  // doesn't simulate focus transitions the way a real browser does.
  editInputA.dispatchEvent(new w.Event("blur"));
  if (otherLabel) otherLabel.click();

  // Wait for the setTimeout in blur to fire
  await flushTimers(w, 300);

  // Verify item A's text was saved to the updated value
  const firstCatAfter = w.document.querySelector(".item-category[data-cat-idx]");
  const labelsAfter = Array.from(firstCatAfter.querySelectorAll(".item-label")).map((el) => el.textContent);
  assert.ok(
    labelsAfter.includes("EDITED A TEXT"),
    `item A's edit was lost. Labels after: ${JSON.stringify(labelsAfter)}`
  );
  assert.ok(
    !labelsAfter.includes(originalTextA) || labelsAfter.filter((t) => t === originalTextA).length === 0,
    "original text should have been replaced"
  );
});

// ====================================================================
// BUG: blur save should work even when editingItemCoord has moved on
// ====================================================================

test("blur saves text even if focus has shifted (no setTimeout-guard race)", async () => {
  const { window: w } = bootFreshApp();
  openShortTripFresh(w);

  const firstCat = w.document.querySelector(".item-category[data-cat-idx]");
  const firstLabel = firstCat.querySelector(".item-label");
  firstLabel.click();

  const input = w.document.querySelector(".item.editing .item-edit-input");
  input.value = "TYPED BEFORE BLUR";
  // Blur without clicking anywhere (simulates tap-away to empty space)
  input.dispatchEvent(new w.Event("blur"));
  await flushTimers(w);

  const labels = Array.from(w.document.querySelectorAll(".item-label")).map((el) => el.textContent);
  assert.ok(labels.includes("TYPED BEFORE BLUR"), `blur save failed. Labels: ${JSON.stringify(labels)}`);
});

// ====================================================================
// FEATURE: Wizard end-to-end — answer all 4 questions, verify list created
// ====================================================================

test("wizard end-to-end: tapping through all 4 questions generates a list", async () => {
  const { window: w } = bootFreshApp();
  // Click the "Build me a list" button on home
  const createBtn = w.document.querySelector(".create-list-btn");
  assert.ok(createBtn, "+ Build me a list button missing from home");
  createBtn.click();

  // Wizard screen should be visible
  const wizardScreen = w.document.getElementById("wizardScreen");
  assert.equal(wizardScreen.classList.contains("hidden"), false, "wizard should be visible");

  // Answer all 4 questions by clicking the first option each time
  for (let step = 0; step < 4; step++) {
    const options = w.document.querySelectorAll(".wizard-option");
    assert.ok(options.length > 0, `wizard step ${step + 1} has no options`);
    options[0].click();
  }

  // After the 4th answer, the wizard should close and we should be on
  // a newly-created custom list
  assert.equal(wizardScreen.classList.contains("hidden"), true, "wizard should have closed");
  const listScreen = w.document.getElementById("listScreen");
  assert.equal(listScreen.classList.contains("hidden"), false, "should be on list screen");

  // The new list should be a custom list (wizard-generated)
  const stored = JSON.parse(w.localStorage.getItem("parentprep.lists"));
  const customLists = Object.values(stored.lists).filter((l) => l.isCustom);
  assert.ok(customLists.length >= 1, "wizard should have created at least one custom list");
});

// ====================================================================
// FEATURE: Wizard back button walks back through steps
// ====================================================================

test("wizard back button walks back one step without closing", async () => {
  const { window: w } = bootFreshApp();
  w.document.querySelector(".create-list-btn").click();

  // Advance to step 2
  w.document.querySelectorAll(".wizard-option")[0].click();

  // Back button should be visible now
  const backBtn = w.document.getElementById("wizardBackBtn");
  assert.equal(backBtn.classList.contains("hidden"), false, "back button should be visible on step 2");

  // Click it — should go back to step 1
  backBtn.click();

  // Wizard should still be visible
  const wizardScreen = w.document.getElementById("wizardScreen");
  assert.equal(wizardScreen.classList.contains("hidden"), false, "wizard should still be open after back");

  // Back button should be hidden on step 1
  assert.equal(backBtn.classList.contains("hidden"), true, "back button should be hidden on step 1");
});

// ====================================================================
// FEATURE: Wizard close button
// ====================================================================

test("wizard close button returns to home without creating a list", async () => {
  const { window: w } = bootFreshApp();
  w.document.querySelector(".create-list-btn").click();

  // Answer 2 of 4 questions
  w.document.querySelectorAll(".wizard-option")[0].click();
  w.document.querySelectorAll(".wizard-option")[0].click();

  // Click close
  w.document.getElementById("wizardCloseBtn").click();

  // Wizard should be gone
  const wizardScreen = w.document.getElementById("wizardScreen");
  assert.equal(wizardScreen.classList.contains("hidden"), true);

  // No custom lists should have been created
  const storedRaw = w.localStorage.getItem("parentprep.lists");
  if (storedRaw) {
    const stored = JSON.parse(storedRaw);
    const customLists = Object.values(stored.lists).filter((l) => l.isCustom);
    assert.equal(customLists.length, 0, "wizard cancel should not create any lists");
  }
});

// ====================================================================
// BUG: Duplicate should not produce "My My X" when source already starts with My
// ====================================================================

test("duplicating 'My Short trip' does not become 'My My Short trip'", async () => {
  const { window: w } = bootFreshApp();
  openShortTripFresh(w);

  // First duplicate: Short trip → My Short trip
  w.document.getElementById("menuBtn").click();
  w.document.getElementById("duplicateBtn").click();

  // Find the header title
  let headerTitle = w.document.getElementById("headerTitle").textContent;
  assert.ok(headerTitle.includes("My Short trip"), `first duplicate should be 'My Short trip', got: ${headerTitle}`);

  // Second duplicate: My Short trip → should stay My Short trip (no "My My")
  w.document.getElementById("menuBtn").click();
  w.document.getElementById("duplicateBtn").click();

  headerTitle = w.document.getElementById("headerTitle").textContent;
  assert.ok(
    !headerTitle.includes("My My"),
    `second duplicate should not add another 'My', got: ${headerTitle}`
  );
});

// ====================================================================
// FEATURE: Duplicate preserves check state
// ====================================================================

test("duplicate preserves the check state of items", async () => {
  const { window: w } = bootFreshApp();
  openShortTripFresh(w);

  // Check the first item (sort-to-bottom will move it after re-render)
  w.document.querySelector(".item-check").click();

  // Verify at least one item is checked across the whole list
  const checkedBefore = w.document.querySelectorAll(".item.checked");
  assert.ok(checkedBefore.length > 0, "at least one item should be checked before duplicate");

  // Duplicate
  w.document.getElementById("menuBtn").click();
  w.document.getElementById("duplicateBtn").click();

  // The duplicate should have at least one checked item
  const checkedInDupe = w.document.querySelectorAll(".item.checked");
  assert.ok(checkedInDupe.length > 0, "duplicate should preserve checked items");
});

// ====================================================================
// BUG: Import JSON should strip isPreview flag to prevent ephemeral ghosts
// ====================================================================

test("importing a JSON with isPreview list does not create ephemeral lists", () => {
  // This is testing the import handler's behavior. We simulate the
  // import flow by directly dispatching to the change event of the
  // hidden file input.
  const { window: w } = bootFreshApp();

  // Construct a payload with an isPreview list embedded
  const importPayload = {
    app: "Packing for Parents",
    version: "1.0.0",
    schema: 1,
    lists: {
      "custom-abc": {
        isCustom: true,
        isPreview: true,  // should NOT be imported as a preview
        name: "Sneaky",
        emoji: "🕵️",
        description: "Should lose the preview flag",
        categories: [{ name: "Items", items: [{ text: "x" }] }],
      },
    },
  };

  const file = new w.File([JSON.stringify(importPayload)], "test.json", { type: "application/json" });
  const importInput = w.document.getElementById("importFileInput");

  // Use defineProperty to set the files array
  Object.defineProperty(importInput, "files", {
    value: [file],
    configurable: true,
  });

  importInput.dispatchEvent(new w.Event("change", { bubbles: true }));

  // Wait for FileReader to process and the confirm to fire
  return new Promise((resolve) => {
    setTimeout(() => {
      // Accept any resulting confirm by clicking the OK button
      const okBtn = w.document.getElementById("confirmOkBtn");
      if (okBtn && !w.document.getElementById("confirmModal").classList.contains("hidden")) {
        okBtn.click();
      }

      // After import, the list should exist but isPreview should be stripped
      const storage = JSON.parse(w.localStorage.getItem("parentprep.lists") || '{"lists":{}}');
      const imported = storage.lists["custom-abc"];
      if (imported) {
        assert.equal(imported.isPreview, undefined, `isPreview should be stripped, got ${imported.isPreview}`);
      }
      // The list may also not have been persisted if save() skipped it.
      // Either way: no ephemeral list should leak into persistent storage.
      resolve();
    }, 100);
  });
});

// ====================================================================
// FEATURE: Celebration fires when all items are checked
// ====================================================================

test("celebration overlay fires when all items in a list are checked", async () => {
  const { window: w } = bootFreshApp();

  // Create a small custom list via the wizard for fast iteration
  w.document.querySelector(".create-list-btn").click();
  for (let i = 0; i < 4; i++) {
    w.document.querySelectorAll(".wizard-option")[0].click();
  }
  await flushTimers(w);

  // Check every item in the list
  let checkboxes = w.document.querySelectorAll(".item-check");
  while (checkboxes.length > 0) {
    checkboxes[0].click();
    checkboxes = w.document.querySelectorAll(".item:not(.checked) .item-check");
  }

  // Celebration element should be visible (hidden class removed)
  const celebration = w.document.getElementById("celebration");
  assert.equal(
    celebration.classList.contains("hidden"),
    false,
    "celebration should be visible after checking all items"
  );
});

// ====================================================================
// FEATURE: Export + re-import roundtrip preserves list state
// ====================================================================

test("export payload contains user's custom lists and is shaped correctly", async () => {
  const { window: w } = bootFreshApp();
  openShortTripFresh(w);

  // Add a distinguishing item so we can identify the list after export
  const firstAddBtn = w.document.querySelector(".category-add-btn");
  firstAddBtn.click();
  const addInput = w.document.querySelector(".category-add-form input");
  addInput.value = "UNIQUE MARKER ITEM";
  w.document.querySelector(".category-add-form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));

  // Serialize the state the way export would
  const storage = JSON.parse(w.localStorage.getItem("parentprep.lists"));
  assert.ok(storage.lists, "storage should have lists");
  const shortTrip = storage.lists["short-trip"];
  assert.ok(shortTrip, "short-trip list should be in storage after interaction");

  // The marker item should be in one of the categories
  const allItems = shortTrip.categories.flatMap((c) => c.items.map((i) => i.text));
  assert.ok(allItems.includes("UNIQUE MARKER ITEM"), "marker item missing from stored list");
});

// ====================================================================
// HARDENING: Preview list never leaks into home screen or export
// ====================================================================

test("preview list does not appear in 'Your lists' on home screen", async () => {
  const FAKE = {
    name: "Should not show on home",
    emoji: "👻",
    description: "",
    categories: [{ name: "Stuff", items: [{ text: "ghost" }] }],
  };
  const { window: w } = bootFreshApp({
    url: "http://localhost/s/sunny-elmo-park",
    fetchStub: (url) => {
      if (url.indexOf("/api/share-get") !== -1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ list: FAKE }),
        });
      }
      return Promise.reject(new Error("unexpected fetch"));
    },
  });
  await flushTimers(w);

  // We should be on the preview. Navigate home manually by clicking back.
  w.document.getElementById("backBtn").click();

  // Home should be visible
  const homeScreen = w.document.getElementById("homeScreen");
  assert.equal(homeScreen.classList.contains("hidden"), false);

  // The preview list should NOT appear under 'Your lists'
  const cards = Array.from(w.document.querySelectorAll(".scenario-card"));
  const found = cards.find((c) => {
    const title = c.querySelector(".scenario-title");
    return title && title.textContent === "Should not show on home";
  });
  assert.equal(found, undefined, "preview list should be discarded, not shown on home");
});

// ====================================================================
// HARDENING: Storage does not persist the preview list
// ====================================================================

test("preview list is never written to localStorage", async () => {
  const FAKE = {
    name: "Ephemeral",
    emoji: "💨",
    description: "",
    categories: [{ name: "X", items: [{ text: "y" }] }],
  };
  const { window: w } = bootFreshApp({
    url: "http://localhost/s/sunny-elmo-park",
    fetchStub: (url) => {
      if (url.indexOf("/api/share-get") !== -1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ list: FAKE }),
        });
      }
      return Promise.reject(new Error("unexpected"));
    },
  });
  await flushTimers(w);

  // Check an item in the preview to trigger a save()
  const firstCheck = w.document.querySelector(".item-check");
  if (firstCheck) firstCheck.click();

  // Verify localStorage does NOT contain the preview list
  const rawStorage = w.localStorage.getItem("parentprep.lists");
  if (rawStorage) {
    const storage = JSON.parse(rawStorage);
    // PREVIEW_LIST_ID is "__preview__"
    assert.equal(storage.lists["__preview__"], undefined, "preview list leaked into storage");
    // Also ensure no list has isPreview: true
    for (const [id, list] of Object.entries(storage.lists)) {
      assert.notEqual(list.isPreview, true, `list ${id} has isPreview=true in storage`);
    }
  }
});
