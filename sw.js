const CACHE_NAME = "travel-planner-v34";

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

// v34 is deliberately applied as a map-only patch over the known-good v32
// map implementation. This preserves the working category icons, saved flight
// endpoint model and curved flight paths while adding satellite-first rendering,
// safe pin rechecking and point-and-tap manual pin placement.
const MAP_V34_PATCH = `

;(() => {
  let labelsVisible = localStorage.getItem("travelPlanner.map.labels.v1") !== "off";
  let placement = null;
  let placementDraft = null;
  let placementMarker = null;
  let mapClickBound = false;

  function injectV34Styles() {
    if (document.getElementById("travelPlannerMapV34Styles")) return;
    const style = document.createElement("style");
    style.id = "travelPlannerMapV34Styles";
    style.textContent = \`
      #mapLabelsToggle, #mapFlightPathsToggle { white-space: nowrap; }
      #tripMapCanvas.pin-placement-active { cursor: crosshair; }
      .map-v34-placement-banner {
        position:absolute;z-index:8;top:12px;left:12px;right:66px;
        display:flex;align-items:center;justify-content:space-between;gap:12px;
        padding:11px 12px;border:2px solid rgba(147,197,253,.9);border-radius:14px;
        background:rgba(7,17,31,.93);color:#f8fafc;box-shadow:0 6px 24px rgba(0,0,0,.3);
        backdrop-filter:blur(10px)
      }
      .map-v34-placement-banner.hidden { display:none !important; }
      .map-v34-placement-copy{min-width:0}.map-v34-placement-copy strong,.map-v34-placement-copy span,.map-v34-placement-copy small{display:block}
      .map-v34-placement-copy strong{font-size:.8rem}.map-v34-placement-copy span{margin-top:2px;color:#cbd5e1;font-size:.68rem}
      .map-v34-placement-copy small{margin-top:4px;color:#93c5fd;font-size:.65rem;font-weight:760}
      .map-v34-placement-actions{flex:0 0 auto;display:flex;gap:7px}.map-v34-placement-actions button{min-height:34px;padding:7px 10px}
      .map-v34-preview{display:grid;place-items:center;width:42px;height:48px;font-size:2rem;filter:drop-shadow(0 4px 6px rgba(0,0,0,.45))}
      .map-missing-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
      .map-missing-copy{min-width:0}.map-v34-soft{background:transparent!important}
      .trip-map-popup-actions-v34{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .trip-map-popup-actions-v34 button{min-height:34px;padding:6px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#0f172a;font:inherit;font-size:.62rem;font-weight:800}
      #mapManualPinBtn{border-color:#2563eb}
      @media(max-width:620px){
        .map-v34-placement-banner{right:12px;top:10px;align-items:stretch;flex-direction:column}
        .map-v34-placement-actions{width:100%}.map-v34-placement-actions button{flex:1 1 0}
        .map-missing-row{align-items:stretch;flex-direction:column}.map-missing-actions{justify-content:stretch}.map-missing-actions button{flex:1 1 auto}
        .trip-map-popup-actions-v34{grid-template-columns:1fr}
      }
    \`;
    document.head.appendChild(style);
  }

  function applySatelliteFirst() {
    if (!map || !mapReady) return;
    const layers = map.getStyle()?.layers || [];
    for (const layer of layers) {
      if (!layer?.id || layer.id === "trip-satellite" || layer.id.startsWith("trip-flight-path")) continue;
      if (layer.type === "fill" || layer.type === "fill-extrusion" || layer.type === "background") {
        try { map.setLayoutProperty(layer.id, "visibility", "none"); } catch {}
      } else if (layer.type === "symbol") {
        try { map.setLayoutProperty(layer.id, "visibility", labelsVisible ? "visible" : "none"); } catch {}
      }
    }
    try {
      if (map.getLayer("trip-satellite")) {
        map.setPaintProperty("trip-satellite", "raster-opacity", 1);
        map.setPaintProperty("trip-satellite", "raster-saturation", 0);
        map.setPaintProperty("trip-satellite", "raster-contrast", 0.08);
      }
    } catch {}
  }

  const originalInstallSatelliteLayerV34 = installSatelliteLayer;
  installSatelliteLayer = function () {
    originalInstallSatelliteLayerV34();
    setTimeout(applySatelliteFirst, 0);
    setTimeout(applySatelliteFirst, 250);
    setTimeout(applySatelliteFirst, 900);
  };

  function ensureV34Ui() {
    injectV34Styles();

    const filters = document.getElementById("mapFilterRow");
    if (filters && !document.getElementById("mapLabelsToggle")) {
      const button = document.createElement("button");
      button.id = "mapLabelsToggle";
      button.type = "button";
      button.className = "map-filter active";
      filters.appendChild(button);
      button.addEventListener("click", () => {
        labelsVisible = !labelsVisible;
        localStorage.setItem("travelPlanner.map.labels.v1", labelsVisible ? "on" : "off");
        updateLabelsButton();
        applySatelliteFirst();
      });
    }
    updateLabelsButton();

    const actions = document.querySelector(".map-action-row");
    if (actions && !document.getElementById("mapManualPinBtn")) {
      const button = document.createElement("button");
      button.id = "mapManualPinBtn";
      button.type = "button";
      button.className = "secondary-btn";
      button.textContent = "📍 Place missing pin";
      actions.appendChild(button);
      button.addEventListener("click", () => {
        const missing = missingRecords();
        if (!missing.length) {
          setStatus("Every saved location already has a pin. Tap a pin and choose Move pin to adjust it.");
          return;
        }
        const panel = document.getElementById("mapMissingPanel");
        if (panel) {
          panel.open = true;
          panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        setStatus("Choose Place on map beside the location you want to position.");
      });
    }

    const shell = document.querySelector(".trip-map-shell");
    if (shell && !document.getElementById("mapV34PlacementBanner")) {
      const banner = document.createElement("div");
      banner.id = "mapV34PlacementBanner";
      banner.className = "map-v34-placement-banner hidden";
      banner.innerHTML = \`
        <div class="map-v34-placement-copy">
          <strong id="mapV34PlacementTitle">Place pin</strong>
          <span id="mapV34PlacementText">Tap the exact spot on the map.</span>
          <small id="mapV34PlacementCoords"></small>
        </div>
        <div class="map-v34-placement-actions">
          <button class="secondary-btn hidden" id="mapV34PlacementSaveBtn" type="button">Save pin</button>
          <button class="secondary-btn" id="mapV34PlacementCancelBtn" type="button">Cancel</button>
        </div>\`;
      shell.appendChild(banner);
      banner.querySelector("#mapV34PlacementSaveBtn")?.addEventListener("click", savePlacement);
      banner.querySelector("#mapV34PlacementCancelBtn")?.addEventListener("click", cancelPlacement);
    }

    replaceRecheckButton();
    bindMapClickWhenReady();
  }

  function updateLabelsButton() {
    const button = document.getElementById("mapLabelsToggle");
    if (!button) return;
    button.classList.toggle("active", labelsVisible);
    button.setAttribute("aria-pressed", String(labelsVisible));
    button.textContent = labelsVisible ? "🗺 Labels on" : "🗺 Labels off";
  }

  function currentRecord(kind, id) {
    return records().find((record) => record.kind === kind && record.id === id) || null;
  }

  function clearPreview() {
    if (placementMarker) placementMarker.remove();
    placementMarker = null;
  }

  function renderPreview() {
    clearPreview();
    if (!map || !maplibregl || !placementDraft) return;
    const element = document.createElement("div");
    element.className = "map-v34-preview";
    element.textContent = "📍";
    placementMarker = new maplibregl.Marker({ element, anchor: "bottom" })
      .setLngLat([placementDraft.longitude, placementDraft.latitude])
      .addTo(map);
  }

  function updatePlacementUi() {
    const banner = document.getElementById("mapV34PlacementBanner");
    const canvas = document.getElementById("tripMapCanvas");
    if (!banner || !canvas) return;
    if (!placement) {
      banner.classList.add("hidden");
      canvas.classList.remove("pin-placement-active");
      return;
    }

    const record = currentRecord(placement.kind, placement.id);
    if (!record) return cancelPlacement();
    banner.classList.remove("hidden");
    canvas.classList.add("pin-placement-active");
    document.getElementById("mapV34PlacementTitle").textContent = placement.move ? `Move pin: ${record.title}` : `Place pin: ${record.title}`;
    document.getElementById("mapV34PlacementText").textContent = placementDraft ? "Pin preview ready. Tap elsewhere to adjust it, or save." : "Tap the exact spot on the map.";
    document.getElementById("mapV34PlacementCoords").textContent = placementDraft ? `${placementDraft.latitude.toFixed(6)}, ${placementDraft.longitude.toFixed(6)}` : "";
    document.getElementById("mapV34PlacementSaveBtn")?.classList.toggle("hidden", !placementDraft);
  }

  function beginPlacement(kind, id, move = false) {
    const record = currentRecord(kind, id);
    if (!record) return;
    placement = { kind, id, move };
    placementDraft = validCoords(record) ? { latitude: Number(record.latitude), longitude: Number(record.longitude) } : null;
    if (placementDraft && map) {
      map.flyTo({ center: [placementDraft.longitude, placementDraft.latitude], zoom: Math.max(map.getZoom(), 13), duration: 650 });
      renderPreview();
    } else {
      clearPreview();
    }
    updatePlacementUi();
    setStatus(`Tap the exact map position for ${record.title}.`);
    document.getElementById("tripMapCanvas")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelPlacement() {
    placement = null;
    placementDraft = null;
    clearPreview();
    updatePlacementUi();
    setStatus("");
  }

  function savePlacement() {
    if (!placement || !placementDraft) return;
    const record = currentRecord(placement.kind, placement.id);
    if (!record) return cancelPlacement();
    const ok = bridge.updateCoordinates?.(
      placement.kind,
      placement.id,
      placementDraft.latitude,
      placementDraft.longitude,
      `Placed manually on map (${placementDraft.latitude.toFixed(6)}, ${placementDraft.longitude.toFixed(6)})`
    );
    if (!ok) return setStatus("The pin could not be saved.");
    const title = record.title;
    cancelPlacement();
    refreshMarkers();
    setStatus(`Saved pin for ${title}.`);
  }

  function bindMapClickWhenReady() {
    if (mapClickBound) return;
    if (!map) return void setTimeout(bindMapClickWhenReady, 250);
    mapClickBound = true;
    map.on("click", (event) => {
      if (!placement) return;
      placementDraft = { latitude: Number(event.lngLat.lat), longitude: Number(event.lngLat.lng) };
      renderPreview();
      updatePlacementUi();
    });
  }

  const originalRenderMissingListV34 = renderMissingList;
  renderMissingList = function () {
    const root = document.getElementById("mapMissingList");
    if (!root) return originalRenderMissingListV34();
    const missing = missingRecords();
    root.innerHTML = missing.length
      ? missing.map((record) => `
          <div class="map-missing-row">
            <div class="map-missing-copy">
              <strong>${escapeHtml(record.title)}</strong>
              <span>${escapeHtml(record.location)}</span>
            </div>
            <div class="map-missing-actions">
              <button class="mini-btn map-v34-find" type="button" data-kind="${escapeHtml(record.kind)}" data-id="${escapeHtml(record.id)}">Find pin</button>
              <button class="mini-btn map-v34-soft map-v34-place" type="button" data-kind="${escapeHtml(record.kind)}" data-id="${escapeHtml(record.id)}">Place on map</button>
              <button class="mini-btn map-v34-soft map-v34-latlng" type="button" data-kind="${escapeHtml(record.kind)}" data-id="${escapeHtml(record.id)}">Lat / long</button>
            </div>
          </div>`).join("")
      : `<p class="expense-empty">Everything with a saved location is pinned.</p>`;

    root.querySelectorAll(".map-v34-find").forEach((button) => button.addEventListener("click", () => queueGeocode(button.dataset.kind, button.dataset.id, true)));
    root.querySelectorAll(".map-v34-place").forEach((button) => button.addEventListener("click", () => beginPlacement(button.dataset.kind, button.dataset.id, false)));
    root.querySelectorAll(".map-v34-latlng").forEach((button) => button.addEventListener("click", () => promptManualCoordinates(button.dataset.kind, button.dataset.id)));
  };

  const originalMarkerElementV34 = markerElement;
  markerElement = function (record) {
    const element = originalMarkerElementV34(record);
    let timer = null;
    let start = null;
    const clear = () => { if (timer) clearTimeout(timer); timer = null; start = null; };
    element.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      start = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        timer = null;
        beginPlacement(record.kind, record.id, true);
        try { navigator.vibrate?.(25); } catch {}
      }, 650);
    });
    element.addEventListener("pointermove", (event) => {
      if (!start) return;
      if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) clear();
    });
    element.addEventListener("pointerup", clear);
    element.addEventListener("pointercancel", clear);
    return element;
  };

  popupHtml = function (record) {
    const meta = [];
    const marker = markerMeta(record);
    if (record.date) meta.push(record.date);
    if (record.time) meta.push(record.time);
    if (record.category) meta.push(record.category);
    if (record.status) meta.push(record.status);
    return `
      <div class="trip-map-popup">
        <span class="trip-map-popup-type">${escapeHtml(marker.icon + " " + marker.label)}</span>
        <strong>${escapeHtml(record.title || "Location")}</strong>
        ${meta.length ? `<small>${escapeHtml(meta.join(" • "))}</small>` : ""}
        <p>${escapeHtml(record.location || "")}</p>
        <div class="trip-map-popup-actions-v34">
          <button type="button" data-map-open="${escapeHtml(record.kind)}:${escapeHtml(record.id)}">${record.kind === "place" ? "Open place" : "Open itinerary"}</button>
          <button type="button" data-map-directions="${escapeHtml(record.kind)}:${escapeHtml(record.id)}">Directions</button>
          <button type="button" data-map-v34-move="${escapeHtml(record.kind)}:${escapeHtml(record.id)}">Move pin</button>
        </div>
      </div>`;
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-map-v34-move]");
    if (!button) return;
    const [kind, id] = String(button.dataset.mapV34Move || "").split(":");
    if (kind && id) beginPlacement(kind, id, true);
  });

  async function geocodeSafely(record) {
    const query = String(record.query || record.location || "").trim();
    if (!query) return false;
    const url = new URL(PHOTON_SEARCH);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "1");
    url.searchParams.set("lang", "en");
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) return false;
    const result = await response.json();
    const first = result?.features?.[0];
    const coords = first?.geometry?.coordinates || [];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!first || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    bridge.updateCoordinates?.(record.kind, record.id, lat, lng, photonLabel(first, query));
    return true;
  }

  async function safeRecheckAllPins() {
    if (geocoding) return;
    const all = records().filter((record) => String(record.location || "").trim());
    if (!all.length) return setStatus("There are no map locations to recheck.");
    if (!window.confirm(`Recheck all ${all.length} map location${all.length === 1 ? "" : "s"}? Existing good pins stay in place if a lookup fails.`)) return;
    geocoding = true;
    renderStatusCounts();
    let updated = 0;
    for (let i = 0; i < all.length; i++) {
      const record = all[i];
      setStatus(`Rechecking ${i + 1} of ${all.length}: ${record.title}…`);
      try { if (await geocodeSafely(record)) updated += 1; } catch (error) { console.warn("Safe map recheck failed:", error); }
      refreshMarkers();
      if (i < all.length - 1) await sleep(850);
    }
    geocoding = false;
    renderStatusCounts();
    refreshMarkers();
    setStatus(`Rechecked the trip and updated ${updated} location${updated === 1 ? "" : "s"}. Failed lookups kept their previous pins.`);
  }

  function replaceRecheckButton() {
    const old = document.getElementById("mapRebuildPinsBtn");
    if (!old || old.dataset.v34Safe === "true") return;
    const button = old.cloneNode(true);
    button.dataset.v34Safe = "true";
    button.textContent = "Recheck all pins";
    old.replaceWith(button);
    button.addEventListener("click", safeRecheckAllPins);
  }

  const boot = () => {
    ensureV34Ui();
    renderMissingList();
    applySatelliteFirst();
    setTimeout(() => { ensureV34Ui(); renderMissingList(); applySatelliteFirst(); }, 500);
    setTimeout(() => { ensureV34Ui(); renderMissingList(); applySatelliteFirst(); }, 1500);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
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
    const patched = new Response(source + MAP_V34_PATCH, {
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

  event.respondWith(cacheFirst(event.request));
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
