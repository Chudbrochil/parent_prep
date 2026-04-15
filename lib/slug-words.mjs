// Curated word lists for share slug generation.
//
// Used by:
//   - netlify/functions/share-create.mjs (to generate slugs)
//   - tests/slug.test.mjs (to validate the lists)
//
// 40 × 40 × 40 = 64,000 unique adjective-character-place combinations.
// Each word is single-word, lowercase ASCII, gentle and parent-friendly.

export const ADJECTIVES = [
  "sunny", "cozy", "happy", "sleepy", "dreamy", "gentle", "quiet", "bright",
  "cheerful", "snuggly", "silly", "merry", "kind", "calm", "peaceful", "fluffy",
  "tiny", "giggly", "snoozy", "warm", "breezy", "twinkly", "bubbly", "playful",
  "mellow", "fuzzy", "drowsy", "lovely", "jolly", "brave", "curious", "cuddly",
  "bouncy", "starry", "rosy", "minty", "honey", "tasty", "sparkly", "joyful",
];

export const CHARACTERS = [
  "elmo", "bert", "ernie", "grover", "abby", "zoe", "rosita", "oscar",
  "telly", "cookie", "snuffy", "peppa", "bluey", "bingo", "bandit",
  "paddington", "pooh", "piglet", "tigger", "eeyore", "clifford", "stitch",
  "bunny", "bear", "duck", "kitten", "puppy", "fox", "owl", "mouse",
  "panda", "otter", "hedgehog", "turtle", "fawn", "cub", "koala", "lamb",
  "chick", "cricket",
];

export const PLACES = [
  "park", "meadow", "garden", "river", "brook", "pond", "creek", "cottage",
  "cabin", "porch", "forest", "grove", "orchard", "pasture", "hill", "valley",
  "beach", "bay", "lake", "island", "field", "hollow", "prairie", "canyon",
  "mountain", "trail", "bridge", "lighthouse", "farmhouse", "treehouse", "barn",
  "glen", "spring", "haven", "shore", "harbor", "nest", "dale", "marsh", "dell",
];

export const SLUG_PATTERN = /^[a-z]+-[a-z]+-[a-z]+$/;

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateSlug() {
  return pickRandom(ADJECTIVES) + "-" + pickRandom(CHARACTERS) + "-" + pickRandom(PLACES);
}
