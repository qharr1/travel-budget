# Travel Planner v27 — Trip Map render fix

v26 could leave a black rectangle if the external map style failed before MapLibre finished rendering.

v27 changes the startup order so the base map is loaded first, then globe projection, satellite imagery and terrain are added progressively. Satellite and terrain are optional enhancements; if either fails, the base globe remains visible.

There is also a fallback map style, a second MapLibre CDN, visible source-status chips, and an error overlay instead of silent failures.

Upload the full v27 package, especially index.html, styles.css, app.js, trip-map.js and sw.js.
