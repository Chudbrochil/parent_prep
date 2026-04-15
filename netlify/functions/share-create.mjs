// POST /api/share-create
//
// Body: { list: { name, emoji, description, categories: [...] } }
// Returns: { slug: "sunny-elmo-park", expiresAt: <ms epoch> }
//
// Generates a friendly three-word slug (adjective-character-place),
// stores the list in Netlify Blobs, and returns the slug to the client.
// Slugs expire after 90 days to bound storage.

import { getStore } from "@netlify/blobs";

// --- Word lists for slug generation ---------------------------------
//
// 40 × 40 × 40 = 64,000 unique combinations. At 1000 shares per month
// the collision probability per generation is roughly 0.01%. We retry
// on collision so users never see one in practice.

const ADJECTIVES = [
  "sunny", "cozy", "happy", "sleepy", "dreamy", "gentle", "quiet", "bright",
  "cheerful", "snuggly", "silly", "merry", "kind", "calm", "peaceful", "fluffy",
  "tiny", "giggly", "snoozy", "warm", "breezy", "twinkly", "bubbly", "playful",
  "mellow", "fuzzy", "drowsy", "lovely", "jolly", "brave", "curious", "cuddly",
  "bouncy", "starry", "rosy", "minty", "honey", "tasty", "sparkly", "joyful",
];

const CHARACTERS = [
  "elmo", "bert", "ernie", "grover", "abby", "zoe", "rosita", "oscar",
  "telly", "cookie", "snuffy", "peppa", "bluey", "bingo", "bandit",
  "paddington", "pooh", "piglet", "tigger", "eeyore", "clifford", "stitch",
  "bunny", "bear", "duck", "kitten", "puppy", "fox", "owl", "mouse",
  "panda", "otter", "hedgehog", "turtle", "fawn", "cub", "koala", "lamb",
  "chick", "cricket",
];

const PLACES = [
  "park", "meadow", "garden", "river", "brook", "pond", "creek", "cottage",
  "cabin", "porch", "forest", "grove", "orchard", "pasture", "hill", "valley",
  "beach", "bay", "lake", "island", "field", "hollow", "prairie", "canyon",
  "mountain", "trail", "bridge", "lighthouse", "farmhouse", "treehouse", "barn",
  "glen", "spring", "haven", "shore", "harbor", "nest", "dale", "marsh", "dell",
];

// --- Constants ------------------------------------------------------

const MAX_BODY_SIZE = 100 * 1024;          // 100 KB hard cap on submitted lists
const MAX_LIST_NAME_LENGTH = 60;
const MAX_ITEM_TEXT_LENGTH = 200;
const MAX_CATEGORIES = 20;
const MAX_ITEMS_PER_CATEGORY = 500;
const SLUG_RETRY_LIMIT = 8;
const EXPIRY_DAYS = 90;

// --- Helpers --------------------------------------------------------

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateSlug() {
  return pickRandom(ADJECTIVES) + "-" + pickRandom(CHARACTERS) + "-" + pickRandom(PLACES);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
}

function clampString(str, maxLen) {
  if (typeof str !== "string") return "";
  const trimmed = str.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function sanitizeList(rawList) {
  // Validate and sanitize the incoming list to ensure it conforms to
  // our shape. Refuse anything malformed so a malicious client can't
  // pollute the store with arbitrary data.
  if (!rawList || typeof rawList !== "object") return null;
  if (!Array.isArray(rawList.categories)) return null;
  if (rawList.categories.length > MAX_CATEGORIES) return null;

  const cleaned = {
    name: clampString(rawList.name, MAX_LIST_NAME_LENGTH) || "Shared list",
    emoji: typeof rawList.emoji === "string" ? rawList.emoji.slice(0, 8) : "📋",
    description: clampString(rawList.description, 120) || "Shared list",
    categories: [],
  };

  for (const cat of rawList.categories) {
    if (!cat || typeof cat !== "object") continue;
    if (!Array.isArray(cat.items)) continue;
    if (cat.items.length > MAX_ITEMS_PER_CATEGORY) continue;

    const cleanItems = [];
    for (const item of cat.items) {
      if (!item || typeof item !== "object") continue;
      const text = clampString(item.text, MAX_ITEM_TEXT_LENGTH);
      if (!text) continue;
      cleanItems.push({ text: text, checked: !!item.checked });
    }

    cleaned.categories.push({
      name: clampString(cat.name, 60) || "Items",
      items: cleanItems,
    });
  }

  if (cleaned.categories.length === 0) return null;
  return cleaned;
}

// --- Handler --------------------------------------------------------

export default async (req, context) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let bodyText;
  try {
    bodyText = await req.text();
  } catch (e) {
    return jsonResponse({ error: "Unable to read request body" }, 400);
  }

  if (bodyText.length > MAX_BODY_SIZE) {
    return jsonResponse({ error: "List too large" }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const cleanList = sanitizeList(payload && payload.list);
  if (!cleanList) {
    return jsonResponse({ error: "Invalid list shape" }, 400);
  }

  let store;
  try {
    store = getStore({ name: "shared-lists", consistency: "strong" });
  } catch (e) {
    return jsonResponse({ error: "Storage unavailable" }, 503);
  }

  // Try to generate a unique slug, retry on collision
  let slug = null;
  for (let i = 0; i < SLUG_RETRY_LIMIT; i++) {
    const candidate = generateSlug();
    try {
      const existing = await store.get(candidate);
      if (!existing) {
        slug = candidate;
        break;
      }
    } catch (e) {
      // If the read itself fails, try a different slug
      continue;
    }
  }

  if (!slug) {
    return jsonResponse({ error: "Could not generate unique slug — try again" }, 503);
  }

  const expiresAt = Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  try {
    await store.setJSON(slug, {
      list: cleanList,
      createdAt: Date.now(),
      expiresAt: expiresAt,
    });
  } catch (e) {
    return jsonResponse({ error: "Failed to save shared list" }, 500);
  }

  return jsonResponse({ slug: slug, expiresAt: expiresAt }, 200);
};
