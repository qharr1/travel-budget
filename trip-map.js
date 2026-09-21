const MAPLIBRE_VERSION = "5.24.0";
const MAPLIBRE_IMPORTS = [
  `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`,
  `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`
];
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

const OPENFREEMAP_STYLE = "https://demotiles.maplibre.org/globe.json";
const FALLBACK_STYLE = "https://demotiles.maplibre.org/style.json";
const SATELLITE_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
const TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

let bridge = null;
let maplibregl = null;
let map = null;
let mapReady = false;
let activeFilter = "all";
let markerEntries = [];
let geocoding = false;
let queued = [];
let hasAutoLocated = false;
let activatedOnce = false;
let mapLoadPromise = null;
let fallbackAttempted = false;
let styleReady = false;
let enhancementApplied = false;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validCoords(record) {
  return Number.isFinite(Number(record?.latitude)) &&
    Number.isFinite(Number(record?.longitude)) &&
    Math.abs(Number(record.latitude)) <= 90 &&
    Math.abs(Number(record.longitude)) <= 180;
}

function records() {
  return bridge?.getRecords?.() || [];
}

function mappedRecords() {
  return records().filter(validCoords);
}

function missingRecords() {
  return records().filter((r) => !validCoords(r));
}

function filteredRecords() {
  return mappedRecords().filter((record) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "hotel") return Boolean(record.isHotel);
    if (activeFilter === "itinerary") return record.kind === "itinerary";
    if (activeFilter === "places") return record.kind === "place";
    return true;
  });
}

function addMapLibreCss() {
  if (document.querySelector('link[data-trip-map-maplibre]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS;
  link.dataset.tripMapMaplibre = "true";
  document.head.appendChild(link);
}

async function waitForBridge() {
  for (let i = 0; i < 120; i++) {
    if (window.TravelPlannerMapBridge) {
      bridge = window.TravelPlannerMapBridge;
      return bridge;
    }
    await sleep(50);
  }
  throw new Error("Travel Planner did not finish loading.");
}

function setStatus(text) {
  if ($("mapStatus")) $("mapStatus").textContent = text || "";
}

function setOfflineVisible(show, title = "Map imagery needs internet", text = "Your saved itinerary and pin coordinates are still stored locally.") {
  if ($("tripMapOverlayTitle")) $("tripMapOverlayTitle").textContent = title;
  if ($("tripMapOverlayText")) $("tripMapOverlayText").textContent = text;
  $("tripMapOffline")?.classList.toggle("hidden", !show);
}

function setSourceState(id, label, state) {
  const node = $(id);
  if (!node) return;
  node.textContent = `${label}: ${state}`;
  node.dataset.state = state;
}

function loadClassicMapLibreScript(url) {
  return new Promise((resolve, reject) => {
    if (window.maplibregl?.Map) {
      resolve(window.maplibregl);
      return;
    }

    const existing = [...document.scripts].find((script) => script.src === url);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.maplibregl), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${url}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (window.maplibregl?.Map) resolve(window.maplibregl);
      else reject(new Error("MapLibre loaded but did not expose window.maplibregl."));
    };
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(script);
  });
}

async function loadMapLibre() {
  if (maplibregl) return maplibregl;
  if (!navigator.onLine) throw new Error("Map imagery needs an internet connection.");

  addMapLibreCss();
  let lastError = null;

  for (let i = 0; i < MAPLIBRE_IMPORTS.length; i++) {
    try {
      setSourceState("mapEngineState", "Engine", i ? "backup" : "loading");
      maplibregl = await loadClassicMapLibreScript(MAPLIBRE_IMPORTS[i]);

      if (!maplibregl?.Map) {
        throw new Error("MapLibre Map constructor was not found.");
      }

      if (typeof maplibregl.supported === "function" && !maplibregl.supported()) {
        throw new Error("WebGL is disabled or unavailable in this browser.");
      }

      setSourceState("mapEngineState", "Engine", "ready");
      return maplibregl;
    } catch (error) {
      lastError = error;
      console.warn("MapLibre source failed", MAPLIBRE_IMPORTS[i], error);
    }
  }

  setSourceState("mapEngineState", "Engine", "failed");
  throw lastError || new Error("Map engine could not load.");
}

async function enhanceSatelliteAndTerrain() {
  if (!map || !styleReady || enhancementApplied) return;
  enhancementApplied = true;

  try {
    if (!map.getSource("trip-satellite-source")) {
      map.addSource("trip-satellite-source", {
        type: "raster",
        tiles: [SATELLITE_TILES],
        tileSize: 256,
        attribution: "Sentinel-2 cloudless 2020 © EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)"
      });
    }
    if (!map.getLayer("trip-satellite-layer")) {
      const before = map.getStyle().layers?.find((layer) => layer.type === "line" || layer.type === "symbol")?.id;
      map.addLayer({
        id: "trip-satellite-layer",
        type: "raster",
        source: "trip-satellite-source",
        paint: { "raster-opacity": 0.93, "raster-saturation": -0.05, "raster-contrast": 0.04 }
      }, before);
    }
    setSourceState("mapSatelliteState", "Satellite", "ready");
  } catch (error) {
    console.warn("Satellite layer unavailable", error);
    setSourceState("mapSatelliteState", "Satellite", "fallback");
  }

  try {
    if (!map.getSource("trip-terrain-source")) {
      map.addSource("trip-terrain-source", { type: "raster-dem", url: TERRAIN_TILEJSON });
    }
    map.setTerrain({ source: "trip-terrain-source", exaggeration: 1 });
    setSourceState("mapTerrainState", "Terrain", "ready");
  } catch (error) {
    console.warn("Terrain unavailable", error);
    setSourceState("mapTerrainState", "Terrain", "fallback");
  }
}

function switchToFallbackStyle(reason = "") {
  if (!map || fallbackAttempted) return;
  fallbackAttempted = true;
  styleReady = false;
  enhancementApplied = false;
  setStatus("Primary map source did not load. Switching to fallback globe…");
  setSourceState("mapBaseState", "Base", "fallback");
  console.warn("Switching to fallback map style", reason);
  try {
    map.setStyle(FALLBACK_STYLE);
  } catch (error) {
    setOfflineVisible(true, "Map could not render", error?.message || "Both map styles failed.");
  }
}

async function ensureMap() {
  if (map && mapReady) {
    setOfflineVisible(false);
    map.resize();
    return map;
  }
  if (mapLoadPromise) return mapLoadPromise;

  mapLoadPromise = (async () => {
    try {
      setStatus("Starting globe…");
      setOfflineVisible(false);
      const lib = await loadMapLibre();

      map = new lib.Map({
        container: "tripMapCanvas",
        style: OPENFREEMAP_STYLE,
        center: [125, 30],
        zoom: 2.6,
        pitch: 35,
        bearing: 0,
        maxPitch: 85,
        canvasContextAttributes: { antialias: true }
      });

      map.addControl(new lib.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), "top-right");
      if (lib.GlobeControl) map.addControl(new lib.GlobeControl(), "top-right");

      map.on("style.load", () => {
        styleReady = true;
        mapReady = true;
        enhancementApplied = false;
        setSourceState("mapBaseState", "Base", fallbackAttempted ? "fallback" : "ready");
        try { map.setProjection({ type: "globe" }); } catch (error) { console.warn("Globe projection unavailable", error); }
        setOfflineVisible(false);
        setStatus("Globe loaded.");
        refreshMarkers();
        requestAnimationFrame(() => map?.resize());
        setTimeout(() => map?.resize(), 150);
        setTimeout(() => map?.resize(), 500);
        fitTrip(false);
        enhanceSatelliteAndTerrain();
      });

      map.on("error", (event) => {
        const message = event?.error?.message || "Unknown map error";
        console.warn("Travel Planner map error", message);
        if (!styleReady && !fallbackAttempted) {
          setTimeout(() => { if (!styleReady) switchToFallbackStyle(message); }, 1200);
        }
      });

      setTimeout(() => {
        if (!styleReady) switchToFallbackStyle("Primary style load timeout");
      }, 8000);

      return map;
    } catch (error) {
      mapLoadPromise = null;
      setSourceState("mapBaseState", "Base", "failed");
      setOfflineVisible(true, "Map engine could not load", `${error?.message || "Unknown error"}. Your saved trip data is unaffected.`);
      setStatus(`Map error: ${error?.message || "could not load"}`);
      throw error;
    }
  })();

  return mapLoadPromise;
}

function markerElement(record) {
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.className = `trip-map-marker-wrap ${record.isWishlist ? "wishlist-marker" : ""}`;
  wrapper.setAttribute("aria-label", record.title || "Trip location");

  const visual = document.createElement("span");
  if (record.isHotel) {
    visual.className = "trip-map-marker hotel-marker";
    visual.textContent = "🏨";
  } else {
    visual.className = "trip-map-marker pin-marker";
    visual.innerHTML = '<span class="trip-map-pin-dot"></span>';
  }
  wrapper.appendChild(visual);
  return wrapper;
}

function popupHtml(record) {
  const meta = [];
  if (record.date) meta.push(record.date);
  if (record.time) meta.push(record.time);
  if (record.category) meta.push(record.category);
  if (record.status) meta.push(record.status);

  return `
    <div class="trip-map-popup">
      <span class="trip-map-popup-type">${record.isHotel ? "🏨 Accommodation" : escapeHtml(record.kind === "place" ? "Saved place" : record.type || "Itinerary")}</span>
      <strong>${escapeHtml(record.title || "Location")}</strong>
      ${meta.length ? `<small>${escapeHtml(meta.join(" • "))}</small>` : ""}
      <p>${escapeHtml(record.location || "")}</p>
      <div class="trip-map-popup-actions">
        <button type="button" data-map-open="${escapeHtml(record.kind)}:${escapeHtml(record.id)}">${record.kind === "place" ? "Open place" : "Open itinerary"}</button>
        <button type="button" data-map-directions="${escapeHtml(record.kind)}:${escapeHtml(record.id)}">Directions</button>
      </div>
    </div>
  `;
}

function clearMarkers() {
  markerEntries.forEach(({ marker }) => marker.remove());
  markerEntries = [];
}

function refreshMarkers() {
  renderStatusCounts();
  renderMissingList();
  if (!map || !mapReady || !maplibregl) return;

  clearMarkers();

  for (const record of filteredRecords()) {
    const element = markerElement(record);

    const popup = new maplibregl.Popup({
      offset: 28,
      closeButton: true,
      maxWidth: "300px"
    }).setHTML(popupHtml(record));

    const marker = new maplibregl.Marker({
      element,
      anchor: "bottom"
    })
      .setLngLat([Number(record.longitude), Number(record.latitude)])
      .setPopup(popup)
      .addTo(map);

    popup.on("open", () => {
      const popupNode = popup.getElement();
      popupNode?.querySelector("[data-map-open]")?.addEventListener("click", () => {
        popup.remove();
        bridge.openRecord?.(record.kind, record.id);
      });
      popupNode?.querySelector("[data-map-directions]")?.addEventListener("click", () => {
        bridge.directions?.(record.kind, record.id);
      });
    });

    markerEntries.push({ marker, record });
  }
}

function renderStatusCounts() {
  const all = records();
  const mapped = all.filter(validCoords).length;
  const missing = all.length - mapped;

  if ($("mapPinCount")) {
    $("mapPinCount").textContent = `${mapped} pin${mapped === 1 ? "" : "s"}`;
  }
  if ($("mapMissingSummary")) {
    $("mapMissingSummary").textContent = missing
      ? `${missing} location${missing === 1 ? "" : "s"} need a pin`
      : all.length
        ? "Every saved location has a pin"
        : "No locations in the trip yet";
  }

  const button = $("mapLocateMissingBtn");
  if (button) {
    button.disabled = geocoding || missing === 0;
    button.textContent = geocoding
      ? "Locating…"
      : missing
        ? `Locate ${missing} missing pin${missing === 1 ? "" : "s"}`
        : "All locations pinned";
  }
}

function renderMissingList() {
  const root = $("mapMissingList");
  if (!root) return;

  const missing = missingRecords();
  root.innerHTML = missing.length
    ? missing.map((record) => `
        <div class="map-missing-row">
          <div>
            <strong>${escapeHtml(record.title)}</strong>
            <span>${escapeHtml(record.location)}</span>
          </div>
          <button class="mini-btn map-find-one" type="button" data-kind="${escapeHtml(record.kind)}" data-id="${escapeHtml(record.id)}">Find pin</button>
        </div>
      `).join("")
    : `<p class="expense-empty">Everything with a saved location is pinned.</p>`;

  root.querySelectorAll(".map-find-one").forEach((button) => {
    button.addEventListener("click", () => {
      queueGeocode(button.dataset.kind, button.dataset.id, true);
    });
  });
}

function fitTrip(animate = true) {
  if (!map || !mapReady || !maplibregl) return;
  const items = filteredRecords();
  if (!items.length) return;

  if (items.length === 1) {
    map.flyTo({
      center: [Number(items[0].longitude), Number(items[0].latitude)],
      zoom: 12,
      pitch: 55,
      duration: animate ? 1200 : 0
    });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  items.forEach((record) => bounds.extend([Number(record.longitude), Number(record.latitude)]));
  map.fitBounds(bounds, {
    padding: 70,
    maxZoom: 11,
    pitch: 45,
    duration: animate ? 1300 : 0
  });
}

async function geocodeRecord(record) {
  if (!navigator.onLine) throw new Error("Internet is required to locate a new pin.");
  const query = String(record.query || record.location || "").trim();
  if (!query) throw new Error("No location text to search.");

  const url = new URL(NOMINATIM_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) throw new Error(`Location search failed (${response.status}).`);

  const results = await response.json();
  const first = Array.isArray(results) ? results[0] : null;
  if (!first) return false;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  bridge.updateCoordinates?.(
    record.kind,
    record.id,
    lat,
    lng,
    first.display_name || query
  );
  return true;
}

async function processQueue() {
  if (geocoding || !queued.length) return;
  geocoding = true;
  renderStatusCounts();

  let done = 0;
  let found = 0;
  const total = queued.length;

  while (queued.length) {
    const next = queued.shift();
    const record = records().find((r) => r.kind === next.kind && r.id === next.id);
    if (!record || validCoords(record)) continue;

    done += 1;
    setStatus(`Locating ${done} of ${total}: ${record.title}…`);

    try {
      if (await geocodeRecord(record)) found += 1;
    } catch (error) {
      if (!navigator.onLine) {
        setStatus("Offline — saved pins remain available when the map imagery is online.");
        break;
      }
    }

    refreshMarkers();

    // Public geocoding: deliberately keep requests slow and one-at-a-time.
    if (queued.length) await sleep(1150);
  }

  geocoding = false;
  renderStatusCounts();
  refreshMarkers();

  if (found > 0) {
    setStatus(`Located ${found} new pin${found === 1 ? "" : "s"}. Coordinates are now saved with the trip.`);
    fitTrip(true);
  } else if (!missingRecords().length) {
    setStatus("Every saved location has a pin.");
  } else if (navigator.onLine) {
    setStatus("Some locations could not be matched. Make the location/address more specific and try again.");
  }
}

function queueGeocode(kind, id, prioritize = false) {
  const record = records().find((r) => r.kind === kind && r.id === id);
  if (!record || validCoords(record) || !record.location) return;

  if (!queued.some((item) => item.kind === kind && item.id === id)) {
    if (prioritize) queued.unshift({ kind, id });
    else queued.push({ kind, id });
  }
  processQueue();
}

function locateAllMissing() {
  if (geocoding) return;
  const missing = missingRecords();
  queued = missing.map((r) => ({ kind: r.kind, id: r.id }));
  processQueue();
}

function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll("[data-map-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mapFilter === filter);
  });
  refreshMarkers();
  fitTrip(true);
}

async function activate() {
  activatedOnce = true;
  renderStatusCounts();
  renderMissingList();

  try {
    await ensureMap();
    setTimeout(() => map?.resize(), 50);
    setTimeout(() => map?.resize(), 300);
    refreshMarkers();

    if (!hasAutoLocated && navigator.onLine && missingRecords().length) {
      hasAutoLocated = true;
      locateAllMissing();
    }
  } catch (error) {
    console.error("Trip Map failed to activate", error);
    setOfflineVisible(true, "Map could not start", `${error?.message || "Unknown map error"}. Your saved trip data is unaffected.`);
  }
}

function dataChanged() {
  renderStatusCounts();
  renderMissingList();
  if (activatedOnce && mapReady) refreshMarkers();
}

function bindUi() {
  document.querySelectorAll("[data-map-filter]").forEach((button) => {
    button.addEventListener("click", () => setFilter(button.dataset.mapFilter));
  });

  $("mapFitTripBtn")?.addEventListener("click", () => fitTrip(true));
  $("mapLocateMissingBtn")?.addEventListener("click", locateAllMissing);

  window.addEventListener("online", () => {
    setOfflineVisible(false);
    if (activatedOnce && !mapReady) activate();
  });
  window.addEventListener("offline", () => {
    if (activatedOnce) {
      setOfflineVisible(true, "Map imagery needs internet", "Your itinerary, Family Sync data and saved pin coordinates remain stored locally.");
      setStatus("Offline — saved trip data is still available.");
    }
  });
}

async function init() {
  try {
    await waitForBridge();
    bindUi();
    dataChanged();
  } catch (error) {
    setStatus(error.message || "Trip Map could not start.");
  }
}

window.TripMap = {
  activate,
  dataChanged,
  queueGeocode
};

init();
