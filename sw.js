const CACHE_NAME = "travel-planner-v33";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=32",
  "./app.js?v=32",
  "./family-sync.js?v=32",
  "./trip-map.js?v=32",
  "./manifest.webmanifest?v=32",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./robots.txt"
];

const SATELLITE_FIRST_PATCH = `

;(() => {
  const originalInstallSatelliteLayer = installSatelliteLayer;

  installSatelliteLayer = function () {
    originalInstallSatelliteLayer();

    const applySatelliteFirst = () => {
      if (!map || !mapReady) return;

      const style = map.getStyle();
      const layers = style?.layers || [];

      for (const layer of layers) {
        if (!layer?.id) continue;
        if (layer.id === "trip-satellite") continue;
        if (layer.id.startsWith("trip-flight-path")) continue;

        if (
          layer.type === "fill" ||
          layer.type === "fill-extrusion" ||
          layer.type === "background"
        ) {
          try {
            map.setLayoutProperty(layer.id, "visibility", "none");
          } catch {}
        }
      }

      try {
        if (map.getLayer("trip-satellite")) {
          map.setPaintProperty("trip-satellite", "raster-opacity", 1);
          map.setPaintProperty("trip-satellite", "raster-saturation", 0);
          map.setPaintProperty("trip-satellite", "raster-contrast", 0.08);
        }
      } catch {}

      setStatus("Satellite map loaded.");
    };

    setTimeout(applySatelliteFirst, 0);
    setTimeout(applySatelliteFirst, 250);
    setTimeout(applySatelliteFirst, 900);
  };
})();
`;

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

async function patchedTripMap(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (!response || !response.ok) throw new Error("trip-map.js unavailable");

    const source = await response.text();
    const patched = new Response(source + SATELLITE_FIRST_PATCH, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-cache"
      }
    });

    await cache.put(request, patched.clone());
    return patched;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("Travel Planner map script is unavailable.");
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

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

  if (requestUrl.pathname.endsWith("/trip-map.js")) {
    event.respondWith(patchedTripMap(event.request));
    return;
  }

  const isCoreAsset =
    requestUrl.pathname.endsWith("/app.js") ||
    requestUrl.pathname.endsWith("/family-sync.js") ||
    requestUrl.pathname.endsWith("/styles.css") ||
    requestUrl.pathname.endsWith("/manifest.webmanifest");

  if (isCoreAsset) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

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
