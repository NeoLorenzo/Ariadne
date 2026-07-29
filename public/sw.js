const CACHE_NAME = "fabbro-factory-v3";
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const CORE_ASSETS = [
  `${SCOPE_PATH || ""}/`,
  `${SCOPE_PATH || ""}/manifest.webmanifest`
];
const CACHEABLE_DESTINATIONS = new Set([
  "document",
  "script",
  "style",
  "image",
  "font",
  "manifest"
]);

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function shouldBypassRequest(request) {
  if (request.method !== "GET") {
    return true;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url)) {
    return true;
  }

  if (url.pathname.endsWith("/sw.js")) {
    return true;
  }

  return false;
}

function shouldCacheResponse(request, response) {
  if (!response || !response.ok || response.type !== "basic") {
    return false;
  }

  const url = new URL(request.url);
  if (url.search) {
    return false;
  }

  if (request.mode === "navigate") {
    return true;
  }

  return CACHEABLE_DESTINATIONS.has(request.destination);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (shouldBypassRequest(event.request)) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (shouldCacheResponse(event.request, networkResponse)) {
            const responseToCache = networkResponse.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache))
              .catch(() => undefined);
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match(`${SCOPE_PATH || ""}/`)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (shouldCacheResponse(event.request, networkResponse)) {
            const responseToCache = networkResponse.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache))
              .catch(() => undefined);
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request));
    })
  );
});
