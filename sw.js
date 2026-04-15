// Packing for Parents — service worker, minimal offline cache.
const CACHE = "parentprep-v20";
const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./templates.js",
  "./wizard.js",
  "./sw-register.js",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Don't cache API calls or share-import URLs — these need fresh
  // responses from Netlify Functions every time.
  let url;
  try { url = new URL(event.request.url); } catch (e) { return; }
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/s/")) return;
  if (url.pathname.startsWith("/.netlify/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
            return res;
          })
          .catch(() => cached)
      );
    })
  );
});
