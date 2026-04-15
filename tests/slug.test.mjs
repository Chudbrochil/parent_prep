// Tests for lib/slug-words.mjs — share-slug word lists and generator.
//
// Run with: npm test (or `node --test tests/`)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADJECTIVES,
  CHARACTERS,
  PLACES,
  SLUG_PATTERN,
  generateSlug,
} from "../lib/slug-words.mjs";

// --- Word list invariants -------------------------------------------

test("each word list has at least 30 entries", () => {
  assert.ok(ADJECTIVES.length >= 30, "adjectives need >= 30 entries");
  assert.ok(CHARACTERS.length >= 30, "characters need >= 30 entries");
  assert.ok(PLACES.length >= 30, "places need >= 30 entries");
});

test("each word list has unique entries (no duplicates)", () => {
  assert.equal(new Set(ADJECTIVES).size, ADJECTIVES.length, "adjectives have duplicates");
  assert.equal(new Set(CHARACTERS).size, CHARACTERS.length, "characters have duplicates");
  assert.equal(new Set(PLACES).size, PLACES.length, "places have duplicates");
});

test("all words are lowercase ASCII letters only", () => {
  const valid = (w) => /^[a-z]+$/.test(w);
  for (const w of ADJECTIVES) assert.ok(valid(w), `bad adjective: "${w}"`);
  for (const w of CHARACTERS) assert.ok(valid(w), `bad character: "${w}"`);
  for (const w of PLACES) assert.ok(valid(w), `bad place: "${w}"`);
});

test("no word contains hyphens (would break slug parsing)", () => {
  for (const w of [...ADJECTIVES, ...CHARACTERS, ...PLACES]) {
    assert.equal(w.indexOf("-"), -1, `word contains hyphen: "${w}"`);
  }
});

test("there are at least 27,000 unique combinations (collision safety)", () => {
  const total = ADJECTIVES.length * CHARACTERS.length * PLACES.length;
  assert.ok(total >= 27000, `only ${total} combos — risk of collision is too high`);
});

// --- generateSlug --------------------------------------------------

test("generateSlug always returns a string matching SLUG_PATTERN", () => {
  for (let i = 0; i < 1000; i++) {
    const slug = generateSlug();
    assert.equal(typeof slug, "string");
    assert.ok(SLUG_PATTERN.test(slug), `slug failed regex: "${slug}"`);
  }
});

test("generateSlug produces three hyphen-separated parts", () => {
  for (let i = 0; i < 100; i++) {
    const parts = generateSlug().split("-");
    assert.equal(parts.length, 3, `expected 3 parts, got ${parts.length}`);
  }
});

test("generateSlug uses words from the curated lists", () => {
  const adjSet = new Set(ADJECTIVES);
  const charSet = new Set(CHARACTERS);
  const placeSet = new Set(PLACES);
  for (let i = 0; i < 100; i++) {
    const [adj, char, place] = generateSlug().split("-");
    assert.ok(adjSet.has(adj), `unknown adjective: "${adj}"`);
    assert.ok(charSet.has(char), `unknown character: "${char}"`);
    assert.ok(placeSet.has(place), `unknown place: "${place}"`);
  }
});

test("generateSlug exhibits randomness across many calls", () => {
  // Generate 200 slugs and assert at least 100 are unique.
  // 64,000 combinations means ~99% should be unique in this sample.
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(generateSlug());
  assert.ok(seen.size >= 100, `only ${seen.size} unique out of 200 — randomness looks broken`);
});

// --- SLUG_PATTERN sanity --------------------------------------------

test("SLUG_PATTERN rejects invalid inputs", () => {
  const bad = [
    "",
    "no-dashes",
    "elmo",
    "elmo-cookie",
    "elmo-cookie-park-extra",
    "Elmo-cookie-park",        // uppercase
    "elmo cookie park",         // spaces
    "elmo_cookie_park",         // underscores
    "elmo-cookie-",             // trailing dash
    "-elmo-cookie-park",        // leading dash
    "../etc/passwd",            // path traversal attempt
    "elmo-cookie-park.json",    // extension
  ];
  for (const slug of bad) {
    assert.equal(SLUG_PATTERN.test(slug), false, `should reject: "${slug}"`);
  }
});

test("SLUG_PATTERN accepts valid inputs", () => {
  const good = ["elmo-cookie-park", "sunny-bluey-meadow", "a-b-c"];
  for (const slug of good) {
    assert.equal(SLUG_PATTERN.test(slug), true, `should accept: "${slug}"`);
  }
});
