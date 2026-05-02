const CACHE_NAME = "d9-admin-dev-v6";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/logo_d9.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
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
  if (url.hostname.includes("script.google") || url.hostname.includes("googleusercontent")) {
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
