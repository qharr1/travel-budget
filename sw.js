const CACHE_NAME = "travel-planner-v15";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=15",
  "./app.js?v=15",
  "./manifest.webmanifest?v=15",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./robots.txt"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("travel-planner-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function cachedIndex() {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match("./index.html")) ||
    (await cache.match("./")) ||
    null
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("Network unavailable and resource is not cached.");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // App navigation: prefer fresh HTML while online; always fall back to the
  // matching v10 cached shell when offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("./index.html", response.clone());
          }
          return response;
        } catch {
          const fallback = await cachedIndex();
          if (fallback) return fallback;
          return new Response(
            "<!doctype html><meta name='viewport' content='width=device-width'><title>Travel Planner</title><h1>Travel Planner</h1><p>The offline app shell has not finished installing yet. Reconnect once, open Travel Planner, then try offline again.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
      })()
    );
    return;
  }

  const isCoreAsset =
    requestUrl.pathname.endsWith("/app.js") ||
    requestUrl.pathname.endsWith("/styles.css") ||
    requestUrl.pathname.endsWith("/manifest.webmanifest");

  // Core assets are versioned in the HTML and pre-cached during install.
  // Cache-first guarantees the matching v10 JS/CSS is available offline.
  if (isCoreAsset) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Icons / other same-origin static assets.
  event.respondWith(cacheFirst(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});
