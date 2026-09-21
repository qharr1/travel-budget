const MAPLIBRE_VERSION = "5.24.0";

const MAPLIBRE_SCRIPT_URLS = [
  `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`,
  `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`
];

const MAPLIBRE_CSS_URLS = [
  `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`,
  `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`
];

const OFFICIAL_GLOBE_STYLE = "https://demotiles.maplibre.org/globe.json";
const SATELLITE_TILES =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
const PHOTON_SEARCH = "https://photon.komoot.io/api/";

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
let enginePromise = null;
let mapPromise = null;
let flightPathMarkers = [];
let flightPathsVisible = localStorage.getItem("travelPlanner.map.flightPaths.v1") !== "off";

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

function setStatus(text) {
  if ($("mapStatus")) $("mapStatus").textContent = text || "";
}

function setSourceState(key, value, label = "") {
  const node = $("mapSourceStatus")?.querySelector(`[data-map-source="${key}"]`);
  if (!node) return;
  const display = label || (key === "webgl" ? "WebGL" : key === "engine" ? "Engine" : key === "base" ? "Globe" : "Satellite");
  node.textContent = `${display}: ${value}`;
  node.dataset.state = value;
}

function showOverlay(title, text) {
  if ($("tripMapOverlayTitle")) $("tripMapOverlayTitle").textContent = title;
  if ($("tripMapOverlayText")) $("tripMapOverlayText").textContent = text;
  $("tripMapOffline")?.classList.remove("hidden");
}

function hideOverlay() {
  $("tripMapOffline")?.classList.add("hidden");
}

function testWebGL() {
  const canvas = document.createElement("canvas");
  let gl2 = null;
  let gl1 = null;

  try { gl2 = canvas.getContext("webgl2"); } catch {}
  if (!gl2) {
    try {
      gl1 = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    } catch {}
  }

  if (gl2) {
    setSourceState("webgl", "WebGL2");
    return { ok: true, version: 2 };
  }
  if (gl1) {
    setSourceState("webgl", "WebGL1");
    return { ok: true, version: 1 };
  }

  setSourceState("webgl", "unavailable");
  return { ok: false, version: 0 };
}

function addCss(url) {
  let link = document.querySelector('link[data-trip-map-maplibre]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.tripMapMaplibre = "true";
    document.head.appendChild(link);
  }
  link.href = url;
}

function loadClassicScript(url) {
  return new Promise((resolve, reject) => {
    const old = document.querySelector(`script[data-trip-map-lib="${CSS.escape(url)}"]`);
    if (old) {
      if (window.maplibregl) return resolve(window.maplibregl);
      old.addEventListener("load", () => resolve(window.maplibregl), { once: true });
      old.addEventListener("error", () => reject(new Error(`Failed to load ${url}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.tripMapLib = url;
    script.onload = () => {
      if (window.maplibregl) resolve(window.maplibregl);
      else reject(new Error("MapLibre loaded but did not expose window.maplibregl."));
    };
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(script);
  });
}

async function loadMapLibreV5() {
  if (maplibregl) return maplibregl;
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    const webgl = testWebGL();
    if (!webgl.ok) {
      throw new Error("WebGL is disabled or unavailable in this browser.");
    }

    if (!navigator.onLine) {
      throw new Error("The map engine needs internet the first time it loads.");
    }

    let lastError = null;
    for (let i = 0; i < MAPLIBRE_SCRIPT_URLS.length; i++) {
      try {
        setSourceState("engine", i ? "backup" : "loading");
        setStatus(i ? "Loading map engine from backup source…" : "Loading map engine…");
        addCss(MAPLIBRE_CSS_URLS[i]);
        maplibregl = await loadClassicScript(MAPLIBRE_SCRIPT_URLS[i]);

        if (!maplibregl?.Map) {
          throw new Error("MapLibre Map constructor was not found.");
        }

        if (typeof maplibregl.supported === "function" && !maplibregl.supported()) {
          throw new Error("MapLibre reports that this browser/GPU cannot render WebGL maps.");
        }

        setSourceState("engine", "ready");
        return maplibregl;
      } catch (error) {
        console.warn("MapLibre source failed:", MAPLIBRE_SCRIPT_URLS[i], error);
        lastError = error;
      }
    }

    setSourceState("engine", "failed");
    throw lastError || new Error("MapLibre could not be loaded.");
  })();

  return enginePromise;
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

function validCoords(record) {
  if (
    record?.latitude === null ||
    record?.latitude === undefined ||
    record?.latitude === "" ||
    record?.longitude === null ||
    record?.longitude === undefined ||
    record?.longitude === ""
  ) return false;

  const lat = Number(record.latitude);
  const lng = Number(record.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;

  return true;
}

function records() {
  return bridge?.getRecords?.() || [];
}

function missingRecords() {
  return records().filter((r) => !validCoords(r));
}

function filteredRecords() {
  return records().filter(validCoords).filter((record) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "hotel") return Boolean(record.isHotel);
    if (activeFilter === "itinerary") return record.kind === "itinerary";
    if (activeFilter === "places") return record.kind === "place";
    return true;
  });
}

function installSatelliteLayer() {
  if (!map || !mapReady) return;

  try {
    if (!map.getSource("trip-satellite")) {
      map.addSource("trip-satellite", {
        type: "raster",
        tiles: [SATELLITE_TILES],
        tileSize: 256,
        attribution:
          "Sentinel-2 cloudless 2020 © EOX IT Services GmbH • modified Copernicus Sentinel data"
      });
    }

    if (!map.getLayer("trip-satellite")) {
      const style = map.getStyle();
      const firstLineOrSymbol = style.layers?.find((layer) =>
        layer.type === "line" || layer.type === "symbol"
      )?.id;

      map.addLayer({
        id: "trip-satellite",
        type: "raster",
        source: "trip-satellite",
        paint: {
          "raster-opacity": 0.92,
          "raster-saturation": -0.05,
          "raster-contrast": 0.03
        }
      }, firstLineOrSymbol);
    }

    setSourceState("satellite", "ready");
  } catch (error) {
    console.warn("Satellite layer failed; base globe remains active.", error);
    setSourceState("satellite", "fallback");
    setStatus("Globe is working; satellite imagery could not be added, so the vector globe is being shown.");
  }
}

async function ensureMap() {
  if (map && mapReady) {
    hideOverlay();
    map.resize();
    return map;
  }
  if (mapPromise) return mapPromise;

  mapPromise = (async () => {
    try {
      hideOverlay();
      setSourceState("base", "loading");
      const lib = await loadMapLibreV5();

      // Important: official globe style is provided directly in the constructor.
      // No blank style / transform phase.
      map = new lib.Map({
        container: "tripMapCanvas",
        style: OFFICIAL_GLOBE_STYLE,
        center: [125, 30],
        zoom: 2.4,
        pitch: 20,
        bearing: 0,
        maxPitch: 75,
        attributionControl: true,
        canvasContextAttributes: { antialias: true }
      });

      map.addControl(
        new lib.NavigationControl({
          showZoom: true,
          showCompass: true,
          visualizePitch: true
        }),
        "top-right"
      );

      if (lib.GlobeControl) {
        map.addControl(new lib.GlobeControl(), "top-right");
      }

      let loaded = false;

      map.on("load", () => {
        loaded = true;
        mapReady = true;
        setSourceState("base", "ready");
        setStatus("Globe loaded.");
        hideOverlay();

        // Official globe.json already requests globe projection, but set it again
        // for compatibility if the style endpoint changes.
        try {
          if (map.setProjection) map.setProjection({ type: "globe" });
        } catch {}

        requestAnimationFrame(() => map.resize());
        setTimeout(() => map.resize(), 100);
        setTimeout(() => map.resize(), 400);

        refreshMarkers();
        fitTrip(false);
        installSatelliteLayer();
      });

      map.on("error", (event) => {
        const message = event?.error?.message || "Unknown map error";
        console.warn("MapLibre map error:", message);

        if (!loaded) {
          setStatus(`Globe loading issue: ${message}`);
        }
      });

      // A hard visible failure replaces the silent black rectangle.
      setTimeout(() => {
        if (!loaded) {
          setSourceState("base", "failed");
          showOverlay(
            "The globe did not finish loading",
            "The map engine started, but the globe style/tiles did not render. Your trip data is unaffected."
          );
          setStatus("Globe style failed to load.");
        }
      }, 12000);

      return map;
    } catch (error) {
      mapPromise = null;
      setSourceState("base", "failed");
      showOverlay(
        "Map could not start",
        `${error?.message || "Unknown map error"} Your itinerary and saved coordinates are unaffected.`
      );
      setStatus(`Map error: ${error?.message || "could not start"}`);
      throw error;
    }
  })();

  return mapPromise;
}


function markerMeta(record) {
  const type = String(record?.type || "").trim().toLowerCase();
  const category = String(record?.category || "").trim().toLowerCase();

  if (record?.isHotel) {
    return { icon: "🏨", label: "Accommodation", className: "marker-hotel" };
  }

  if (type === "flight") {
    return { icon: "✈️", label: "Flight", className: "marker-flight" };
  }
  if (type === "theme park") {
    return { icon: "🎢", label: "Theme park", className: "marker-themepark" };
  }
  if (type === "travel") {
    return { icon: "🚆", label: "Travel", className: "marker-travel" };
  }
  if (type === "food" || category === "restaurant") {
    return { icon: "🍽️", label: type === "food" ? "Food" : "Restaurant", className: "marker-food" };
  }
  if (type === "shopping" || category === "shop") {
    return { icon: "🛍️", label: type === "shopping" ? "Shopping" : "Shop", className: "marker-shopping" };
  }
  if (type === "activity" || category === "activity") {
    return { icon: "🎯", label: "Activity", className: "marker-activity" };
  }
  if (category === "park") {
    return { icon: "🌳", label: "Park", className: "marker-park" };
  }
  if (category === "attraction") {
    return { icon: "📸", label: "Attraction", className: "marker-attraction" };
  }

  return {
    icon: record?.kind === "place" ? "📍" : "🧭",
    label: record?.kind === "place" ? "Place" : (record?.type || "Itinerary"),
    className: "marker-generic"
  };
}

function validRouteCoords(route) {
  const values = [route?.originLatitude, route?.originLongitude, route?.destinationLatitude, route?.destinationLongitude];
  if (values.some((value) => value === null || value === undefined || value === "")) return false;
  const [lat1, lng1, lat2, lng2] = values.map(Number);
  return Number.isFinite(lat1) && Number.isFinite(lng1) &&
    Number.isFinite(lat2) && Number.isFinite(lng2) &&
    Math.abs(lat1) <= 90 && Math.abs(lat2) <= 90 &&
    Math.abs(lng1) <= 180 && Math.abs(lng2) <= 180 &&
    !(lat1 === 0 && lng1 === 0) && !(lat2 === 0 && lng2 === 0);
}

function flightRoutes() {
  return bridge?.getFlightRoutes?.() || [];
}

function unwrapLongitude(startLng, endLng) {
  let result = endLng;
  while (result - startLng > 180) result -= 360;
  while (result - startLng < -180) result += 360;
  return result;
}

function wrapLongitude(lng) {
  let result = lng;
  while (result > 180) result -= 360;
  while (result < -180) result += 360;
  return result;
}

function curvedRouteCoordinates(route) {
  const x0 = Number(route.originLongitude);
  const y0 = Number(route.originLatitude);
  const x1 = unwrapLongitude(x0, Number(route.destinationLongitude));
  const y1 = Number(route.destinationLatitude);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const arc = Math.min(18, Math.max(2.2, distance * 0.16));
  const nx = -dy / distance;
  const ny = dx / distance;
  const controlX = (x0 + x1) / 2 + nx * arc;
  const controlY = Math.max(-78, Math.min(78, (y0 + y1) / 2 + ny * arc));

  const points = [];
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * x0 + 2 * mt * t * controlX + t * t * x1;
    const y = mt * mt * y0 + 2 * mt * t * controlY + t * t * y1;
    points.push([wrapLongitude(x), y]);
  }
  return points;
}

function flightRouteGeoJson() {
  return {
    type: "FeatureCollection",
    features: flightRoutes().filter(validRouteCoords).map((route) => ({
      type: "Feature",
      properties: { id: route.id, sequence: route.sequence, title: route.title },
      geometry: { type: "LineString", coordinates: curvedRouteCoordinates(route) }
    }))
  };
}

function clearFlightPathMarkers() {
  flightPathMarkers.forEach((marker) => marker.remove());
  flightPathMarkers = [];
}

function routeMidpoint(route) {
  const points = curvedRouteCoordinates(route);
  return points[Math.floor(points.length / 2)];
}

function flightRoutePopupHtml(route) {
  const from = route.originCode ? `${route.originCode} • ${route.origin}` : route.origin;
  const to = route.destinationCode ? `${route.destinationCode} • ${route.destination}` : route.destination;
  const timing = [route.date || "", route.startTime || "", route.endTime ? `→ ${route.endTime}` : ""].filter(Boolean).join(" ");

  return `
    <div class="trip-map-popup flight-route-popup">
      <span class="trip-map-popup-type">✈ Flight ${route.sequence}</span>
      <strong>${escapeHtml(route.title || `Flight ${route.sequence}`)}</strong>
      <small>${escapeHtml(timing)}</small>
      <p>${escapeHtml(from)}<br>→ ${escapeHtml(to)}</p>
      <div class="trip-map-popup-actions single-action">
        <button type="button" data-flight-open="${escapeHtml(route.id)}">Open itinerary</button>
      </div>
    </div>
  `;
}

function refreshFlightPaths() {
  if (!map || !mapReady || !maplibregl) return;

  const sourceData = flightRouteGeoJson();
  let source = map.getSource("trip-flight-paths");
  if (!source) {
    map.addSource("trip-flight-paths", { type: "geojson", data: sourceData });
    source = map.getSource("trip-flight-paths");
  } else {
    source.setData(sourceData);
  }

  if (!map.getLayer("trip-flight-path-shadow")) {
    map.addLayer({
      id: "trip-flight-path-shadow",
      type: "line",
      source: "trip-flight-paths",
      layout: { "line-cap": "round", "line-join": "round", visibility: flightPathsVisible ? "visible" : "none" },
      paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.72 }
    });
  }

  if (!map.getLayer("trip-flight-path-line")) {
    map.addLayer({
      id: "trip-flight-path-line",
      type: "line",
      source: "trip-flight-paths",
      layout: { "line-cap": "round", "line-join": "round", visibility: flightPathsVisible ? "visible" : "none" },
      paint: { "line-color": "#2563eb", "line-width": 3.5, "line-opacity": 0.9 }
    });
  }

  for (const layerId of ["trip-flight-path-shadow", "trip-flight-path-line"]) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", flightPathsVisible ? "visible" : "none");
  }

  clearFlightPathMarkers();

  if (flightPathsVisible) {
    for (const route of flightRoutes().filter(validRouteCoords)) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "flight-path-plane-marker";
      element.innerHTML = `<span>✈</span><strong>${route.sequence}</strong>`;

      const popup = new maplibregl.Popup({offset:22,closeButton:true,maxWidth:"300px"})
        .setHTML(flightRoutePopupHtml(route));

      const marker = new maplibregl.Marker({element,anchor:"center"})
        .setLngLat(routeMidpoint(route))
        .setPopup(popup)
        .addTo(map);

      popup.on("open", () => {
        popup.getElement()?.querySelector("[data-flight-open]")?.addEventListener("click", () => {
          popup.remove();
          bridge.openRecord?.("itinerary", route.id);
        });
      });

      flightPathMarkers.push(marker);
    }
  }

  const toggle = $("mapFlightPathsToggle");
  if (toggle) {
    toggle.classList.toggle("active", flightPathsVisible);
    toggle.setAttribute("aria-pressed", String(flightPathsVisible));
    toggle.textContent = flightPathsVisible ? "✈ Flight paths on" : "✈ Flight paths off";
  }
}

function toggleFlightPaths() {
  flightPathsVisible = !flightPathsVisible;
  localStorage.setItem("travelPlanner.map.flightPaths.v1", flightPathsVisible ? "on" : "off");
  refreshFlightPaths();
}

function markerElement(record) {
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.className = `trip-map-marker-wrap ${record.isWishlist ? "wishlist-marker" : ""}`;
  wrapper.setAttribute("aria-label", record.title || "Trip location");

  const meta = markerMeta(record);
  const visual = document.createElement("span");

  if (record.isHotel) {
    visual.className = `trip-map-marker hotel-marker ${meta.className}`;
    visual.innerHTML = `<span class="trip-map-glyph">${meta.icon}</span>`;
  } else {
    visual.className = `trip-map-marker pin-marker icon-pin-marker ${meta.className}`;
    visual.innerHTML = `<span class="trip-map-pin-glyph">${meta.icon}</span>`;
  }

  wrapper.appendChild(visual);
  return wrapper;
}

function popupHtml(record) {
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

    const marker = new maplibregl.Marker({ element, anchor: "bottom" })
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

  refreshFlightPaths();
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
          <div class="map-missing-copy">
            <strong>${escapeHtml(record.title)}</strong>
            <span>${escapeHtml(record.location)}</span>
          </div>
          <div class="map-missing-actions">
            <button class="mini-btn map-find-one" type="button" data-kind="${escapeHtml(record.kind)}" data-id="${escapeHtml(record.id)}">Find pin</button>
            <button class="mini-btn soft-btn map-manual-one" type="button" data-kind="${escapeHtml(record.kind)}" data-id="${escapeHtml(record.id)}">Set manually</button>
          </div>
        </div>
      `).join("")
    : `<p class="expense-empty">Everything with a saved location is pinned.</p>`;

  root.querySelectorAll(".map-find-one").forEach((button) => {
    button.addEventListener("click", () => {
      queueGeocode(button.dataset.kind, button.dataset.id, true);
    });
  });

  root.querySelectorAll(".map-manual-one").forEach((button) => {
    button.addEventListener("click", () => {
      promptManualCoordinates(button.dataset.kind, button.dataset.id);
    });
  });
}


function promptManualCoordinates(kind, id) {
  const record = records().find((r) => r.kind === kind && r.id === id);
  if (!record) return;

  const latInput = window.prompt(
    `Enter latitude for "${record.title}"\nExample: 35.6329`,
    record.latitude ?? ""
  );
  if (latInput === null) return;

  const lngInput = window.prompt(
    `Enter longitude for "${record.title}"\nExample: 139.8804`,
    record.longitude ?? ""
  );
  if (lngInput === null) return;

  const lat = Number(String(latInput).trim());
  const lng = Number(String(lngInput).trim());

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    window.alert("That latitude/longitude pair is not valid.");
    return;
  }

  bridge.updateCoordinates?.(kind, id, lat, lng, `Manual pin (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
  refreshMarkers();
  fitTrip(true);
  setStatus(`Saved manual pin for ${record.title}.`);
}

function fitTrip(animate = true) {
  if (!map || !mapReady || !maplibregl) return;

  const items = filteredRecords();
  if (!items.length) return;

  if (items.length === 1) {
    map.flyTo({
      center: [Number(items[0].longitude), Number(items[0].latitude)],
      zoom: 12,
      pitch: 45,
      duration: animate ? 1000 : 0
    });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  items.forEach((record) =>
    bounds.extend([Number(record.longitude), Number(record.latitude)])
  );

  map.fitBounds(bounds, {
    padding: 70,
    maxZoom: 11,
    duration: animate ? 1200 : 0
  });
}

function photonLabel(feature, fallback) {
  const p = feature?.properties || {};
  return [
    p.name,
    p.street,
    p.city || p.locality,
    p.state,
    p.country
  ].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join(", ") || fallback;
}

async function geocodeRecord(record) {
  if (!navigator.onLine) throw new Error("Internet is required to locate a new pin.");

  const query = String(record.query || record.location || "").trim();
  if (!query) throw new Error("No location text to search.");

  const url = new URL(PHOTON_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "en");

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) throw new Error(`Location search failed (${response.status}).`);

  const result = await response.json();
  const first = result?.features?.[0] || null;
  const coords = first?.geometry?.coordinates || [];

  const lng = Number(coords[0]);
  const lat = Number(coords[1]);

  if (!first || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  bridge.updateCoordinates?.(
    record.kind,
    record.id,
    lat,
    lng,
    photonLabel(first, query)
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
      console.warn("Trip location search failed:", error);
      if (!navigator.onLine) break;
    }

    refreshMarkers();
    if (queued.length) await sleep(850);
  }

  geocoding = false;
  renderStatusCounts();
  refreshMarkers();

  if (found > 0) {
    setStatus(`Located ${found} new pin${found === 1 ? "" : "s"}. Coordinates are saved with the trip.`);
    fitTrip(true);
  } else if (!missingRecords().length) {
    setStatus("Every saved location has a pin.");
  } else if (navigator.onLine) {
    setStatus("Some locations could not be matched. Make the address/location more specific, retry, or use Set manually.");
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
  queued = missingRecords().map((r) => ({ kind: r.kind, id: r.id }));
  processQueue();
}

async function rebuildAllPins() {
  if (geocoding) return;

  const all = records();
  if (!all.length) {
    setStatus("There are no itinerary/place locations to rebuild.");
    return;
  }

  const ok = window.confirm(
    `Rebuild all ${all.length} map pin${all.length === 1 ? "" : "s"}? This clears saved coordinates and locates every saved location again.`
  );
  if (!ok) return;

  const cleared = bridge?.clearAllCoordinates?.() || 0;
  hasAutoLocated = true;
  queued = records()
    .filter((record) => String(record.location || "").trim())
    .map((record) => ({ kind: record.kind, id: record.id }));

  setStatus(`Cleared ${cleared} saved coordinate${cleared === 1 ? "" : "s"}. Re-locating the trip…`);
  refreshMarkers();
  await processQueue();
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
    console.error("Trip Map activation failed:", error);
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

  $("mapFlightPathsToggle")?.addEventListener("click", toggleFlightPaths);
  $("mapFitTripBtn")?.addEventListener("click", () => fitTrip(true));
  $("mapLocateMissingBtn")?.addEventListener("click", locateAllMissing);
  $("mapRebuildPinsBtn")?.addEventListener("click", rebuildAllPins);

  window.addEventListener("online", () => {
    if (activatedOnce && !mapReady) activate();
  });

  window.addEventListener("offline", () => {
    if (activatedOnce) {
      showOverlay(
        "Map imagery needs internet",
        "Your itinerary, Family Sync data and saved pin coordinates remain stored locally."
      );
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
    console.error("Trip Map init failed:", error);
    setStatus(`Trip Map could not start: ${error.message}`);
  }
}

window.TripMap = {
  activate,
  dataChanged,
  queueGeocode
};

init();
