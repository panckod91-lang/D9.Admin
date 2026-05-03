const CACHE_NAME = "d9-admin-v160-clientes-nuevo";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.hostname.includes("script.google") || url.hostname.includes("googleusercontent")) return;

  event.respondWith(
    fetch(req, { cache: "no-store" })
      .catch(() => caches.match(req))
  );
});
