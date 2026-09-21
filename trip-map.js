const MAPLIBRE_VERSION = "6.10.0";
const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.mjs`;
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/bright";
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

function setOfflineVisible(show) {
  $("tripMapOffline")?.classList.toggle("hidden", !show);
}

async function loadMapLibre() {
  if (maplibregl) return maplibregl;
  if (!navigator.onLine) throw new Error("Map imagery needs an internet connection.");

  addMapLibreCss();
  maplibregl = await import(MAPLIBRE_JS);
  return maplibregl;
}

function satelliteTransformStyle(previousStyle, nextStyle) {
  nextStyle.projection = { type: "globe" };
  nextStyle.sources = {
    ...nextStyle.sources,
    satelliteSource: {
      type: "raster",
      tiles: [SATELLITE_TILES],
      tileSize: 256
    },
    terrainSource: {
      type: "raster-dem",
      url: TERRAIN_TILEJSON
    },
    hillshadeSource: {
      type: "raster-dem",
      url: TERRAIN_TILEJSON
    }
  };

  nextStyle.terrain = {
    source: "terrainSource",
    exaggeration: 1
  };

  nextStyle.sky = {
    "atmosphere-blend": [
      "interpolate",
      ["linear"],
      ["zoom"],
      0, 1,
      2, 0
    ]
  };

  nextStyle.layers.push({
    id: "trip-hills",
    type: "hillshade",
    source: "hillshadeSource",
    layout: { visibility: "visible" },
    paint: { "hillshade-shadow-color": "#473B24" }
  });

  const firstNonFillLayer = nextStyle.layers.find(
    (layer) => layer.type !== "fill" && layer.type !== "background"
  );
  const insertIndex = firstNonFillLayer ? nextStyle.layers.indexOf(firstNonFillLayer) : 0;

  nextStyle.layers.splice(insertIndex, 0, {
    id: "trip-satellite",
    type: "raster",
    source: "satelliteSource",
    layout: { visibility: "visible" },
    paint: {
      "raster-opacity": 1,
      "raster-saturation": -0.05,
      "raster-contrast": 0.05
    }
  });

  return nextStyle;
}

async function ensureMap() {
  if (map && mapReady) {
    map.resize();
    return map;
  }
  if (mapLoadPromise) return mapLoadPromise;

  mapLoadPromise = (async () => {
    try {
      setStatus("Loading globe…");
      setOfflineVisible(false);
      const lib = await loadMapLibre();

      map = new lib.Map({
        container: "tripMapCanvas",
        center: [125, 30],
        zoom: 2.6,
        pitch: 45,
        bearing: 0,
        maxPitch: 85,
        canvasContextAttributes: { antialias: true }
      });

      map.setStyle(OPENFREEMAP_STYLE, {
        transformStyle: satelliteTransformStyle
      });

      map.addControl(
        new lib.NavigationControl({
          visualizePitch: true,
          showZoom: true,
          showCompass: true
        }),
        "top-right"
      );

      if (lib.GlobeControl) {
        map.addControl(new lib.GlobeControl(), "top-right");
      }

      map.on("load", () => {
        mapReady = true;
        setStatus("");
        refreshMarkers();
        fitTrip(false);
      });

      map.on("error", (event) => {
        if (!navigator.onLine) setOfflineVisible(true);
      });

      return map;
    } catch (error) {
      mapLoadPromise = null;
      setOfflineVisible(true);
      setStatus(error.message || "Could not load the map.");
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
    refreshMarkers();

    // Existing trips may have many old locations without coordinates.
    // Do one low-rate automatic pass the first time Map is opened.
    if (!hasAutoLocated && navigator.onLine && missingRecords().length) {
      hasAutoLocated = true;
      locateAllMissing();
    }
  } catch {}
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
      setOfflineVisible(true);
      setStatus("Offline — itinerary and saved coordinates are still available locally.");
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
