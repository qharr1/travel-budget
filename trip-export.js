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

  function renderTrip(data, o, from, to) {
    const trip = data.trip;
    const travellers = arr(trip.travellerProfiles);
    const people = Object.fromEntries(travellers.map(p=>[p.id,p.name]));
    const items = sortIt(trip.itinerary).filter(it=>isBetween(it.date,from,to));
    const generated = new Date().toLocaleString('en-AU',{dateStyle:'medium',timeStyle:'short'});
    let html = '<header class="tp-x-cover"><p class="tp-x-overline">OFFLINE TRAVEL PACK</p><h1>' + esc(trip.name || 'My Trip')
      + '</h1><div class="tp-x-dates">' + esc(niceDate(from)) + ' - ' + esc(niceDate(to)) + '</div>'
      + '<p>Prepared ' + esc(generated) + ' · Read this copy without opening Travel Planner.</p>'
      + '<div class="tp-x-alert">This is a snapshot, not a live booking confirmation. Flight times, prices and opening hours can change. Save ticket PDFs and screenshots separately.</div></header>';
    if (o.travellers && travellers.length) {
      html += block('Travellers', travellers.map(p=>'<span class="tp-x-person">' + esc(p.name) + ' (' + esc(p.type) + ')</span>').join(''));
    }
    if (o.essentials) {
      const essentials = items.filter(it =>
        /flight|accommodat|hotel|stay|travel|transport|transfer|train|ferry/i.test(str(it.type))
        || /hotel|airport|flight|check.in|check.out|shinkansen/i.test(str(it.title)));
      html += block('Flights, stays & transfers', essentials.length ? essentials.map(it=>{
        let info = row('Date',niceDate(it.date)) + row('Time',[it.startTime,it.endTime].filter(Boolean).join(' - '));
        if (it.endDate && it.endDate !== it.date) info += row('Arrival date',niceDate(it.endDate));
        info += row('Route',[it.flightOrigin || it.travelOrigin,it.flightDestination || it.travelDestination].filter(Boolean).join(' → '));
        if (o.locations) info += mapLocation(it.location,it.latitude,it.longitude);
        if (o.bookings) info += row('Booking ref',it.bookingRef);
        if (o.notes) info += paragraph(it.notes);
        return details(it.title,info);
      }).join('') : paragraph('No flights, accommodation or transfers saved for the selected dates.'),'A quick reference to the most important travel arrangements.');
    }
    if (o.itinerary) {
      const dates=[];
      for (let d=from, i=0; d<=to && i<370; d=nextDate(d),i++) dates.push(d);
      let days='';
      dates.forEach((d,i)=>{
        const meta=trip.dayMeta?.[d] || {};
        const dayItems=items.filter(it=>it.date===d);
        let content='<div class="tp-x-day-heading"><span>DAY '+(i+1)+'</span><h3>'+esc(niceDate(d))+'</h3>'
          +(meta.tripLocation?'<strong>'+esc(meta.tripLocation)+'</strong>':'')
          +(meta.headline?'<p>'+esc(meta.headline)+'</p>':'')+'</div>';
        if (o.locations) content+=row('Overnight',meta.overnight);
        if (o.notes) content+=paragraph(meta.notes);
        content+=dayItems.length?dayItems.map(it=>itineraryCard(it,o,people)).join('')
          :'<p class="tp-x-muted">No itinerary items scheduled.</p>';
        if (o.notes) {
          arr(trip.timelineNotes).filter(n=>n.date===d).forEach(n=>{
            content+=details((n.time?n.time+' · ':'')+(n.title||'Timeline note'),paragraph(n.text));
          });
          arr(trip.dayNotes?.[d]).forEach(n=>{content+=details(n.title||'Day journal',paragraph(n.text));});
        }
        if (o.budget && trip.budget?.dailyLimits?.[d]!=null)
          content+=row('Custom daily limit',currency(trip.budget.dailyLimits[d],'AUD'));
        days+='<section class="tp-x-day">'+content+'</section>';
      });
      html+=block('Day-by-day itinerary',days,'Times are shown as saved in the planner, in the applicable local time.');
    }
    if (o.places) {
      const savedPlaces=arr(trip.places).filter(p=>!p.date||isBetween(p.date,from,to));
      const cards=savedPlaces.map(p=>{
        let body=row('Category',p.category)+row('Status',p.status);
        if (o.locations) body+=mapLocation(p.location||p.title,p.latitude,p.longitude);
        if (o.bookings) body+=row('Booking ref',p.bookingRef);
        if (o.budget) body+=row('Estimated cost',currency(p.costTotal,p.costCurrency));
        if (o.links) body+=urlRow('Website',p.website);
        if (o.notes) body+=paragraph(p.notes);
        return details(p.title||'Place',body);
      }).join('');
      html+=block('Saved places / POIs',cards || paragraph('No places saved.'),'Saved points of interest and wishlist ideas are not necessarily booked.');
    }
    if (o.bookings) {
      const cards=arr(trip.documents).map(doc=>{
        const linked=items.find(it=>it.id===doc.linkedItineraryId);
        let body=row('Category',doc.category)+row('Related itinerary',linked?.title||'');
        body+=row('Booking reference',doc.bookingRef)+row('Confirmation',doc.confirmation)+row('Phone',doc.phone);
        if (o.links) body+=urlRow('Website',doc.website);
        if (o.notes) body+=paragraph(doc.notes);
        body+=row('Attachment filename',doc.attachmentName);
        return details(doc.title||'Document',body);
      }).join('');
      html+=block('Booking & document details',cards||paragraph('No booking records saved.'),
        'The document details are exported, not the attached ticket PDFs, images or passport scans. Save those separately.');
    }
    if (o.contacts) {
      const cards=arr(trip.travelInfo).map(info=>{
        let body=row('Type',info.type)+row('Reference',info.reference)
          +row('Phone',info.phone)+row('Email',info.email);
        if (o.links) body+=urlRow('Website',info.website);
        if (o.notes) body+=paragraph(info.notes);
        return details(info.name||'Contact',body);
      }).join('');
      html+=block('Emergency & travel contacts',cards||paragraph('No saved contact information.'));
    }
    if (o.budget) {
      const budget=trip.budget||{};
      let info=row('Trip budget',currency(budget.totalBudget,'AUD'))
        +row('Day 1 spending limit',currency(budget.day1HardLimit,'AUD'));
      arr(budget.destinations).forEach(dest=>{
        info+=details(dest.name||'Destination',row('Dates',niceDate(dest.startDate)+' - '+niceDate(dest.endDate))
          +row('Currency',dest.currency)
          +row('Planning exchange rate',dest.rate?'1 AUD = '+dest.rate+' '+(dest.currency||''):''));
      });
      const daily=Object.entries(budget.dailyLimits||{}).filter(entry=>isBetween(entry[0],from,to)).sort();
      if (daily.length) {
        info+='<h3>Custom daily limits</h3>';
        daily.forEach(entry=>{info+=row(niceDate(entry[0]),currency(entry[1],'AUD'));});
      }
      html+=block('Budget plan',info||paragraph('No budget saved.'));
    }
    if (o.expenses) {
      const expenses=arr(data.expenses).filter(e=>isBetween(e.date,from,to))
        .sort((a,b)=>str(a.date).localeCompare(str(b.date)));
      const total=expenses.reduce((sum,e)=>sum+(Number(e.audAmount)||0),0);
      let cards='<p class="tp-x-total">Recorded spending: '+esc(currency(total,'AUD'))+'</p>';
      cards+=expenses.map(e=>details(niceDate(e.date)+' - '+(e.category||'Other'),
        row('Amount',currency(e.amount,e.currency))
        +row('AUD equivalent',currency(e.audAmount,'AUD'))
        +row('Destination',e.destinationName)
        +row('Details',e.note))).join('');
      if (!expenses.length) cards+=paragraph('No expenses recorded for the selected dates.');
      html+=block('Expense history',cards);
    }
    if (o.tasks) {
      const cards=arr(trip.preTripTasks).map(t=>{
        let info=row('Due',t.dueDate?niceDate(t.dueDate):'')+row('Status',t.status)+row('Category',t.category);
        if (o.travellers) info+=row('Assigned to',people[t.assigneeId]);
        if (o.notes) info+=paragraph(t.notes);
        return details(t.title||'Task',info);
      }).join('');
      html+=block('Pre-trip checklist',cards||paragraph('No pre-trip tasks saved.'));
    }
    html+='<footer class="tp-x-footer">Prepared from Travel Planner on '+esc(generated)
      +'<p>External maps and web links need internet access. This saved document does not update when the app changes.</p></footer>';
    return html;
  }

  const PRINT_STYLES = String.raw`
    @page { size:A4; margin:13mm; }
    .tp-x-print {font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif; color:#172738;line-height:1.45;font-size:10pt;max-width:850px;margin:auto;}
    .tp-x-print *{box-sizing:border-box}
    .tp-x-print h1{font-size:27pt;line-height:1.2;color:#0f766e;margin:7px 0 12px}
    .tp-x-print h2{font-size:16pt;color:#0f766e;border-bottom:1px solid #cbd5e1;padding-bottom:6px;margin:26px 0 12px;break-after:avoid}
    .tp-x-print h3{font-size:11pt;margin:0 0 6px;color:#172738}
    .tp-x-print p{margin:7px 0}
    .tp-x-print .tp-x-overline{letter-spacing:1.5px;color:#0f766e;font-weight:800}
    .tp-x-print .tp-x-cover{border-bottom:3px solid #0f766e;padding:14px 0 20px;margin-bottom:22px}
    .tp-x-print .tp-x-dates{font-size:14pt;font-weight:750}
    .tp-x-print .tp-x-alert{background:#e9f6f4;border-left:4px solid #0f766e;padding:9px 12px;font-size:9pt;margin-top:14px}
    .tp-x-print .tp-x-subtitle,.tp-x-print .tp-x-muted{color:#627184;font-size:9pt}
    .tp-x-print .tp-x-card{border:1px solid #d9e3e9;padding:10px 12px;border-radius:7px;margin:9px 0;break-inside:avoid;overflow-wrap:anywhere}
    .tp-x-print .tp-x-row{display:flex;align-items:flex-start;gap:10px;font-size:9pt;margin:3px 0;overflow-wrap:anywhere}
    .tp-x-print .tp-x-row>span{flex:0 0 88px;color:#52677d;font-weight:650}
    .tp-x-print .tp-x-row>div{flex:1;min-width:0}
    .tp-x-print .tp-x-note{white-space:pre-wrap;overflow-wrap:anywhere;font-size:9pt}
    .tp-x-print .tp-x-day{margin:16px 0;break-inside:auto}
    .tp-x-print .tp-x-day-heading{background:#e9f6f4;border-left:4px solid #0f766e;padding:9px 12px;border-radius:5px;break-after:avoid}
    .tp-x-print .tp-x-day-heading>span{color:#0f766e;font-weight:800;font-size:8pt;letter-spacing:1px}
    .tp-x-print .tp-x-day-heading h3{font-size:14pt;margin:4px 0}
    .tp-x-print .tp-x-day-heading p{margin:4px 0;font-size:9pt}
    .tp-x-print .tp-x-location{font-size:9pt;margin:6px 0;overflow-wrap:anywhere}
    .tp-x-print .tp-x-location small{font-size:8pt;color:#56687a;margin-left:5px}
    .tp-x-print .tp-x-person{display:inline-block;background:#e9f6f4;border-radius:12px;padding:6px 10px;margin:4px;font-size:9pt}
    .tp-x-print .tp-x-total{font-size:13pt;font-weight:800;color:#0f766e}
    .tp-x-print .tp-x-footer{margin-top:34px;border-top:1px solid #cbd5e1;padding:12px 0;color:#63758a;font-size:8pt}
    .tp-x-print a{color:#0f766e;text-decoration:underline}
    @media print {.tp-x-print .tp-x-day-heading,.tp-x-print .tp-x-alert{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  `;
  function prepare() {
    const data=savedState();
    if (!data) throw new Error('Create or import a trip before exporting.');
    const from=id('tripExportFrom').value, to=id('tripExportTo').value;
    if (!from || !to || from>to || from<data.trip.startDate || to>data.trip.endDate)
      throw new Error('Select a valid date range within the trip dates.');
    const options=sectionOptions();
    if (!Object.values(options).some(Boolean)) throw new Error('Select at least one section.');
    remember();
    return {html:renderTrip(data,options,from,to),title:data.trip.name||'My trip',from,to};
  }
  function preview(result) {
    id('tripPrintSheet').innerHTML='<div class="tp-x-print">'+result.html+'</div>';
    id('tripExportPreviewTitle').textContent=result.title+' · '+niceDate(result.from)+' - '+niceDate(result.to);
    id('tripExportDialog').close();
    document.body.classList.add('tp-export-preview-active');
  }
  function downloadOffline(result) {
    const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'
      +'<meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(result.title)+'</title>'
      +'<style>'+PRINT_STYLES+'body{padding:16px}@media print{body{padding:0}}</style></head><body>'
      +'<main class="tp-x-print">'+result.html+'</main></body></html>';
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;
    a.download=(result.title.replace(/[^a-z0-9_-]+/gi,'-').slice(0,50)||'trip')+'-'+result.from+'-offline.html';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }
  function open() {
    const data=savedState();
    if (!data) return alert('Create or import your trip first.');
    ['From','To'].forEach(key=>{
      id('tripExport'+key).min=data.trip.startDate;
      id('tripExport'+key).max=data.trip.endDate;
    });
    id('tripExportFrom').value=data.trip.startDate;
    id('tripExportTo').value=data.trip.endDate;
    id('tripExportError').textContent='';
    id('tripExportDialog').showModal();
  }
  function safeRun(handler) {
    try { handler(); } catch(error) { id('tripExportError').textContent=error.message||'Export failed.'; }
  }
  function init() {
    if (!id('tripExportDialog')) return;
    restore();
    document.querySelectorAll('[data-open-trip-export]').forEach(button=>button.addEventListener('click',open));
    id('tripExportClose').addEventListener('click',()=>id('tripExportDialog').close());
    id('tripExportPreset').addEventListener('change',event=>{
      if (event.target.value!=='custom') selectPreset(event.target.value);
      remember();
    });
    OPTIONS.forEach(([key])=>id('tripExportOpt-'+key).addEventListener('change',()=>{
      id('tripExportPreset').value='custom';remember();
    }));
    id('tripExportPreview').addEventListener('click',()=>safeRun(()=>preview(prepare())));
    id('tripExportSavePdf').addEventListener('click',()=>safeRun(()=>{preview(prepare());window.print();}));
    id('tripExportOfflineHtml').addEventListener('click',()=>safeRun(()=>{
      downloadOffline(prepare());
      id('tripExportError').textContent='Offline HTML file created. Keep a copy in Files as a fallback.';
    }));
    id('tripExportPreviewClose').addEventListener('click',()=>document.body.classList.remove('tp-export-preview-active'));
    id('tripExportPreviewPrint').addEventListener('click',()=>window.print());
    window.addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('tp-export-preview-active');});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
