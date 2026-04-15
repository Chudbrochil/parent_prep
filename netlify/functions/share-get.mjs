// GET /api/share-get?slug=sunny-elmo-park
//
// Returns: { list: { ... } } if found, or an error response.
// Lazy-deletes expired entries so storage cleans itself.

import { getStore } from "@netlify/blobs";

const SLUG_PATTERN = /^[a-z]+-[a-z]+-[a-z]+$/;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req, context) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  if (!slug || !SLUG_PATTERN.test(slug)) {
    return jsonResponse({ error: "Invalid slug" }, 400);
  }

  let store;
  try {
    store = getStore({ name: "shared-lists" });
  } catch (e) {
    return jsonResponse({ error: "Storage unavailable" }, 503);
  }

  let data;
  try {
    data = await store.get(slug, { type: "json" });
  } catch (e) {
    return jsonResponse({ error: "Failed to read shared list" }, 500);
  }

  if (!data) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  if (data.expiresAt && Date.now() > data.expiresAt) {
    // Lazy delete — the store cleans itself on read of expired entries
    try { await store.delete(slug); } catch (_) { /* ignore */ }
    return jsonResponse({ error: "This shared list has expired" }, 410);
  }

  return jsonResponse({ list: data.list }, 200);
};
