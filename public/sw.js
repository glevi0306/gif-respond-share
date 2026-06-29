const CACHE = "sec-shell-v1";

// Static assets are content-hashed by Vite — cache them forever.
// Everything else (navigation, API, Supabase) goes to the network.
const ASSET_RE = /\/assets\//;
const SKIP_RE = /supabase\.co|\.netlify\//;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Always skip cross-origin requests to Supabase and Netlify functions.
  if (SKIP_RE.test(url.href)) return;
  // Only handle GET.
  if (request.method !== "GET") return;

  if (ASSET_RE.test(url.pathname)) {
    // Cache-first: Vite hashes guarantee freshness.
    e.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((res) => {
              cache.put(request, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
  // Navigation and everything else: network-only (SSR handles it).
});
