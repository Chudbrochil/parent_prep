// Shared list-shape validator and sanitizer.
//
// Used by:
//   - netlify/functions/share-create.mjs (validate incoming shared lists)
//   - tests/sanitize.test.mjs
//
// The goal is to refuse anything malformed and clamp anything oversized
// so a malicious client can't pollute the Blobs store with arbitrary data.

export const MAX_LIST_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 120;
export const MAX_CATEGORY_NAME_LENGTH = 60;
export const MAX_ITEM_TEXT_LENGTH = 200;
export const MAX_CATEGORIES = 20;
export const MAX_ITEMS_PER_CATEGORY = 500;
export const MAX_EMOJI_LENGTH = 8;

export function clampString(str, maxLen) {
  if (typeof str !== "string") return "";
  const trimmed = str.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/**
 * Validate and sanitize a list.
 *
 * Returns the cleaned list object on success, or null if the input is
 * unrecoverable (e.g. missing required fields, all categories invalid,
 * not an object). Callers should treat null as a 4xx error.
 *
 * The shape of a clean list:
 *   {
 *     name: string,
 *     emoji: string,
 *     description: string,
 *     categories: [{ name: string, items: [{ text: string, checked: bool }] }]
 *   }
 */
export function sanitizeList(rawList) {
  if (!rawList || typeof rawList !== "object") return null;
  if (!Array.isArray(rawList.categories)) return null;
  if (rawList.categories.length > MAX_CATEGORIES) return null;

  const cleaned = {
    name: clampString(rawList.name, MAX_LIST_NAME_LENGTH) || "Shared list",
    emoji: typeof rawList.emoji === "string"
      ? rawList.emoji.slice(0, MAX_EMOJI_LENGTH)
      : "📋",
    description: clampString(rawList.description, MAX_DESCRIPTION_LENGTH) || "Shared list",
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

    // Drop categories that ended up empty — sharing an empty category
    // is useless to the recipient and produces a confusing UI.
    if (cleanItems.length === 0) continue;

    cleaned.categories.push({
      name: clampString(cat.name, MAX_CATEGORY_NAME_LENGTH) || "Items",
      items: cleanItems,
    });
  }

  if (cleaned.categories.length === 0) return null;
  return cleaned;
}
