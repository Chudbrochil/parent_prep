// POST /api/share-create
//
// Body: { list: { name, emoji, description, categories: [...] } }
// Returns: { slug: "sunny-elmo-park", expiresAt: <ms epoch> }
//
// Generates a friendly three-word slug (adjective-character-place),
// stores the list in Netlify Blobs, and returns the slug to the client.
// Slugs expire after 90 days to bound storage.

import { getStore } from "@netlify/blobs";
import { sanitizeList } from "../../lib/sanitize.mjs";
import { generateSlug } from "../../lib/slug-words.mjs";

// --- Constants ------------------------------------------------------

const MAX_BODY_SIZE = 100 * 1024;          // 100 KB hard cap on submitted lists
const SLUG_RETRY_LIMIT = 8;
const EXPIRY_DAYS = 90;

// --- Helpers --------------------------------------------------------

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
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
