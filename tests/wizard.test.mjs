// Tests for wizard.js — the catalog matcher and list generator.
//
// wizard.js is a browser script that assigns to window.WIZARD inside an
// IIFE. To test it under Node we shim a global `window`, then require()
// the file (loaded via fs.readFileSync + vm.runInThisContext to avoid
// ESM import limitations on a non-ESM script).
//
// Run with: npm test (or `node --test tests/`)

import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wizardPath = path.join(__dirname, "..", "wizard.js");

let WIZARD;

before(() => {
  // Create a minimal window shim and run the wizard.js script in a
  // sandbox that has access to it.
  const fakeWindow = {};
  const ctx = vm.createContext({ window: fakeWindow });
  const src = fs.readFileSync(wizardPath, "utf-8");
  vm.runInContext(src, ctx);
  WIZARD = fakeWindow.WIZARD;
  if (!WIZARD) throw new Error("wizard.js did not assign window.WIZARD");
});

// --- Step shape -----------------------------------------------------

test("wizard exposes 4 steps with the expected keys", () => {
  assert.equal(WIZARD.STEPS.length, 4);
  // The wizard runs in a separate vm context, so its arrays have a
  // foreign prototype and deepStrictEqual would refuse to match. Compare
  // via JSON to sidestep cross-realm prototype identity.
  const keys = WIZARD.STEPS.map((s) => s.key);
  assert.equal(JSON.stringify(keys), JSON.stringify(["length", "transport", "sleepsAt", "age"]));
});

test("each step has at least 3 options", () => {
  for (const step of WIZARD.STEPS) {
    assert.ok(step.options.length >= 3, `step "${step.key}" has < 3 options`);
    for (const opt of step.options) {
      assert.equal(typeof opt.value, "string");
      assert.equal(typeof opt.title, "string");
    }
  }
});

// --- generateListSpec: every combination ---------------------------
//
// Exhaustive walk: 4 × 3 × 4 × 5 = 240 combinations.
// For each, verify structural invariants the UI depends on.

const ALL_COMBOS = (() => {
  const lengths = ["few-hours", "one-night", "two-three-nights", "extended"];
  const transports = ["walking", "long-drive", "flying"];
  const sleepsAts = ["day-trip", "home", "hotel", "other-house"];
  const ages = ["newborn", "3-6mo", "6-9mo", "9-12mo", "12mo-plus"];
  const out = [];
  for (const length of lengths) {
    for (const transport of transports) {
      for (const sleepsAt of sleepsAts) {
        for (const age of ages) {
          out.push({ length, transport, sleepsAt, age });
        }
      }
    }
  }
  return out;
})();

test("generateListSpec returns a valid spec for all 240 combinations", () => {
  for (const answers of ALL_COMBOS) {
    const spec = WIZARD.generateListSpec(answers);
    assert.equal(typeof spec.name, "string", `bad name for ${JSON.stringify(answers)}`);
    assert.ok(spec.name.length > 0);
    assert.equal(typeof spec.emoji, "string");
    assert.equal(typeof spec.description, "string");
    assert.ok(Array.isArray(spec.categories));
    assert.ok(spec.categories.length > 0);
  }
});

test("no duplicate item text within a generated list (across all combinations)", () => {
  for (const answers of ALL_COMBOS) {
    const spec = WIZARD.generateListSpec(answers);
    const seen = new Set();
    for (const cat of spec.categories) {
      for (const item of cat.items) {
        if (seen.has(item.text)) {
          assert.fail(`duplicate item "${item.text}" in ${JSON.stringify(answers)}`);
        }
        seen.add(item.text);
      }
    }
  }
});

test("every list has exactly one diaper-quantity item (key dedup)", () => {
  const diaperVariants = ["20+ diapers", "12-16 diapers", "2-3 diapers"];
  for (const answers of ALL_COMBOS) {
    const spec = WIZARD.generateListSpec(answers);
    let hits = 0;
    for (const cat of spec.categories) {
      for (const item of cat.items) {
        if (diaperVariants.includes(item.text)) hits++;
      }
    }
    assert.equal(hits, 1, `expected 1 diaper qty, got ${hits} for ${JSON.stringify(answers)}`);
  }
});

test("every list has exactly one outfit-quantity item (key dedup)", () => {
  const outfitVariants = ["4-5 spare outfits", "2-3 spare outfits", "1 spare outfit"];
  for (const answers of ALL_COMBOS) {
    const spec = WIZARD.generateListSpec(answers);
    let hits = 0;
    for (const cat of spec.categories) {
      for (const item of cat.items) {
        if (outfitVariants.includes(item.text)) hits++;
      }
    }
    assert.equal(hits, 1, `expected 1 outfit qty, got ${hits} for ${JSON.stringify(answers)}`);
  }
});

test("every list has exactly one bib-quantity item", () => {
  const bibVariants = ["Bibs (2-4)", "Bib"];
  for (const answers of ALL_COMBOS) {
    const spec = WIZARD.generateListSpec(answers);
    let hits = 0;
    for (const cat of spec.categories) {
      for (const item of cat.items) {
        if (bibVariants.includes(item.text)) hits++;
      }
    }
    assert.equal(hits, 1, `expected 1 bib variant, got ${hits} for ${JSON.stringify(answers)}`);
  }
});

test("every list has exactly one pacifier-quantity item", () => {
  const pacifierVariants = ["2 pacifiers (for ear pressure on takeoff)", "Pacifier"];
  for (const answers of ALL_COMBOS) {
    const spec = WIZARD.generateListSpec(answers);
    let hits = 0;
    for (const cat of spec.categories) {
      for (const item of cat.items) {
        if (pacifierVariants.includes(item.text)) hits++;
      }
    }
    assert.equal(hits, 1, `expected 1 pacifier variant, got ${hits} for ${JSON.stringify(answers)}`);
  }
});

test("essential categories are present in every list", () => {
  const essentials = ["Clothes", "Eating", "Diapers", "Transport"];
  for (const answers of ALL_COMBOS) {
    const spec = WIZARD.generateListSpec(answers);
    const catNames = spec.categories.map((c) => c.name);
    for (const ess of essentials) {
      assert.ok(catNames.includes(ess), `missing "${ess}" for ${JSON.stringify(answers)}`);
    }
  }
});

test("infants flying always have a birth certificate", () => {
  const infantAges = ["newborn", "3-6mo", "6-9mo", "9-12mo"];
  for (const answers of ALL_COMBOS) {
    if (answers.transport !== "flying") continue;
    if (!infantAges.includes(answers.age)) continue;
    const spec = WIZARD.generateListSpec(answers);
    const allText = spec.categories.flatMap((c) => c.items.map((i) => i.text));
    const hasCert = allText.some((t) => /birth certificate/i.test(t));
    assert.ok(hasCert, `infant flight missing birth certificate: ${JSON.stringify(answers)}`);
  }
});

test("solid food items only appear at 6mo+", () => {
  const solidItems = ["Sippy cup with water", "Food pouches (multiple flavors)", "Baby spoons"];
  for (const answers of ALL_COMBOS) {
    if (answers.age === "newborn" || answers.age === "3-6mo") {
      const spec = WIZARD.generateListSpec(answers);
      const allText = spec.categories.flatMap((c) => c.items.map((i) => i.text));
      for (const item of solidItems) {
        assert.equal(
          allText.includes(item),
          false,
          `${item} should not appear at age ${answers.age}`
        );
      }
    }
  }
});

test("pack and play only appears for extended/multi-night stays at someone else's house", () => {
  for (const answers of ALL_COMBOS) {
    const spec = WIZARD.generateListSpec(answers);
    const allText = spec.categories.flatMap((c) => c.items.map((i) => i.text));
    const hasPnp = allText.some((t) => /pack and play/i.test(t));
    if (hasPnp) {
      assert.equal(answers.sleepsAt, "other-house", `pack and play in non-other-house: ${JSON.stringify(answers)}`);
      assert.ok(
        ["two-three-nights", "extended"].includes(answers.length),
        `pack and play in wrong-length trip: ${JSON.stringify(answers)}`
      );
    }
  }
});

test("generated list name is non-empty and includes a descriptor", () => {
  for (let i = 0; i < 50; i++) {
    const spec = WIZARD.generateListSpec({
      length: "one-night",
      transport: "long-drive",
      sleepsAt: "hotel",
      age: "6-9mo",
    });
    assert.ok(spec.name.length > 0);
    assert.ok(spec.name.includes("'s "), `name doesn't include possessive: "${spec.name}"`);
  }
});
