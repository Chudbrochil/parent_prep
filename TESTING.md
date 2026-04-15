# Testing — Packing for Parents

A short, opinionated test design for a small static PWA. The goal is **fast confidence on every commit** without dragging in a giant test framework.

## Quick start

```bash
npm test
```

Runs all tests under `tests/*.test.mjs` using Node's built-in test runner. Should finish in under a second.

No `npm install` needed for the tests themselves — they only use Node built-ins (`node:test`, `node:assert/strict`, `node:vm`, `node:fs`). The single dependency in `package.json` (`@netlify/blobs`) is for the deployed Functions, not the tests.

## Philosophy

Tests for this project follow three principles, borrowed from people who think hard about testing:

### 1. Test behavior, not implementation
> "The more your tests resemble the way your software is used, the more confidence they can give you."  
> — [Kent C. Dodds, "The Testing Trophy"](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)

We test what users (and the deployed functions) actually do — generate a list, sanitize a payload, check a slug — not the internals of how those things are wired together. When we refactor app.js or rename a private helper, the tests should keep passing.

### 2. Fast feedback loop > coverage theatre
> "If your tests are slow, you'll stop running them."  
> — Practical wisdom from every staff engineer who's been around long enough

Our entire suite runs in ~100 ms. That makes tests something we run on save, not something we batch up for CI. We deliberately do not chase coverage percentages — most app code (DOM event handlers, modal show/hide, render loops) is not worth writing brittle DOM tests for.

### 3. Pin the boundaries, trust the middle
We test the interfaces that matter — the inputs and outputs of the wizard, the sanitizer, the share infrastructure — and trust the interior glue. Examples of what we DON'T test:
- DOM event handlers that just call `renderList()` after a state change
- CSS visibility / animation
- Browser API integrations like `navigator.share()` and `localStorage` (we'd need a fake DOM for almost no value)

This lines up with the "trophy" model: **lots of unit tests around pure logic, a few integration tests around real boundaries, almost no end-to-end tests.**

## What's covered today

| File | What it tests |
|---|---|
| [`tests/sanitize.test.mjs`](tests/sanitize.test.mjs) | The `sanitizeList` function used by the share-create Function. Covers null/undefined input, missing fields, oversized fields, too-many-categories, dropping items with no text, prototype-pollution defense, length clamping. |
| [`tests/slug.test.mjs`](tests/slug.test.mjs) | The slug word lists and `generateSlug()`. Verifies word lists are unique, lowercase ASCII, hyphen-free, that 1000 random slugs all match the validation regex, and that `SLUG_PATTERN` rejects path-traversal attempts and other bad input. |
| [`tests/wizard.test.mjs`](tests/wizard.test.mjs) | The wizard's `generateListSpec()` exhaustively across all 240 answer combinations. Verifies no duplicates, exactly one quantity-variant per group (key dedup), essential categories always present, infants flying always have a birth certificate, solid-food items only appear at 6mo+, pack-and-play only appears for extended/multi-night stays at someone else's house, and that names always include the possessive descriptor. |

**Total: 44 tests, ~100 ms runtime.**

## Architecture

### Pure modules in `lib/`

Code that's worth testing in isolation lives in `lib/`:
- [`lib/sanitize.mjs`](lib/sanitize.mjs) — list shape validator and clamper
- [`lib/slug-words.mjs`](lib/slug-words.mjs) — slug word lists, generator, and regex

Both are ESM modules, importable from both Netlify Functions and tests. This is the "extract the logic, leave the wiring" pattern: side-effecting code (DOM, fetch, Blobs) stays in its caller; the testable pure functions live in modules.

### Browser script under test (`wizard.js`)

`wizard.js` is a browser script that assigns to `window.WIZARD` inside an IIFE. We can't `import` it as an ES module from Node. The wizard test loads it via `vm.runInContext` with a fake `window` object:

```js
const fakeWindow = {};
const ctx = vm.createContext({ window: fakeWindow });
vm.runInContext(fs.readFileSync(wizardPath, "utf-8"), ctx);
const WIZARD = fakeWindow.WIZARD;
```

This is good enough for testing pure logic exposed on `window.WIZARD`. **Caveat:** values returned from the vm context have a foreign prototype, so `assert.deepStrictEqual` may refuse to match identical-looking arrays. Workaround: compare via `JSON.stringify` or copy values into the local realm with a loop.

### Why not jsdom / vitest / jest?

| Option | Why we said no (for now) |
|---|---|
| **jsdom** + DOM testing | Most of our DOM code is direct manipulation; testing it would mean re-implementing the browser. The bug surface is mostly in pure logic, which we *do* cover. |
| **vitest / jest** | Both work great. We chose the Node built-in runner because it's zero-config, zero-dependency, and ships with the Node version we already use for Netlify Functions. If we ever need watch mode or coverage reports, we can switch in 30 minutes. |
| **Playwright e2e** | Real-browser tests are valuable but heavy. They require CI infrastructure, browser binaries, and slow test runs. Worth it for an app with 50+ flows; overkill for one with five buttons. |

## Adding a new test

1. Create `tests/<area>.test.mjs`
2. Use the standard pattern:

   ```js
   import { test } from "node:test";
   import assert from "node:assert/strict";
   import { thingUnderTest } from "../lib/whatever.mjs";

   test("describes the behavior in plain English", () => {
     assert.equal(thingUnderTest("input"), "expected output");
   });
   ```

3. `npm test` to run.

### Test naming conventions

- Test names describe **behavior**, not method names: ✅ `"sanitizeList drops items with no text"` not ❌ `"test_sanitize_drop"`
- Group related tests in the same file under the area they belong to (sanitize, slug, wizard)
- Prefer many small focused tests over fewer big ones — a failing test should immediately tell you what broke

### What to test when you add a new feature

A useful checklist:

1. **Happy path** — does the obvious correct input produce the obvious correct output?
2. **Boundary** — what about empty inputs, max-length inputs, unicode, weird whitespace?
3. **Error path** — what happens when inputs are malformed? Should the function return null/throw/clamp?
4. **Security** — could someone pass a dangerous input (script tags, prototype pollution, path traversal)?
5. **Invariants** — is there a property that should always hold? (e.g., "every generated list always has Diapers")

Hit at least three of these for any non-trivial new function.

## What's NOT covered, and why

Honest list of testing gaps:

| Gap | Why it's OK for now |
|---|---|
| **Storage migration logic in `app.js`** | The migration code lives inside an IIFE and isn't easily importable. Migration is exercised manually whenever a user upgrades. Risk is low because the legacy keys have been stable for one version. |
| **Render loop in `renderList()`** | DOM-heavy, hard to test without a fake DOM. Bugs here would be visible immediately on local dev. |
| **Service worker behavior** | Caching behavior is tested implicitly by deploying and seeing if the app works offline. Service worker testing tools exist but they're heavy. |
| **The Netlify Functions integration** | The function code is tested via the extracted `lib/sanitize.mjs` and `lib/slug-words.mjs` (the bulk of the logic). The thin Function wrapper that calls Netlify Blobs is tested manually after deploy. Could add integration tests with a Blobs mock if abuse becomes a concern. |
| **Browser-specific behavior** (Safari vs Chrome) | Manual test in browsers before each release. Not many browsers, not many flows. |

## When to invest more

These are the signals that say "it's time to add more testing infra":

- We're shipping more than once a week and a manual smoke test is too slow → add Playwright e2e for the critical flows
- Multiple contributors are touching the codebase → add CI to run `npm test` on every PR
- Storage migrations get more complex → extract them to a `lib/migration.mjs` and add unit tests
- Sharing usage grows past a few hundred per month → add real Blobs integration tests, monitor abuse

Until then, the current setup is the right amount of effort.

## References

- [Kent C. Dodds — The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Node.js built-in test runner docs](https://nodejs.org/api/test.html)
- [Node.js assert/strict module](https://nodejs.org/api/assert.html#strict-assertion-mode)
- Martin Fowler — [Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- Justin Searls — ["Please don't mock me"](https://www.youtube.com/watch?v=Af4M8GMoxi4) — on testing what matters
