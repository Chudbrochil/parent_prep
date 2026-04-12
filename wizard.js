// ParentPrep wizard — "TurboTax for baby packing"
//
// Asks the user four questions, then composes a personalized list by
// filtering a catalog of ~70 candidate items against their answers.
//
// FUTURE DESIGN NOTE — item deduplication:
// Today each quantity-variant of an item is a separate catalog entry
// (e.g. "2-3 diapers", "12-16 diapers", "20+ diapers"). These are
// conceptually the same thing and should probably become ONE canonical
// item ("Diapers") with a quantity function that returns the right
// phrasing based on trip length. Same goes for "Bibs", "Outfits",
// "Burp cloths", etc. Doing this right needs a canonical item model
// with a stable ID, an item-tags system, and a quantity rule language.
// For now, the simple duplicate-and-filter approach gets us to a
// working wizard with understandable data — do not over-engineer here.
(function () {
  "use strict";

  // --- Question steps ------------------------------------------------

  const STEPS = [
    {
      key: "length",
      question: "How long is your trip?",
      options: [
        { value: "few-hours", emoji: "⏱️", title: "A few hours", sub: "Store, park, short errand" },
        { value: "one-night", emoji: "🌙", title: "1 night", sub: "Overnight somewhere" },
        { value: "two-three-nights", emoji: "📅", title: "2-3 nights", sub: "Weekend or long weekend" },
        { value: "extended", emoji: "📆", title: "Multi-day / extended stay", sub: "A week or longer" },
      ],
    },
    {
      key: "transport",
      question: "How are you getting there?",
      options: [
        { value: "walking", emoji: "🚶", title: "Walking / short drive", sub: "Under an hour" },
        { value: "long-drive", emoji: "🚗", title: "Long drive", sub: "2 to 8 hours in the car" },
        { value: "flying", emoji: "✈️", title: "Flying", sub: "Plane trip" },
      ],
    },
    {
      key: "sleepsAt",
      question: "Where will baby sleep?",
      options: [
        { value: "day-trip", emoji: "☀️", title: "Not sleeping away", sub: "Day trip only, home by bedtime" },
        { value: "home", emoji: "🛏️", title: "Our own bed or car", sub: "Using our usual setup" },
        { value: "hotel", emoji: "🏨", title: "Hotel", sub: "They'll have a crib" },
        { value: "other-house", emoji: "🏡", title: "Someone else's home", sub: "Bringing our own setup" },
      ],
    },
    {
      key: "age",
      question: "How old is baby?",
      options: [
        { value: "newborn", emoji: "👶", title: "Under 3 months", sub: "Newborn" },
        { value: "3-6mo", emoji: "🍼", title: "3-6 months", sub: "Bottle / nursing era" },
        { value: "6-9mo", emoji: "🥄", title: "6-9 months", sub: "Starting solids" },
        { value: "9-12mo", emoji: "🪑", title: "9-12 months", sub: "Sitting, grabbing everything" },
        { value: "12mo-plus", emoji: "🧒", title: "12+ months", sub: "Walking or cruising" },
      ],
    },
  ];

  // --- Item catalog --------------------------------------------------
  //
  // `when` can be:
  //   - omitted (always matches)
  //   - an object: all key/value pairs must match (AND semantics)
  //   - an array of objects: at least one must fully match (OR semantics)

  const CATALOG = [
    // CLOTHES
    { text: "1 spare outfit", category: "Clothes", when: { length: ["few-hours"] } },
    { text: "2-3 spare outfits", category: "Clothes", when: { length: ["one-night", "two-three-nights"] } },
    { text: "4-5 spare outfits", category: "Clothes", when: { length: ["extended"] } },
    { text: "Muslin cloth / small blanket (multi-use)", category: "Clothes" },
    { text: "Weather layers + hat", category: "Clothes" },
    { text: "Bib", category: "Clothes", when: { length: ["few-hours"] } },
    { text: "Bibs (2-4)", category: "Clothes", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Pajamas", category: "Clothes", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Extra pajamas (night leaks happen)", category: "Clothes", when: { length: ["two-three-nights", "extended"] } },
    { text: "Change of shirt for parent", category: "Clothes", when: [{ length: ["two-three-nights", "extended"] }, { transport: ["flying"] }] },
    { text: "Sweater / extra layer", category: "Clothes", when: { length: ["extended"] } },

    // SLEEPING
    { text: "Pacifier", category: "Sleeping" },
    { text: "2 pacifiers (for ear pressure on takeoff)", category: "Sleeping", when: { transport: ["flying"] } },
    { text: "Comfort toy / lovey", category: "Sleeping", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Sleep sack", category: "Sleeping", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Pack and play bassinet", category: "Sleeping", when: { sleepsAt: ["other-house"], length: ["two-three-nights", "extended"] } },
    { text: "2 sheets for the pack and play", category: "Sleeping", when: { sleepsAt: ["other-house"], length: ["two-three-nights", "extended"] } },
    { text: "Portable white noise / sound machine", category: "Sleeping", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Night light", category: "Sleeping", when: { sleepsAt: ["other-house", "hotel"], length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Baby monitor", category: "Sleeping", when: { sleepsAt: ["other-house"], length: ["two-three-nights", "extended"] } },
    { text: "Blackout shades / window cover", category: "Sleeping", when: { sleepsAt: ["other-house"], length: ["extended"] } },

    // EATING
    { text: "Bottle + formula OR nursing setup", category: "Eating" },
    { text: "Pre-measured formula portions", category: "Eating", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Pump + cooler (if nursing)", category: "Eating", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Nursing cover", category: "Eating" },
    { text: "Nursing pads", category: "Eating", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "2 burp cloths", category: "Eating", when: { length: ["few-hours"] } },
    { text: "Burp cloths (3-4)", category: "Eating", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Water bottle (for parent)", category: "Eating" },
    { text: "Nipple shields", category: "Eating", when: { sleepsAt: ["other-house"], length: ["extended"] } },
    { text: "Water warmer for bottles", category: "Eating", when: { sleepsAt: ["other-house"], length: ["two-three-nights", "extended"] } },
    { text: "Sippy cup with water", category: "Eating", when: { age: ["6-9mo", "9-12mo", "12mo-plus"] } },
    { text: "Food pouches (multiple flavors)", category: "Eating", when: { age: ["6-9mo", "9-12mo", "12mo-plus"] } },
    { text: "Baby spoons", category: "Eating", when: { age: ["6-9mo", "9-12mo", "12mo-plus"] } },
    { text: "Puffs / crackers", category: "Eating", when: { age: ["9-12mo", "12mo-plus"] } },
    { text: "Snack catcher / small container", category: "Eating", when: { age: ["9-12mo", "12mo-plus"] } },

    // DIAPERS
    { text: "2-3 diapers", category: "Diapers", when: { length: ["few-hours"] } },
    { text: "12-16 diapers", category: "Diapers", when: { length: ["one-night", "two-three-nights"] } },
    { text: "20+ diapers", category: "Diapers", when: [{ length: ["extended"] }, { transport: ["flying"] }] },
    { text: "Wipes pack", category: "Diapers" },
    { text: "Extra travel wipes pack", category: "Diapers", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Travel changing pad", category: "Diapers" },
    { text: "Diaper rash cream", category: "Diapers" },
    { text: "Disposable bags for dirty diapers", category: "Diapers" },

    // TRANSPORT
    { text: "Car seat", category: "Transport" },
    { text: "Stroller", category: "Transport" },
    { text: "Baby carrier", category: "Transport" },
    { text: "Stroller rain cover", category: "Transport", when: [{ transport: ["flying"] }, { length: ["extended"] }] },

    // ENTERTAINMENT
    { text: "Small toy / rattle", category: "Entertainment" },
    { text: "Teethers", category: "Entertainment", when: { age: ["3-6mo", "6-9mo", "9-12mo"] } },
    { text: "Board books", category: "Entertainment", when: { age: ["6-9mo", "9-12mo", "12mo-plus"] } },
    { text: "Small new toy (surprise for the journey)", category: "Entertainment", when: { transport: ["flying", "long-drive"] } },
    { text: "Tablet with downloaded shows", category: "Entertainment", when: { age: ["9-12mo", "12mo-plus"], transport: ["flying", "long-drive"] } },
    { text: "Kid-sized headphones", category: "Entertainment", when: { age: ["9-12mo", "12mo-plus"], transport: ["flying"] } },

    // HEALTH & DOCUMENTS
    { text: "Baby Tylenol (ask pediatrician)", category: "Health & documents", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Baby Ibuprofen (6mo+, ask pediatrician)", category: "Health & documents", when: { age: ["6-9mo", "9-12mo", "12mo-plus"], length: ["one-night", "two-three-nights", "extended"] } },
    { text: "Thermometer", category: "Health & documents", when: { length: ["one-night", "two-three-nights", "extended"] } },
    { text: "First aid basics (band-aids, saline drops)", category: "Health & documents", when: { length: ["two-three-nights", "extended"] } },
    { text: "Health insurance card", category: "Health & documents", when: [{ length: ["one-night", "two-three-nights", "extended"] }, { transport: ["flying", "long-drive"] }] },
    { text: "Birth certificate (required for infant flights)", category: "Health & documents", when: { transport: ["flying"], age: ["newborn", "3-6mo", "6-9mo", "9-12mo"] } },
    { text: "Passport (for international travel)", category: "Health & documents", when: { transport: ["flying"], length: ["two-three-nights", "extended"] } },
    { text: "Prescription medications (if any)", category: "Health & documents", when: { length: ["two-three-nights", "extended"] } },

    // PARENT SURVIVAL
    { text: "Hand sanitizer", category: "Parent survival" },
    { text: "Tissues", category: "Parent survival" },
    { text: "Disinfecting wipes", category: "Parent survival", when: [{ transport: ["flying"] }, { length: ["two-three-nights", "extended"] }] },
    { text: "Ziploc bags (multiple sizes)", category: "Parent survival", when: [{ transport: ["flying"] }, { length: ["two-three-nights", "extended"] }] },
    { text: "Barf bags / vomit ziplocs", category: "Parent survival", when: { transport: ["long-drive", "flying"] } },
    { text: "Snacks + water for parent", category: "Parent survival", when: [{ length: ["two-three-nights", "extended"] }, { transport: ["long-drive", "flying"] }] },
    { text: "Trash bag for the car", category: "Parent survival", when: { transport: ["long-drive"] } },
    { text: "Power bank + extra charger cables", category: "Parent survival", when: [{ transport: ["long-drive", "flying"] }, { length: ["two-three-nights", "extended"] }] },
    { text: "Sunhat (if outdoors)", category: "Parent survival" },
    { text: "Sunscreen (6mo+)", category: "Parent survival", when: { age: ["6-9mo", "9-12mo", "12mo-plus"] } },
    { text: "Laundry pods (free and clear)", category: "Parent survival", when: { length: ["extended"] } },
  ];

  const CATEGORY_ORDER = [
    "Clothes",
    "Sleeping",
    "Eating",
    "Diapers",
    "Transport",
    "Entertainment",
    "Health & documents",
    "Parent survival",
  ];

  const SAFETY_DEFAULT = [
    { text: "Diapers", category: "Diapers" },
    { text: "Wipes", category: "Diapers" },
    { text: "Car seat", category: "Transport" },
    { text: "Bottle + formula OR nursing setup", category: "Eating" },
    { text: "1 spare outfit", category: "Clothes" },
  ];

  // --- Matching ------------------------------------------------------

  function checkCond(cond, answers) {
    for (const key in cond) {
      if (!Object.prototype.hasOwnProperty.call(cond, key)) continue;
      const allowed = cond[key];
      if (allowed.indexOf(answers[key]) === -1) return false;
    }
    return true;
  }

  function itemMatches(item, answers) {
    if (!item.when) return true;
    if (Array.isArray(item.when)) {
      for (let i = 0; i < item.when.length; i++) {
        if (checkCond(item.when[i], answers)) return true;
      }
      return false;
    }
    return checkCond(item.when, answers);
  }

  // --- List composition ----------------------------------------------

  function generateListSpec(answers) {
    // Filter catalog
    let matched = CATALOG.filter(function (item) { return itemMatches(item, answers); });

    // Dedupe by text (in case OR conditions cause duplicates)
    const seen = {};
    const deduped = [];
    matched.forEach(function (item) {
      if (!seen[item.text]) { seen[item.text] = true; deduped.push(item); }
    });

    // Fall back to safety default if nothing matched
    if (deduped.length === 0) {
      SAFETY_DEFAULT.forEach(function (item) { deduped.push(item); });
    }

    // Group by category, preserving canonical category order
    const groups = {};
    CATEGORY_ORDER.forEach(function (cat) { groups[cat] = []; });
    deduped.forEach(function (item) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item.text);
    });

    const categories = [];
    CATEGORY_ORDER.forEach(function (cat) {
      if (groups[cat] && groups[cat].length > 0) {
        categories.push({
          name: cat,
          items: groups[cat].map(function (text) { return { text: text, checked: false }; }),
        });
      }
    });
    // Any categories not in canonical order (shouldn't happen, but safe)
    Object.keys(groups).forEach(function (cat) {
      if (CATEGORY_ORDER.indexOf(cat) !== -1) return;
      if (groups[cat].length === 0) return;
      categories.push({
        name: cat,
        items: groups[cat].map(function (text) { return { text: text, checked: false }; }),
      });
    });

    return {
      name: generateListName(answers),
      emoji: pickEmoji(answers),
      description: describeAnswers(answers),
      categories: categories,
    };
  }

  // --- Naming --------------------------------------------------------

  // Quirky character picks — Sesame Street + kids' show / book characters
  const CHARACTERS = [
    "Elmo", "Bert", "Ernie", "Big Bird", "Grover", "Cookie Monster",
    "Abby", "Zoe", "Rosita", "Telly", "Oscar",
    "Peppa", "Bluey", "Bingo", "Bandit",
    "Curious George", "Paddington", "Clifford",
    "Winnie the Pooh", "Piglet", "Tigger", "Eeyore",
    "Daniel Tiger", "Dora", "Stitch",
  ];

  const DESCRIPTORS_BY_LENGTH = {
    "few-hours": ["quick trip", "errand", "mini mission", "little outing"],
    "one-night": ["overnighter", "sleepover", "quick getaway"],
    "two-three-nights": ["weekend away", "long weekend", "mini vacation"],
    "extended": ["big adventure", "grand expedition", "epic journey"],
  };

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function generateListName(answers) {
    const character = pickRandom(CHARACTERS);
    const descriptors = DESCRIPTORS_BY_LENGTH[answers.length] || ["packing list"];
    const descriptor = pickRandom(descriptors);
    return character + "'s " + descriptor;
  }

  function pickEmoji(answers) {
    if (answers.transport === "flying") return "✈️";
    if (answers.length === "extended") return "🏡";
    if (answers.sleepsAt === "other-house" && answers.length !== "day-trip") return "🏡";
    if (answers.length === "two-three-nights") return "🎒";
    if (answers.length === "one-night") return "🌙";
    if (answers.transport === "long-drive") return "🚗";
    return "🎒";
  }

  function describeAnswers(answers) {
    const parts = [];
    if (answers.length === "few-hours") parts.push("Quick trip");
    else if (answers.length === "one-night") parts.push("1 night");
    else if (answers.length === "two-three-nights") parts.push("2-3 nights");
    else parts.push("Extended stay");

    if (answers.transport === "flying") parts.push("by plane");
    else if (answers.transport === "long-drive") parts.push("long drive");

    return parts.join(" · ");
  }

  // --- Export --------------------------------------------------------

  window.WIZARD = {
    STEPS: STEPS,
    generateListSpec: generateListSpec,
  };
})();
