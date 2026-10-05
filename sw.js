const CACHE_NAME = "travel-planner-v45";
const HEADER_IMAGE_CACHE = "tp-location-header-images-v2";

const PRESET_HEADER_IMAGES = [
  "https://images.unsplash.com/photo-1548919973-5cef591cdbc9?auto=format&fit=crop&fm=jpg&q=72&w=1600",
  "https://images.unsplash.com/photo-1591194233688-dca69d406068?auto=format&fit=crop&fm=jpg&q=72&w=1600",
  "https://images.unsplash.com/photo-1786384454355-76a110b43271?auto=format&fit=crop&fm=jpg&q=72&w=1600",
  "https://images.unsplash.com/photo-1778526393713-c002b75827f0?auto=format&fit=crop&fm=jpg&q=72&w=1600",
  "https://images.unsplash.com/photo-1786111560399-349f513c96b9?auto=format&fit=crop&fm=jpg&q=72&w=1600"
];

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=45",
  "./app.js?v=45",
  "./family-sync.js?v=45",
  "./trip-map.js?v=45",
  "./manifest.webmanifest?v=45",
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

      const imageCache = await caches.open(HEADER_IMAGE_CACHE);
      await Promise.all(
        PRESET_HEADER_IMAGES.map(async (url) => {
          try {
            const request = new Request(url, { mode: "no-cors" });
            const response = await fetch(request);
            if (response) await imageCache.put(request, response.clone());
          } catch {}
        })
      );

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
          .filter((key) =>
            (key.startsWith("travel-planner-") && key !== CACHE_NAME) ||
            (key.startsWith("tp-location-header-images-") && key !== HEADER_IMAGE_CACHE)
          )
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
    if (response && response.ok) await cache.put(request, response.clone());
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
  if (response && response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  const isPresetHeaderImage =
    event.request.destination === "image" &&
    url.hostname === "images.unsplash.com";

  if (isPresetHeaderImage) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(HEADER_IMAGE_CACHE);
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const response = await fetch(event.request);
          if (response) {
            try { await cache.put(event.request, response.clone()); } catch {}
          }
          return response;
        } catch {
          return new Response("", { status: 504, statusText: "Preset header image unavailable offline" });
        }
      })()
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

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

  const isCore =
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/family-sync.js") ||
    url.pathname.endsWith("/trip-map.js") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/manifest.webmanifest");

  event.respondWith(isCore ? networkFirst(event.request) : cacheFirst(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
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
