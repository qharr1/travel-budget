(() => {
  "use strict";
  // Local, dependency-free export. The trip data never leaves this browser.
  const STORAGE_KEY = "tripBudgetApp.v1";
  const PREF_KEY = "travelPlanner.tripExport.v1";
  const OPTIONS = [
    ["essentials", "Flights, hotels & transfers at a glance", true],
    ["itinerary", "Daily itinerary, activities & times", true],
    ["places", "Saved points of interest / wishlist", true],
    ["locations", "Addresses, coordinates & map links", true],
    ["bookings", "Booking references & document vault details", true],
    ["contacts", "Emergency contacts & travel information", true],
    ["notes", "Item notes, day notes & journal", true],
    ["links", "Websites & booking links", true],
    ["travellers", "Names of travellers", false],
    ["budget", "Budget, currencies & custom daily limits", false],
    ["expenses", "Recorded expenses", false],
    ["tasks", "Pre-trip checklist", false]
  ];
  const id = name => document.getElementById(name);
  const str = value => String(value == null ? "" : value).trim();
  const esc = value => str(value).replace(/[&<>"']/g, ch =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const arr = value => Array.isArray(value) ? value : [];
  const href = value => /^(https?:\/\/|tel:|mailto:)/i.test(str(value)) ? str(value) : "";
  const link = (url, label) => href(url)
    ? '<a href="' + esc(url) + '" rel="noopener noreferrer">' + esc(label || url) + '</a>'
    : esc(label || url);
  const row = (label, value) => str(value)
    ? '<div class="tp-x-row"><span>' + esc(label) + '</span><div>' + esc(value) + '</div></div>' : "";
  const urlRow = (label, url) => href(url)
    ? '<div class="tp-x-row"><span>' + esc(label) + '</span><div>' + link(url) + '</div></div>' : "";
  const details = (title, body) => '<article class="tp-x-card"><h3>' + esc(title) + '</h3>' + body + '</article>';
  const paragraph = value => str(value) ? '<p class="tp-x-note">' + esc(value) + '</p>' : "";
  const block = (title, content, subtitle) => content
    ? '<section class="tp-x-section"><h2>' + esc(title) + '</h2>'
      + (subtitle ? '<p class="tp-x-subtitle">' + esc(subtitle) + '</p>' : '')
      + content + '</section>' : '';
  const isBetween = (date, from, to) => Boolean(date && date >= from && date <= to);
  const sortIt = items => arr(items).slice().sort((a,b) =>
    ((a.date || '') + ' ' + (a.startTime || '')).localeCompare((b.date || '') + ' ' + (b.startTime || '')));
  function niceDate(date) {
    if (!/^\d{4}-\d\d-\d\d$/.test(str(date))) return str(date);
    const d = new Date(date + 'T12:00:00');
    return d.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  }
  function nextDate(date) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  }
  function currency(amount, code) {
    if (amount == null || amount === '' || !Number.isFinite(Number(amount))) return '';
    return (str(code) || 'AUD') + ' ' + Number(amount).toLocaleString('en-AU', {maximumFractionDigits:2});
  }
  function mapLocation(text, lat, lng) {
    let coords = '';
    if (lat !== '' && lat != null && lng !== '' && lng != null
      && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      coords = Number(lat).toFixed(6) + ', ' + Number(lng).toFixed(6);
    }
    const query = coords || str(text);
    if (!query) return '';
    const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
    return '<div class="tp-x-location">' + esc(text || coords)
      + (coords ? ' <small>GPS ' + esc(coords) + '</small>' : '')
      + ' <small>' + link(url, 'Map link') + '</small></div>';
  }
  function savedState() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return data && data.trip && typeof data.trip === 'object' ? data : null;
    } catch (_) { return null; }
  }
  function sectionOptions() {
    const values = {};
    OPTIONS.forEach(([key]) => { values[key] = Boolean(id('tripExportOpt-' + key)?.checked); });
    return values;
  }
  function selectPreset(preset) {
    OPTIONS.forEach(([key,, essential]) => {
      const input = id('tripExportOpt-' + key);
      if (input) input.checked = preset === 'complete' || essential;
    });
  }
  function remember() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({
      preset:id('tripExportPreset').value, options:sectionOptions()
    })); } catch (_) {}
  }
  function restore() {
    selectPreset('essentials');
    try {
      const prev = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (!prev.options) return;
      OPTIONS.forEach(([key]) => {
        if (typeof prev.options[key] === 'boolean') id('tripExportOpt-' + key).checked = prev.options[key];
      });
      id('tripExportPreset').value = ['essentials','complete','custom'].includes(prev.preset) ? prev.preset : 'custom';
    } catch (_) {}
  }
  function itineraryCard(item, o, people) {
    let body = row('Time', [item.startTime, item.endTime].filter(Boolean).join(' - '));
    if (item.endDate && item.endDate !== item.date) body += row('Arrival date', niceDate(item.endDate));
    body += row('Type', item.type) + row('Status', o.bookings ? item.status : '');
    body += row('Travel mode', item.travelMode);
    const origin = item.flightOrigin || item.travelOrigin;
    const dest = item.flightDestination || item.travelDestination;
    body += row('From', [origin, item.flightOriginCode].filter(Boolean).join(' / '));
    body += row('To', [dest, item.flightDestinationCode].filter(Boolean).join(' / '));
    if (o.locations) {
      body += mapLocation(item.location, item.latitude, item.longitude);
      if (origin && item.flightOriginLatitude != null)
        body += mapLocation('Departure airport', item.flightOriginLatitude, item.flightOriginLongitude);
      if (dest && item.flightDestinationLatitude != null)
        body += mapLocation('Arrival airport', item.flightDestinationLatitude, item.flightDestinationLongitude);
    }
    if (o.bookings) body += row('Booking ref', item.bookingRef);
    if (o.travellers && arr(item.attendeeIds).length)
      body += row('Attending', item.attendeeIds.map(x=>people[x] || '').filter(Boolean).join(', '));
    if (o.budget) body += row('Estimated cost', currency(item.costTotal, item.costCurrency));
    if (o.links) arr(item.links).forEach(l => { body += urlRow(l.label || 'Link', l.url); });
    if (o.notes) body += paragraph(item.notes);
    return details(item.title || 'Activity', body);
  }
