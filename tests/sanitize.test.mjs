// Tests for lib/sanitize.mjs — the validator/clamp used by share-create.
//
// Run with: npm test (or `node --test tests/`)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeList,
  clampString,
  MAX_LIST_NAME_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_CATEGORIES,
  MAX_ITEMS_PER_CATEGORY,
} from "../lib/sanitize.mjs";

// --- clampString -----------------------------------------------------

test("clampString trims whitespace", () => {
  assert.equal(clampString("  hello  ", 100), "hello");
});

test("clampString returns empty string for non-strings", () => {
  assert.equal(clampString(null, 100), "");
  assert.equal(clampString(undefined, 100), "");
  assert.equal(clampString(42, 100), "");
  assert.equal(clampString({}, 100), "");
});

test("clampString cuts off at maxLen", () => {
  assert.equal(clampString("a".repeat(50), 10), "a".repeat(10));
});

test("clampString preserves strings under maxLen", () => {
  assert.equal(clampString("hello", 100), "hello");
});

// --- sanitizeList: rejection cases -----------------------------------

test("sanitizeList rejects null", () => {
  assert.equal(sanitizeList(null), null);
});

test("sanitizeList rejects undefined", () => {
  assert.equal(sanitizeList(undefined), null);
});

test("sanitizeList rejects non-objects", () => {
  assert.equal(sanitizeList("a string"), null);
  assert.equal(sanitizeList(42), null);
  assert.equal(sanitizeList(true), null);
});

test("sanitizeList rejects missing categories", () => {
  assert.equal(sanitizeList({ name: "x" }), null);
});

test("sanitizeList rejects non-array categories", () => {
  assert.equal(sanitizeList({ name: "x", categories: "nope" }), null);
});

test("sanitizeList rejects too many categories", () => {
  const cats = [];
  for (let i = 0; i < MAX_CATEGORIES + 1; i++) {
    cats.push({ name: "Cat " + i, items: [{ text: "Item" }] });
  }
  assert.equal(sanitizeList({ categories: cats }), null);
});

test("sanitizeList rejects when no category survives", () => {
  // All categories have invalid items, so cleaned categories is empty
  assert.equal(
    sanitizeList({
      categories: [
        { name: "Bad", items: "not an array" },
        { name: "Also bad", items: [{ text: "" }] },
      ],
    }),
    null
  );
});

// --- sanitizeList: happy path ---------------------------------------

test("sanitizeList accepts a valid list", () => {
  const input = {
    name: "Short trip",
    emoji: "🚗",
    description: "A quick trip",
    categories: [
      {
        name: "Diapers",
        items: [
          { text: "Diapers", checked: false },
          { text: "Wipes", checked: true },
        ],
      },
    ],
  };
  const result = sanitizeList(input);
  assert.ok(result);
  assert.equal(result.name, "Short trip");
  assert.equal(result.emoji, "🚗");
  assert.equal(result.description, "A quick trip");
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].items.length, 2);
  assert.equal(result.categories[0].items[1].checked, true);
});

test("sanitizeList provides default name/emoji/description when missing", () => {
  const result = sanitizeList({
    categories: [{ name: "Items", items: [{ text: "Diapers" }] }],
  });
  assert.ok(result);
  assert.equal(result.name, "Shared list");
  assert.equal(result.emoji, "📋");
  assert.equal(result.description, "Shared list");
});

// --- sanitizeList: clamping -----------------------------------------

test("sanitizeList clamps oversize list name", () => {
  const longName = "A".repeat(MAX_LIST_NAME_LENGTH * 2);
  const result = sanitizeList({
    name: longName,
    categories: [{ name: "Items", items: [{ text: "x" }] }],
  });
  assert.ok(result);
  assert.equal(result.name.length, MAX_LIST_NAME_LENGTH);
});

test("sanitizeList clamps oversize item text", () => {
  const longText = "A".repeat(MAX_ITEM_TEXT_LENGTH * 2);
  const result = sanitizeList({
    categories: [{ name: "Items", items: [{ text: longText }] }],
  });
  assert.ok(result);
  assert.equal(result.categories[0].items[0].text.length, MAX_ITEM_TEXT_LENGTH);
});

test("sanitizeList drops categories with too many items", () => {
  const items = [];
  for (let i = 0; i < MAX_ITEMS_PER_CATEGORY + 1; i++) {
    items.push({ text: "Item " + i });
  }
  const result = sanitizeList({
    categories: [
      { name: "OK cat", items: [{ text: "Diapers" }] },
      { name: "Too many", items: items },
    ],
  });
  assert.ok(result);
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].name, "OK cat");
});

test("sanitizeList drops items with no text", () => {
  const result = sanitizeList({
    categories: [
      {
        name: "Mixed",
        items: [
          { text: "Diapers" },
          { text: "" },
          { text: "   " },
          { text: "Wipes" },
          {},
          null,
        ],
      },
    ],
  });
  assert.ok(result);
  assert.equal(result.categories[0].items.length, 2);
  assert.equal(result.categories[0].items[0].text, "Diapers");
  assert.equal(result.categories[0].items[1].text, "Wipes");
});

test("sanitizeList coerces checked to boolean", () => {
  const result = sanitizeList({
    categories: [
      {
        name: "Mixed",
        items: [
          { text: "a", checked: 1 },
          { text: "b", checked: "yes" },
          { text: "c", checked: 0 },
          { text: "d", checked: undefined },
        ],
      },
    ],
  });
  assert.ok(result);
  assert.equal(result.categories[0].items[0].checked, true);
  assert.equal(result.categories[0].items[1].checked, true);
  assert.equal(result.categories[0].items[2].checked, false);
  assert.equal(result.categories[0].items[3].checked, false);
});

// --- sanitizeList: security boundaries ------------------------------

test("sanitizeList preserves HTML in text but does not interpret it (caller must escape)", () => {
  // The sanitizer's job is to clamp length and shape, not to escape HTML.
  // Escaping happens at render time via escapeHTML().
  const result = sanitizeList({
    categories: [
      {
        name: "Test",
        items: [{ text: "<script>alert('xss')</script>" }],
      },
    ],
  });
  assert.ok(result);
  assert.equal(result.categories[0].items[0].text, "<script>alert('xss')</script>");
});

test("sanitizeList does not pollute prototypes via __proto__", () => {
  const result = sanitizeList({
    name: "Test",
    categories: [
      {
        name: "Cat",
        items: [{ text: "Item" }],
        __proto__: { polluted: true },
      },
    ],
  });
  assert.ok(result);
  // Verify nothing leaked onto the prototype chain
  assert.equal(({}).polluted, undefined);
});
