(() => {
  "use strict";

  const STORAGE_KEY = "tripBudgetApp.v1";
  const APP_VERSION = 3;

  const COMMON_CURRENCIES = [
    ["AUD", "AUD — Australian dollar"],
    ["CNY", "CNY — Chinese yuan"],
    ["JPY", "JPY — Japanese yen"],
    ["USD", "USD — US dollar"],
    ["EUR", "EUR — Euro"],
    ["GBP", "GBP — British pound"],
    ["NZD", "NZD — New Zealand dollar"],
    ["KRW", "KRW — South Korean won"],
    ["SGD", "SGD — Singapore dollar"],
    ["HKD", "HKD — Hong Kong dollar"],
    ["THB", "THB — Thai baht"],
    ["IDR", "IDR — Indonesian rupiah"],
    ["MYR", "MYR — Malaysian ringgit"],
    ["VND", "VND — Vietnamese dong"],
    ["PHP", "PHP — Philippine peso"],
    ["TWD", "TWD — Taiwan dollar"],
    ["CAD", "CAD — Canadian dollar"],
    ["CHF", "CHF — Swiss franc"],
    ["AED", "AED — UAE dirham"]
  ];

  const el = (id) => document.getElementById(id);
  let state = loadState();
  let setupDraftDestinations = [];
  let settingsDraftDestinations = [];
  let selectedItineraryDate = "";
  let setupVisible = false;

  function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function blankState() {
    return { version: APP_VERSION, trip: null, expenses: [] };
  }

  function emptyTrip() {
    return {
      id: uid("trip"),
      name: "",
      startDate: "",
      endDate: "",
      travellers: { adults: 0, children: 0 },
      budget: { configured: false, totalBudget: null, destinations: [] },
      dayMeta: {},
      itinerary: []
    };
  }

  function normalizeDestination(item) {
    return {
      id: String(item?.id || uid("dest")),
      name: String(item?.name || "Destination"),
      currency: String(item?.currency || "AUD").toUpperCase(),
      rate: item?.rate === null || item?.rate === "" || item?.rate === undefined ? null : Number(item.rate),
      startDate: String(item?.startDate || ""),
      endDate: String(item?.endDate || "")
    };
  }

  function normalizeItineraryItem(item) {
    return {
      id: String(item?.id || uid("itin")),
      date: String(item?.date || ""),
      type: String(item?.type || "Activity"),
      title: String(item?.title || "Itinerary item"),
      startTime: String(item?.startTime || ""),
      endTime: String(item?.endTime || ""),
      durationText: String(item?.durationText || ""),
      location: String(item?.location || ""),
      status: String(item?.status || "Planned"),
      bookingRef: String(item?.bookingRef || ""),
      costTotal: item?.costTotal === null || item?.costTotal === "" || item?.costTotal === undefined ? null : Number(item.costTotal),
      costCurrency: String(item?.costCurrency || "AUD").toUpperCase(),
      adultCost: item?.adultCost === null || item?.adultCost === "" || item?.adultCost === undefined ? null : Number(item.adultCost),
      childCost: item?.childCost === null || item?.childCost === "" || item?.childCost === undefined ? null : Number(item.childCost),
      participants: String(item?.participants || ""),
      notes: String(item?.notes || ""),
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
    };
  }

  function normalizeExpense(item) {
    const amount = Number(item?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const audAmount = Number(item?.audAmount);
    return {
      id: String(item?.id || uid("exp")),
      date: String(item?.date || ""),
      amount,
      currency: String(item?.currency || "AUD").toUpperCase(),
      audAmount: Number.isFinite(audAmount) ? audAmount : amount,
      rateUsed: Number(item?.rateUsed || 1),
      destinationId: String(item?.destinationId || ""),
      destinationName: String(item?.destinationName || item?.country || "Trip"),
      category: String(item?.category || "Other"),
      note: String(item?.note || ""),
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
    };
  }

  function normalizeTrip(raw) {
    const trip = emptyTrip();
    trip.id = String(raw?.id || uid("trip"));
    trip.name = String(raw?.name || "Trip");
    trip.startDate = String(raw?.startDate || "");
    trip.endDate = String(raw?.endDate || "");
    trip.travellers = {
      adults: Math.max(0, Number(raw?.travellers?.adults || 0)),
      children: Math.max(0, Number(raw?.travellers?.children || 0))
    };
    trip.budget = {
      configured: Boolean(raw?.budget?.configured),
      totalBudget: raw?.budget?.totalBudget === null || raw?.budget?.totalBudget === undefined ? null : Number(raw.budget.totalBudget),
      destinations: Array.isArray(raw?.budget?.destinations) ? raw.budget.destinations.map(normalizeDestination) : []
    };
    trip.dayMeta = raw?.dayMeta && typeof raw.dayMeta === "object" ? raw.dayMeta : {};
    trip.itinerary = Array.isArray(raw?.itinerary) ? raw.itinerary.map(normalizeItineraryItem) : [];
    return trip;
  }

  function migrateState(parsed) {
    if (!parsed || typeof parsed !== "object") return blankState();

    if (Number(parsed.version) >= 3 && parsed.trip) {
      return {
        version: APP_VERSION,
        trip: normalizeTrip(parsed.trip),
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses.map(normalizeExpense).filter(Boolean) : []
      };
    }

    if (Number(parsed.version) >= 2 && parsed.trip) {
      const old = parsed.trip;
      const trip = emptyTrip();
      trip.name = String(old.name || "Trip");
      trip.startDate = String(old.startDate || "");
      trip.endDate = String(old.endDate || "");
      trip.travellers = { adults: 0, children: 0 };
      trip.budget = {
        configured: true,
        totalBudget: Number(old.totalBudget || 0),
        destinations: Array.isArray(old.destinations) ? old.destinations.map(normalizeDestination) : []
      };
      return {
        version: APP_VERSION,
        trip,
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses.map(normalizeExpense).filter(Boolean) : []
      };
    }

    if (parsed.trip) {
      const old = parsed.trip;
      const trip = emptyTrip();
      trip.name = String(old.name || "Trip");
      trip.startDate = String(old.startDate || "");
      trip.endDate = String(old.endDate || "");
      trip.budget = {
        configured: true,
        totalBudget: Number(old.totalBudget || 0),
        destinations: [
          normalizeDestination({
            id: "legacy-china",
            name: "China",
            currency: "CNY",
            rate: Number(old.cnyRate || 5),
            startDate: old.startDate,
            endDate: old.endDate
          }),
          normalizeDestination({
            id: "legacy-japan",
            name: "Japan",
            currency: "JPY",
            rate: Number(old.jpyRate || 110),
            startDate: old.startDate,
            endDate: old.endDate
          })
        ]
      };
      return {
        version: APP_VERSION,
        trip,
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses.map(normalizeExpense).filter(Boolean) : []
      };
    }

    return blankState();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      const migrated = migrateState(JSON.parse(raw));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch {
      return blankState();
    }
  }

  function saveState() {
    state.version = APP_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function dayNumber(dateStr) {
    const [y, m, d] = String(dateStr).split("-").map(Number);
    if (![y, m, d].every(Number.isFinite)) return NaN;
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }

  function addDays(dateStr, days) {
    const n = dayNumber(dateStr);
    if (!Number.isFinite(n)) return "";
    const d = new Date((n + days) * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  function daysInclusive(start, end) {
    const a = dayNumber(start);
    const b = dayNumber(end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, b - a + 1);
  }

  function formatDate(dateStr, options = {}) {
    const [y, m, d] = String(dateStr).split("-").map(Number);
    if (![y, m, d].every(Number.isFinite)) return "";
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: options.year === false ? undefined : "numeric",
      weekday: options.weekday ? "short" : undefined
    }).format(dt);
  }

  function aud(value) {
    const n = Number(value);
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number.isFinite(n) ? n : 0);
  }

  function money(value, currency = "AUD") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: ["JPY", "KRW", "VND", "IDR"].includes(currency) ? 0 : 2
      }).format(n);
    } catch {
      return `${currency} ${n.toFixed(2)}`;
    }
  }

  function currencyOptions(selected) {
    return COMMON_CURRENCIES.map(([code, label]) =>
      `<option value="${code}" ${code === selected ? "selected" : ""}>${escapeHtml(label)}</option>`
    ).join("");
  }

  function tripDates() {
    if (!state.trip) return [];
    const count = daysInclusive(state.trip.startDate, state.trip.endDate);
    return Array.from({ length: count }, (_, i) => addDays(state.trip.startDate, i));
  }

  function defaultSelectedDate() {
    if (!state.trip) return "";
    const today = todayISO();
    const startN = dayNumber(state.trip.startDate);
    const endN = dayNumber(state.trip.endDate);
    const todayN = dayNumber(today);
    if (todayN < startN) return state.trip.startDate;
    if (todayN > endN) return state.trip.endDate;
    return today;
  }

  function makeDestinationDraft(startDate = "", endDate = "", name = "", currency = "AUD", rate = 1) {
    return { id: uid("dest"), name, currency, rate, startDate, endDate };
  }

  function cloneDestinations(list) {
    return list.map((d) => normalizeDestination({ ...d }));
  }

  function validateDestinations(destinations, tripStart, tripEnd, allowMissingRates = false) {
    if (!Array.isArray(destinations) || destinations.length < 1) return "Add at least one destination/currency period.";
    for (let i = 0; i < destinations.length; i++) {
      const d = destinations[i];
      if (!String(d.name || "").trim()) return `Destination ${i + 1}: enter a name.`;
      if (!d.startDate || !d.endDate) return `${d.name || `Destination ${i + 1}`}: enter both dates.`;
      if (dayNumber(d.endDate) < dayNumber(d.startDate)) return `${d.name}: end date must be on or after the start date.`;
      if (dayNumber(d.startDate) < dayNumber(tripStart) || dayNumber(d.endDate) > dayNumber(tripEnd)) {
        return `${d.name}: dates must sit within the overall trip dates.`;
      }
      if (!d.currency) return `${d.name}: choose a currency.`;
      if (!allowMissingRates && d.currency !== "AUD" && (!Number.isFinite(Number(d.rate)) || Number(d.rate) <= 0)) {
        return `${d.name}: enter a valid exchange rate.`;
      }
    }
    return "";
  }

  function validateTripCreate(name, startDate, endDate, totalBudget, destinations) {
    if (!name.trim()) return "Enter a trip name.";
    if (!startDate || !endDate) return "Enter both trip dates.";
    if (dayNumber(endDate) < dayNumber(startDate)) return "End date must be on or after the start date.";
    if (daysInclusive(startDate, endDate) > 400) return "Trip dates must be within 400 days.";
    if (!Number.isFinite(totalBudget) || totalBudget <= 0) return "Enter a budget greater than A$0.";
    return validateDestinations(destinations, startDate, endDate, false);
  }

  function destinationRowMarkup(item, mode, index, readOnlyDates = false) {
    const rateDisabled = item.currency === "AUD" ? "disabled" : "";
    const rateValue = item.currency === "AUD" ? "1" : (Number.isFinite(Number(item.rate)) ? Number(item.rate) : "");
    const rateLabel = item.currency === "AUD" ? "AUD per A$1" : `${item.currency} per A$1`;

    return `
      <div class="destination-row" data-mode="${mode}" data-index="${index}">
        <div class="destination-row-top">
          <label>
            Destination / country
            <input class="dest-name" type="text" maxlength="50" value="${escapeHtml(item.name)}" placeholder="Japan" required ${readOnlyDates ? "readonly" : ""}>
          </label>
          <label>
            Currency
            <select class="dest-currency" ${readOnlyDates ? "disabled" : ""}>${currencyOptions(item.currency)}</select>
          </label>
        </div>
        <div class="destination-row-bottom">
          <label>
            From
            <input class="dest-start" type="date" value="${escapeHtml(item.startDate)}" required ${readOnlyDates ? "readonly" : ""}>
          </label>
          <label>
            To
            <input class="dest-end" type="date" value="${escapeHtml(item.endDate)}" required ${readOnlyDates ? "readonly" : ""}>
          </label>
          <label>
            <span class="dest-rate-label">${escapeHtml(rateLabel)}</span>
            <input class="dest-rate" type="number" min="0.000001" step="0.000001" inputmode="decimal" value="${escapeHtml(rateValue)}" ${rateDisabled} required>
          </label>
        </div>
        ${readOnlyDates ? "" : `<button class="remove-destination" type="button">Remove destination</button>`}
      </div>`;
  }

  function renderDestinationDrafts(mode) {
    const list = mode === "setup" ? setupDraftDestinations : settingsDraftDestinations;
    const container = mode === "setup" ? el("setupDestinations") : el("settingsDestinations");
    container.innerHTML = list.map((item, index) => destinationRowMarkup(item, mode, index)).join("");
    container.querySelectorAll(".destination-row").forEach(bindDestinationRow);
  }

  function bindDestinationRow(row) {
    const mode = row.dataset.mode;
    const index = Number(row.dataset.index);
    const list = mode === "setup" ? setupDraftDestinations : settingsDraftDestinations;

    const sync = () => {
      const item = list[index];
      if (!item) return;
      item.name = row.querySelector(".dest-name").value.trim();
      item.currency = row.querySelector(".dest-currency").value;
      item.startDate = row.querySelector(".dest-start").value;
      item.endDate = row.querySelector(".dest-end").value;
      item.rate = item.currency === "AUD" ? 1 : Number(row.querySelector(".dest-rate").value);
    };

    row.querySelectorAll("input,select").forEach((control) => {
      control.addEventListener("input", sync);
      control.addEventListener("change", () => {
        sync();
        if (control.classList.contains("dest-currency")) renderDestinationDrafts(mode);
      });
    });

    row.querySelector(".remove-destination")?.addEventListener("click", () => {
      sync();
      if (list.length <= 1) {
        alert("A trip needs at least one destination/currency period.");
        return;
      }
      list.splice(index, 1);
      renderDestinationDrafts(mode);
    });
  }

  function showLanding() {
    setupVisible = false;
    render();
  }

  function showCreate() {
    setupVisible = true;
    if (setupDraftDestinations.length === 0) {
      setupDraftDestinations = [makeDestinationDraft("", "", "", "AUD", 1)];
    }
    render();
  }

  function renderVisibility() {
    const hasTrip = Boolean(state.trip);
    el("welcomePanel").classList.toggle("hidden", hasTrip || setupVisible);
    el("setupPanel").classList.toggle("hidden", hasTrip || !setupVisible);
    el("appPanel").classList.toggle("hidden", !hasTrip);
  }

  function renderHeader() {
    if (!state.trip) {
      el("headerTripName").textContent = "Travel Planner";
      el("headerTripDates").textContent = setupVisible ? "Create a new trip." : "Create or import a trip to begin.";
      return;
    }
    el("headerTripName").textContent = state.trip.name;
    el("headerTripDates").textContent = `${formatDate(state.trip.startDate)} – ${formatDate(state.trip.endDate)}`;
  }

  function renderDayStrip() {
    if (!state.trip) return;
    const dates = tripDates();
    if (!dates.includes(selectedItineraryDate)) selectedItineraryDate = defaultSelectedDate();

    el("dayStrip").innerHTML = dates.map((date, index) => `
      <button class="day-chip ${date === selectedItineraryDate ? "active" : ""}" type="button" data-date="${date}">
        <strong>Day ${index + 1}</strong>
        <span>${escapeHtml(formatDate(date, { year: false }))}</span>
      </button>
    `).join("");

    el("dayStrip").querySelectorAll(".day-chip").forEach((button) => {
      button.addEventListener("click", () => {
        selectedItineraryDate = button.dataset.date;
        renderItinerary();
      });
    });

    requestAnimationFrame(() => {
      el("dayStrip").querySelector(".day-chip.active")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
  }

  function durationFromTimes(start, end) {
    if (!start || !end) return "";
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if (![sh, sm, eh, em].every(Number.isFinite)) return "";
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }

  function itemTimeLabel(item) {
    if (item.startTime && item.endTime) return `${item.startTime} – ${item.endTime}`;
    if (item.startTime) return item.startTime;
    return "All day";
  }

  function itineraryItemMarkup(item) {
    const duration = item.durationText || durationFromTimes(item.startTime, item.endTime);
    const chips = [];
    if (duration) chips.push(duration);
    if (item.status) chips.push(item.status);
    if (item.participants) chips.push(item.participants);
    if (item.bookingRef) chips.push(`Ref: ${item.bookingRef}`);

    const hasCosts = Number.isFinite(Number(item.costTotal)) || Number.isFinite(Number(item.adultCost)) || Number.isFinite(Number(item.childCost));
    const costCurrency = item.costCurrency || "AUD";

    return `
      <article class="itinerary-item" data-itinerary-id="${escapeHtml(item.id)}">
        <div class="itinerary-item-main">
          <div class="item-topline">
            <span class="item-time">${escapeHtml(itemTimeLabel(item))}</span>
            <span class="item-type">${escapeHtml(item.type)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          ${item.location ? `<p class="item-location">${escapeHtml(item.location)}</p>` : ""}
          ${chips.length ? `<div class="item-details">${chips.map((c) => `<span class="detail-chip">${escapeHtml(c)}</span>`).join("")}</div>` : ""}
          ${hasCosts ? `
            <div class="item-cost-box">
              ${Number.isFinite(Number(item.costTotal)) ? `<strong>Total: ${escapeHtml(money(item.costTotal, costCurrency))}</strong>` : ""}
              <div class="per-person">
                ${Number.isFinite(Number(item.adultCost)) ? `Adult: ${escapeHtml(money(item.adultCost, costCurrency))} each` : ""}
                ${Number.isFinite(Number(item.adultCost)) && Number.isFinite(Number(item.childCost)) ? ` • ` : ""}
                ${Number.isFinite(Number(item.childCost)) ? `Child: ${escapeHtml(money(item.childCost, costCurrency))} each` : ""}
              </div>
            </div>` : ""}
          ${item.notes ? `<p class="item-notes">${escapeHtml(item.notes)}</p>` : ""}
        </div>
        <div class="item-actions">
          <button class="mini-btn edit-itinerary-item" type="button" data-id="${escapeHtml(item.id)}">Edit</button>
        </div>
      </article>`;
  }

  function renderItinerary() {
    if (!state.trip) return;
    renderDayStrip();

    const dates = tripDates();
    const dayIndex = dates.indexOf(selectedItineraryDate);
    const meta = state.trip.dayMeta?.[selectedItineraryDate] || {};
    const items = [...state.trip.itinerary]
      .filter((x) => x.date === selectedItineraryDate)
      .sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));

    el("itineraryDayLabel").textContent = `DAY ${dayIndex + 1} OF ${dates.length}`;
    el("itineraryDateTitle").textContent = formatDate(selectedItineraryDate, { weekday: true });
    el("itineraryHeadline").textContent = meta.headline || (items.length ? "Planned day" : "Nothing planned");
    el("itineraryLocation").textContent = meta.location || "";
    el("overnightBanner").classList.toggle("hidden", !meta.overnight);
    el("overnightBanner").textContent = meta.overnight ? `Overnight: ${meta.overnight}` : "";
    el("dayNotesBanner").classList.toggle("hidden", !meta.notes);
    el("dayNotesBanner").textContent = meta.notes || "";
    el("dayItemsHeading").textContent = items.length ? `${items.length} planned item${items.length === 1 ? "" : "s"}` : "Itinerary";

    const buckets = [
      ["All day", (x) => !x.startTime],
      ["Morning", (x) => x.startTime && x.startTime < "12:00"],
      ["Afternoon", (x) => x.startTime && x.startTime >= "12:00" && x.startTime < "17:00"],
      ["Evening", (x) => x.startTime && x.startTime >= "17:00"]
    ];

    el("itineraryItems").innerHTML = items.length
      ? buckets.map(([label, test]) => {
          const group = items.filter(test);
          if (!group.length) return "";
          return `<section class="day-part"><h3 class="day-part-heading">${label}</h3>${group.map(itineraryItemMarkup).join("")}</section>`;
        }).join("")
      : `<div class="empty-day"><strong>Nothing planned</strong><br><span>Add something, or leave it as a free day.</span></div>`;

    document.querySelectorAll(".edit-itinerary-item").forEach((button) => {
      button.addEventListener("click", () => openItineraryItemDialog(button.dataset.id));
    });

    el("prevDayBtn").disabled = dayIndex <= 0;
    el("nextDayBtn").disabled = dayIndex >= dates.length - 1;
  }

  function renderBudgetVisibility() {
    if (!state.trip) return;
    const configured = Boolean(state.trip.budget?.configured);
    el("budgetNotConfigured").classList.toggle("hidden", configured);
    el("budgetConfiguredArea").classList.toggle("hidden", !configured);
    if (!configured) renderConfigureBudgetForm();
  }

  function renderConfigureBudgetForm() {
    if (!state.trip) return;
    const destinations = state.trip.budget?.destinations || [];
    el("configureBudgetDestinations").innerHTML = destinations.map((d, i) => destinationRowMarkup(d, "configure", i, true)).join("");
    el("configureBudgetDestinations").querySelectorAll(".destination-row").forEach((row) => {
      const index = Number(row.dataset.index);
      const rateInput = row.querySelector(".dest-rate");
      if (rateInput) {
        rateInput.addEventListener("input", () => {
          const d = state.trip.budget.destinations[index];
          if (d) d.rate = d.currency === "AUD" ? 1 : Number(rateInput.value);
        });
      }
    });
  }

  function destinationById(id) {
    return state.trip?.budget?.destinations?.find((d) => d.id === id) || null;
  }

  function rateFor(destination, currency) {
    if (currency === "AUD") return 1;
    if (!destination || destination.currency !== currency) return 1;
    const rate = Number(destination.rate);
    return Number.isFinite(rate) && rate > 0 ? rate : 1;
  }

  function amountToAud(amount, currency, destination) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    return currency === "AUD" ? n : n / rateFor(destination, currency);
  }

  function totalSpent(expenses = state.expenses) {
    return expenses.reduce((sum, item) => sum + Number(item.audAmount || 0), 0);
  }

  function expensesOn(dateStr) {
    return state.expenses.filter((item) => item.date === dateStr);
  }

  function futureDaysAfterToday(trip, today) {
    const todayN = dayNumber(today);
    const startN = dayNumber(trip.startDate);
    const endN = dayNumber(trip.endDate);
    if (todayN < startN) return daysInclusive(trip.startDate, trip.endDate);
    if (todayN >= endN) return 0;
    return endN - todayN;
  }

  function tripStats() {
    const trip = state.trip;
    if (!trip?.budget?.configured) return null;

    const today = todayISO();
    const startN = dayNumber(trip.startDate);
    const endN = dayNumber(trip.endDate);
    const todayN = dayNumber(today);
    const totalDays = daysInclusive(trip.startDate, trip.endDate);
    const spent = totalSpent();
    const remaining = Number(trip.budget.totalBudget) - spent;
    const futureDays = futureDaysAfterToday(trip, today);

    let status = "during";
    let dayIndex = 0;
    let elapsedDays = 0;

    if (todayN < startN) status = "before";
    else if (todayN > endN) {
      status = "after";
      dayIndex = totalDays;
      elapsedDays = totalDays;
    } else {
      dayIndex = todayN - startN + 1;
      elapsedDays = dayIndex;
    }

    const availablePerFutureDay = futureDays > 0 ? remaining / futureDays : 0;
    const originalDaily = totalDays > 0 ? Number(trip.budget.totalBudget) / totalDays : 0;
    const expectedSpent = originalDaily * elapsedDays;
    const pace = expectedSpent - spent;

    return {
      today, totalDays, spent, remaining, status, dayIndex, elapsedDays, futureDays,
      availablePerFutureDay, originalDaily, expectedSpent, pace,
      spentToday: totalSpent(expensesOn(today))
    };
  }

  function renderDashboard() {
    const stats = tripStats();
    if (!stats) return;
    const budget = Number(state.trip.budget.totalBudget);

    el("remainingBudget").textContent = aud(stats.remaining);
    el("remainingBudget").classList.toggle("bad", stats.remaining < 0);
    el("daysRemaining").textContent = stats.futureDays === 1 ? "1 future day" : `${stats.futureDays} future days`;
    el("tripDay").textContent =
      stats.status === "before" ? `Trip starts ${formatDate(state.trip.startDate, { year: false })}` :
      stats.status === "after" ? `Trip finished • ${stats.totalDays} days` :
      `Trip day ${stats.dayIndex} of ${stats.totalDays}`;

    el("dailyAllowance").textContent = aud(stats.availablePerFutureDay);
    el("spentToday").textContent = aud(stats.spentToday);
    el("todayLocalDate").textContent = formatDate(stats.today, { weekday: true });
    el("totalSpent").textContent = aud(stats.spent);

    const spentPct = budget > 0 ? (stats.spent / budget) * 100 : 0;
    el("spentPercent").textContent = `${Math.max(0, spentPct).toFixed(1)}% of budget`;

    const paceEl = el("paceValue");
    const paceNote = el("paceNote");
    paceEl.classList.remove("good", "bad", "warn");

    if (stats.status === "before") {
      paceEl.textContent = aud(0);
      paceNote.textContent = "Trip has not started yet";
    } else {
      paceEl.textContent = `${stats.pace >= 0 ? "+" : "−"}${aud(Math.abs(stats.pace))}`;
      if (Math.abs(stats.pace) < 0.01) {
        paceEl.classList.add("warn");
        paceNote.textContent = "Right on your even-spend pace";
      } else if (stats.pace > 0) {
        paceEl.classList.add("good");
        paceNote.textContent = "Ahead of your even-spend pace";
      } else {
        paceEl.classList.add("bad");
        paceNote.textContent = "Behind your even-spend pace";
      }
    }

    const clampedPct = Math.max(0, Math.min(100, spentPct));
    el("budgetProgress").style.width = `${clampedPct}%`;
    el("budgetProgress").style.background = spentPct > 100 ? "#b91c1c" : "";
    el("progressUsed").textContent = `${Math.max(0, spentPct).toFixed(0)}% used`;
    el("progressRemaining").textContent =
      stats.remaining >= 0 ? `${Math.max(0, 100 - spentPct).toFixed(0)}% left` : `${aud(Math.abs(stats.remaining))} over`;

    if (stats.status === "before") {
      const until = dayNumber(state.trip.startDate) - dayNumber(stats.today);
      el("tripStatus").textContent = `Your trip starts in ${until} day${until === 1 ? "" : "s"}. Before the trip, available/day is spread across all trip days.`;
    } else if (stats.status === "after") {
      el("tripStatus").textContent = `This trip ended on ${formatDate(state.trip.endDate)}. Your history remains available.`;
    } else if (stats.futureDays === 0) {
      el("tripStatus").textContent = `Today is the final day. Remaining budget is shown above; there are no future days to redistribute it across.`;
    } else {
      el("tripStatus").textContent = `Today is day ${stats.dayIndex} of ${stats.totalDays}. Future daily allowance excludes today and updates immediately as you spend.`;
    }
  }

  function matchingDestinationsForDate(dateStr) {
    if (!state.trip || !dateStr) return [];
    const n = dayNumber(dateStr);
    return (state.trip.budget.destinations || []).filter((d) => n >= dayNumber(d.startDate) && n <= dayNumber(d.endDate));
  }

  function setExpenseDestinationOptions(selectedId = "") {
    if (!state.trip?.budget?.configured) return;
    const select = el("expenseDestination");
    const destinations = state.trip.budget.destinations || [];
    select.innerHTML = destinations.map((d) =>
      `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`
    ).join("");
    if (selectedId && destinations.some((d) => d.id === selectedId)) select.value = selectedId;
    else if (destinations.length) select.value = destinations[0].id;
    updateExpenseCurrencyOptions();
  }

  function autoDestinationForDate() {
    if (!state.trip?.budget?.configured) return;
    const date = el("expenseDate").value;
    const matches = matchingDestinationsForDate(date);
    if (matches.length === 1) el("expenseDestination").value = matches[0].id;
    else if (matches.length > 1 && !matches.some((d) => d.id === el("expenseDestination").value)) {
      el("expenseDestination").value = matches[0].id;
    }
    updateExpenseCurrencyOptions();
  }

  function updateExpenseCurrencyOptions(preferred = "") {
    if (!state.trip?.budget?.configured) return;
    const destination = destinationById(el("expenseDestination").value);
    const localCurrency = destination?.currency || "AUD";
    const options = localCurrency === "AUD" ? [["AUD", "AUD $"]] : [["AUD", "AUD $"], [localCurrency, `${localCurrency} local`]];
    const select = el("expenseCurrency");
    const current = preferred || select.value;
    select.innerHTML = options.map(([code, label]) => `<option value="${code}">${escapeHtml(label)}</option>`).join("");
    select.value = options.some(([code]) => code === current) ? current : localCurrency;
    updateConversionPreview();
  }

  function setDefaultExpenseDate() {
    if (!state.trip?.budget?.configured || el("editingExpenseId").value) return;
    const today = todayISO();
    if (dayNumber(today) < dayNumber(state.trip.startDate)) el("expenseDate").value = state.trip.startDate;
    else if (dayNumber(today) > dayNumber(state.trip.endDate)) el("expenseDate").value = state.trip.endDate;
    else el("expenseDate").value = today;
    autoDestinationForDate();
  }

  function updateConversionPreview() {
    if (!state.trip?.budget?.configured) return;
    const amount = Number(el("expenseAmount").value);
    const currency = el("expenseCurrency").value;
    const destination = destinationById(el("expenseDestination").value);
    if (!Number.isFinite(amount) || amount <= 0) {
      el("conversionPreview").textContent = "";
      return;
    }
    const converted = amountToAud(amount, currency, destination);
    if (currency === "AUD") {
      el("conversionPreview").textContent = `${aud(converted)} will be deducted from the trip budget.`;
    } else {
      el("conversionPreview").textContent = `${money(amount, currency)} ≈ ${aud(converted)} at ${rateFor(destination, currency)} ${currency} per A$1.`;
    }
  }

  function expenseMarkup(item) {
    const title = item.note?.trim() || item.category;
    const destinationName = item.destinationName || destinationById(item.destinationId)?.name || "Trip";
    const meta = `${formatDate(item.date, { weekday: true })} • ${item.category} • ${destinationName}`;
    return `
      <article class="expense-item">
        <div class="expense-main">
          <div class="expense-title"><strong>${escapeHtml(title)}</strong></div>
          <div class="expense-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="expense-amount">
          <strong>${escapeHtml(aud(item.audAmount))}</strong>
          ${item.currency !== "AUD" ? `<span>${escapeHtml(money(item.amount, item.currency))}</span>` : ""}
        </div>
        <div class="expense-actions">
          <button class="mini-btn edit-expense" type="button" data-id="${escapeHtml(item.id)}">Edit</button>
          <button class="mini-btn delete delete-expense" type="button" data-id="${escapeHtml(item.id)}">Delete</button>
        </div>
      </article>`;
  }

  function sortedExpenses(list = state.expenses) {
    return [...list].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
  }

  function renderHistoryFilter() {
    if (!state.trip?.budget?.configured) return;
    const select = el("historyFilter");
    const current = select.value || "all";
    select.innerHTML = `<option value="all">All destinations</option>` +
      state.trip.budget.destinations.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join("");
    select.value = [...select.options].some((o) => o.value === current) ? current : "all";
  }

  function renderExpenses() {
    if (!state.trip?.budget?.configured) return;
    const sorted = sortedExpenses();
    el("recentExpenses").innerHTML = sorted.length ? sorted.slice(0, 5).map(expenseMarkup).join("") :
      `<p class="expense-empty">No expenses yet. Your first entry will appear here.</p>`;

    const filter = el("historyFilter").value;
    const filtered = filter === "all" ? sorted : sorted.filter((x) => x.destinationId === filter);
    el("historyExpenses").innerHTML = filtered.length ? filtered.map(expenseMarkup).join("") :
      `<p class="expense-empty">No expenses match this filter.</p>`;

    el("historySummary").innerHTML = `
      <span class="summary-chip">${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}</span>
      <span class="summary-chip">${escapeHtml(aud(totalSpent(filtered)))} total</span>`;
  }

  function dayBudgetRows() {
    if (!state.trip?.budget?.configured) return [];
    const totalDays = daysInclusive(state.trip.startDate, state.trip.endDate);
    const today = todayISO();
    const todayN = dayNumber(today);
    const startN = dayNumber(state.trip.startDate);
    const endN = dayNumber(state.trip.endDate);
    let remainingBudget = Number(state.trip.budget.totalBudget);
    let currentFutureAllocation = null;
    const rows = [];

    for (let i = 0; i < totalDays; i++) {
      const date = addDays(state.trip.startDate, i);
      const dateN = dayNumber(date);
      const remainingDaysAtStart = totalDays - i;
      const spent = totalSpent(expensesOn(date));
      let allocation;

      if (todayN < startN) allocation = totalDays > 0 ? Number(state.trip.budget.totalBudget) / totalDays : 0;
      else if (todayN > endN || dateN <= todayN) allocation = remainingDaysAtStart > 0 ? remainingBudget / remainingDaysAtStart : 0;
      else {
        if (currentFutureAllocation === null) {
          const futureDays = endN - todayN;
          currentFutureAllocation = futureDays > 0 ? remainingBudget / futureDays : 0;
        }
        allocation = currentFutureAllocation;
      }

      const matches = matchingDestinationsForDate(date);
      rows.push({
        day: i + 1,
        date,
        allocation,
        spent,
        variance: allocation - spent,
        destinations: matches.map((d) => d.name)
      });

      if (todayN > endN || dateN <= todayN) remainingBudget -= spent;
    }
    return rows;
  }

  function renderDailyHistory() {
    if (!state.trip?.budget?.configured) return;
    const today = todayISO();
    const todayN = dayNumber(today);

    el("dailyHistory").innerHTML = dayBudgetRows().map((row) => {
      const isToday = row.date === today;
      const isFuture = dayNumber(row.date) > todayN;
      const varianceText = `${row.variance >= 0 ? "+" : "−"}${aud(Math.abs(row.variance))}`;
      return `
        <article class="day-row ${isToday ? "today-row" : ""} ${isFuture ? "future-row" : ""}">
          <div class="day-name">
            <strong>Day ${row.day}${isToday ? " • Today" : ""}</strong>
            <span>${escapeHtml(formatDate(row.date, { weekday: true }))} • ${escapeHtml(row.destinations.join(" / ") || "—")}</span>
          </div>
          <div class="day-cell"><span>Allocation</span><strong>${escapeHtml(aud(row.allocation))}</strong></div>
          <div class="day-cell"><span>Spent</span><strong>${escapeHtml(aud(row.spent))}</strong></div>
          <div class="day-cell day-variance ${row.variance >= 0 ? "good" : "bad"}"><span>Variance</span><strong>${escapeHtml(varianceText)}</strong></div>
        </article>`;
    }).join("");
  }

  function renderSettings() {
    if (!state.trip?.budget?.configured) return;
    el("settingsTripName").value = state.trip.name;
    el("settingsStartDate").value = state.trip.startDate;
    el("settingsEndDate").value = state.trip.endDate;
    el("settingsBudget").value = state.trip.budget.totalBudget;
    if (settingsDraftDestinations.length === 0) {
      settingsDraftDestinations = cloneDestinations(state.trip.budget.destinations || []);
      renderDestinationDrafts("settings");
    }
  }

  function render() {
    renderVisibility();
    renderHeader();

    if (!state.trip) {
      if (setupVisible) renderDestinationDrafts("setup");
      return;
    }

    if (!selectedItineraryDate) selectedItineraryDate = defaultSelectedDate();
    renderItinerary();
    renderBudgetVisibility();

    if (state.trip.budget?.configured) {
      renderDashboard();
      renderHistoryFilter();
      renderExpenses();
      renderDailyHistory();
      renderSettings();
      const currentDest = el("expenseDestination").value;
      setExpenseDestinationOptions(currentDest);
      setDefaultExpenseDate();
      updateConversionPreview();
    }
  }

  function activateMode(mode) {
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    document.querySelectorAll(".mode-panel").forEach((p) => p.classList.toggle("active", p.dataset.modePanel === mode));
    if (mode === "budget") renderBudgetVisibility();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function activateBudgetTab(name) {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.budgetTab === name));
    document.querySelectorAll(".budget-tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.budgetPanel === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function importTripFile(file, messageElement) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let importedRaw = parsed;

      if (parsed?.kind === "travel-planner-trip" && parsed?.trip) {
        importedRaw = { version: 3, trip: parsed.trip, expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [] };
      } else if (parsed?.data) {
        importedRaw = parsed.data;
      }

      const imported = migrateState(importedRaw);
      if (!imported.trip?.startDate || !imported.trip?.endDate || !imported.trip?.name) {
        throw new Error("This file does not contain a valid trip.");
      }
      if (dayNumber(imported.trip.endDate) < dayNumber(imported.trip.startDate)) {
        throw new Error("Trip dates are invalid.");
      }

      state = imported;
      setupVisible = false;
      selectedItineraryDate = defaultSelectedDate();
      settingsDraftDestinations = [];
      saveState();
      render();
      activateMode("itinerary");
      if (messageElement) messageElement.textContent = "Trip imported.";
    } catch (error) {
      if (messageElement) messageElement.textContent = `Could not import trip: ${error.message}`;
    }
  }

  async function exportTrip(messageElement) {
    if (!state.trip) return;
    const payload = {
      kind: "travel-planner-trip",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      trip: state.trip,
      expenses: state.expenses
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const safeName = state.trip.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "trip";
    const filename = `${safeName}-${todayISO()}.trip.json`;
    const file = new File([blob], filename, { type: "application/json" });

    try {
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: state.trip.name, text: "Travel Planner trip file", files: [file] });
        if (messageElement) messageElement.textContent = "Trip file ready to save or share.";
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (messageElement) messageElement.textContent = "Trip file downloaded.";
  }

  function openItineraryItemDialog(id = "") {
    if (!state.trip) return;
    const item = id ? state.trip.itinerary.find((x) => x.id === id) : null;

    el("itineraryItemId").value = item?.id || "";
    el("itemDialogTitle").textContent = item ? "Edit item" : "Add item";
    el("itemDate").value = item?.date || selectedItineraryDate;
    el("itemType").value = item?.type || "Activity";
    el("itemTitle").value = item?.title || "";
    el("itemStartTime").value = item?.startTime || "";
    el("itemEndTime").value = item?.endTime || "";
    el("itemDurationText").value = item?.durationText || "";
    el("itemLocation").value = item?.location || "";
    el("itemStatus").value = item?.status || "Planned";
    el("itemBookingRef").value = item?.bookingRef || "";
    el("itemCostTotal").value = Number.isFinite(Number(item?.costTotal)) ? item.costTotal : "";
    el("itemAdultCost").value = Number.isFinite(Number(item?.adultCost)) ? item.adultCost : "";
    el("itemChildCost").value = Number.isFinite(Number(item?.childCost)) ? item.childCost : "";
    el("itemNotes").value = item?.notes || "";
    el("itemError").textContent = "";
    el("deleteItemBtn").classList.toggle("hidden", !item);

    const currencies = new Set(["AUD"]);
    (state.trip.budget?.destinations || []).forEach((d) => currencies.add(d.currency));
    el("itemCostCurrency").innerHTML = [...currencies].map((code) => `<option value="${code}">${code}</option>`).join("");
    el("itemCostCurrency").value = item?.costCurrency || "AUD";

    const dialog = el("itineraryItemDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function closeItineraryItemDialog() {
    el("itineraryItemDialog").close();
  }

  function openDayDialog() {
    const meta = state.trip?.dayMeta?.[selectedItineraryDate] || {};
    el("dayDate").value = selectedItineraryDate;
    el("dayHeadline").value = meta.headline || "";
    el("dayLocation").value = meta.location || "";
    el("dayOvernight").value = meta.overnight || "";
    el("dayNotes").value = meta.notes || "";
    el("dayDialog").showModal();
  }

  el("welcomeCreateBtn").addEventListener("click", showCreate);
  el("cancelCreateBtn").addEventListener("click", showLanding);
  el("welcomeImportBtn").addEventListener("click", () => el("welcomeImportInput").click());

  el("welcomeImportInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importTripFile(file, el("welcomeMessage"));
    event.target.value = "";
  });

  el("startDate").addEventListener("change", () => {
    if (setupDraftDestinations.length === 1 && !setupDraftDestinations[0].startDate) {
      setupDraftDestinations[0].startDate = el("startDate").value;
    }
    renderDestinationDrafts("setup");
  });

  el("endDate").addEventListener("change", () => {
    if (setupDraftDestinations.length === 1 && !setupDraftDestinations[0].endDate) {
      setupDraftDestinations[0].endDate = el("endDate").value;
    }
    renderDestinationDrafts("setup");
  });

  el("addSetupDestinationBtn").addEventListener("click", () => {
    setupDraftDestinations.push(makeDestinationDraft(el("startDate").value, el("endDate").value, "", "AUD", 1));
    renderDestinationDrafts("setup");
  });

  el("setupForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const destinations = cloneDestinations(setupDraftDestinations);
    const error = validateTripCreate(
      el("tripName").value.trim(),
      el("startDate").value,
      el("endDate").value,
      Number(el("totalBudget").value),
      destinations
    );
    el("setupError").textContent = error;
    if (error) return;

    const trip = emptyTrip();
    trip.name = el("tripName").value.trim();
    trip.startDate = el("startDate").value;
    trip.endDate = el("endDate").value;
    trip.travellers = {
      adults: Math.max(0, Number(el("adultCount").value || 0)),
      children: Math.max(0, Number(el("childCount").value || 0))
    };
    trip.budget = {
      configured: true,
      totalBudget: Number(el("totalBudget").value),
      destinations
    };

    state = { version: APP_VERSION, trip, expenses: [] };
    setupVisible = false;
    selectedItineraryDate = trip.startDate;
    settingsDraftDestinations = [];
    saveState();
    render();
    activateMode("itinerary");
  });

  document.querySelectorAll(".mode-btn").forEach((button) => {
    button.addEventListener("click", () => activateMode(button.dataset.mode));
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => activateBudgetTab(button.dataset.budgetTab));
  });

  el("prevDayBtn").addEventListener("click", () => {
    const dates = tripDates();
    const index = dates.indexOf(selectedItineraryDate);
    if (index > 0) {
      selectedItineraryDate = dates[index - 1];
      renderItinerary();
    }
  });

  el("nextDayBtn").addEventListener("click", () => {
    const dates = tripDates();
    const index = dates.indexOf(selectedItineraryDate);
    if (index >= 0 && index < dates.length - 1) {
      selectedItineraryDate = dates[index + 1];
      renderItinerary();
    }
  });

  el("addItineraryItemBtn").addEventListener("click", () => openItineraryItemDialog());
  el("closeItemDialogBtn").addEventListener("click", closeItineraryItemDialog);
  el("editDayBtn").addEventListener("click", openDayDialog);
  el("closeDayDialogBtn").addEventListener("click", () => el("dayDialog").close());

  el("itineraryItemForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = el("itineraryItemId").value;
    const date = el("itemDate").value;
    const title = el("itemTitle").value.trim();

    if (!date || dayNumber(date) < dayNumber(state.trip.startDate) || dayNumber(date) > dayNumber(state.trip.endDate)) {
      el("itemError").textContent = "Choose a date within the trip.";
      return;
    }
    if (!title) {
      el("itemError").textContent = "Enter a title.";
      return;
    }

    const existing = id ? state.trip.itinerary.find((x) => x.id === id) : null;
    const item = normalizeItineraryItem({
      id: existing?.id || uid("itin"),
      date,
      type: el("itemType").value,
      title,
      startTime: el("itemStartTime").value,
      endTime: el("itemEndTime").value,
      durationText: el("itemDurationText").value.trim(),
      location: el("itemLocation").value.trim(),
      status: el("itemStatus").value,
      bookingRef: el("itemBookingRef").value.trim(),
      costTotal: el("itemCostTotal").value === "" ? null : Number(el("itemCostTotal").value),
      adultCost: el("itemAdultCost").value === "" ? null : Number(el("itemAdultCost").value),
      childCost: el("itemChildCost").value === "" ? null : Number(el("itemChildCost").value),
      costCurrency: el("itemCostCurrency").value,
      notes: el("itemNotes").value.trim(),
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    if (existing) state.trip.itinerary = state.trip.itinerary.map((x) => x.id === id ? item : x);
    else state.trip.itinerary.push(item);

    selectedItineraryDate = date;
    saveState();
    closeItineraryItemDialog();
    renderItinerary();
  });

  el("deleteItemBtn").addEventListener("click", () => {
    const id = el("itineraryItemId").value;
    const item = state.trip?.itinerary.find((x) => x.id === id);
    if (!item) return;
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    state.trip.itinerary = state.trip.itinerary.filter((x) => x.id !== id);
    saveState();
    closeItineraryItemDialog();
    renderItinerary();
  });

  el("dayForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.trip.dayMeta[selectedItineraryDate] = {
      headline: el("dayHeadline").value.trim(),
      location: el("dayLocation").value.trim(),
      overnight: el("dayOvernight").value.trim(),
      notes: el("dayNotes").value.trim()
    };
    saveState();
    el("dayDialog").close();
    renderItinerary();
  });

  el("quickExportBtn").addEventListener("click", () => exportTrip(el("quickExportMessage")));
  el("exportBtn").addEventListener("click", () => exportTrip(el("backupMessage")));

  el("importInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file && window.confirm("Replace the trip on this device with the imported trip?")) {
      await importTripFile(file, el("backupMessage"));
    }
    event.target.value = "";
  });

  el("configureBudgetForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const total = Number(el("configureBudgetTotal").value);
    if (!Number.isFinite(total) || total <= 0) {
      el("configureBudgetError").textContent = "Enter a budget greater than A$0.";
      return;
    }

    for (const d of state.trip.budget.destinations) {
      if (d.currency !== "AUD" && (!Number.isFinite(Number(d.rate)) || Number(d.rate) <= 0)) {
        el("configureBudgetError").textContent = `Enter a valid ${d.currency} rate for ${d.name}.`;
        return;
      }
      if (d.currency === "AUD") d.rate = 1;
    }

    state.trip.budget.totalBudget = total;
    state.trip.budget.configured = true;
    saveState();
    settingsDraftDestinations = [];
    render();
    activateMode("budget");
  });

  el("expenseDate").addEventListener("change", autoDestinationForDate);
  el("expenseDestination").addEventListener("change", () => updateExpenseCurrencyOptions());
  ["expenseAmount", "expenseCurrency"].forEach((id) => {
    el(id).addEventListener("input", updateConversionPreview);
    el(id).addEventListener("change", updateConversionPreview);
  });

  el("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = el("editingExpenseId").value;
    const amount = Number(el("expenseAmount").value);
    const currency = el("expenseCurrency").value;
    const date = el("expenseDate").value;
    const destination = destinationById(el("expenseDestination").value);

    let error = "";
    if (!date) error = "Choose an expense date.";
    else if (dayNumber(date) < dayNumber(state.trip.startDate) || dayNumber(date) > dayNumber(state.trip.endDate)) error = "Expense date must be within the trip dates.";
    else if (!destination) error = "Choose a destination.";
    else if (!Number.isFinite(amount) || amount <= 0) error = "Enter an amount greater than zero.";

    el("expenseError").textContent = error;
    if (error) return;

    const existing = id ? state.expenses.find((x) => x.id === id) : null;
    const item = {
      id: existing?.id || uid("exp"),
      date,
      amount,
      currency,
      audAmount: amountToAud(amount, currency, destination),
      rateUsed: rateFor(destination, currency),
      destinationId: destination.id,
      destinationName: destination.name,
      category: el("expenseCategory").value,
      note: el("expenseNote").value.trim(),
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    if (existing) state.expenses = state.expenses.map((x) => x.id === id ? item : x);
    else state.expenses.push(item);

    saveState();
    clearExpenseForm();
    render();
  });

  function clearExpenseForm() {
    el("editingExpenseId").value = "";
    el("expenseAmount").value = "";
    el("expenseNote").value = "";
    el("expenseError").textContent = "";
    el("expenseFormHeading").textContent = "Add expense";
    el("saveExpenseBtn").textContent = "Add expense";
    el("cancelEditBtn").classList.add("hidden");
    setDefaultExpenseDate();
    updateConversionPreview();
  }

  function editExpense(id) {
    const item = state.expenses.find((x) => x.id === id);
    if (!item) return;
    activateMode("budget");
    activateBudgetTab("today");
    el("editingExpenseId").value = item.id;
    el("expenseDate").value = item.date;
    setExpenseDestinationOptions(item.destinationId);
    el("expenseDestination").value = item.destinationId;
    updateExpenseCurrencyOptions(item.currency);
    el("expenseCurrency").value = item.currency;
    el("expenseAmount").value = item.amount;
    el("expenseCategory").value = item.category;
    el("expenseNote").value = item.note || "";
    el("expenseFormHeading").textContent = "Edit expense";
    el("saveExpenseBtn").textContent = "Save changes";
    el("cancelEditBtn").classList.remove("hidden");
    updateConversionPreview();
    el("expenseAmount").focus();
    el("expenseFormHeading").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function deleteExpense(id) {
    const item = state.expenses.find((x) => x.id === id);
    if (!item) return;
    const label = item.note?.trim() || item.category;
    if (!window.confirm(`Delete "${label}" for ${aud(item.audAmount)}?`)) return;
    state.expenses = state.expenses.filter((x) => x.id !== id);
    if (el("editingExpenseId").value === id) clearExpenseForm();
    saveState();
    render();
  }

  document.addEventListener("click", (event) => {
    const edit = event.target.closest(".edit-expense");
    if (edit) editExpense(edit.dataset.id);
    const del = event.target.closest(".delete-expense");
    if (del) deleteExpense(del.dataset.id);
  });

  el("cancelEditBtn").addEventListener("click", clearExpenseForm);
  el("viewAllBtn").addEventListener("click", () => activateBudgetTab("history"));
  el("historyFilter").addEventListener("change", renderExpenses);

  el("addSettingsDestinationBtn").addEventListener("click", () => {
    settingsDraftDestinations.push(makeDestinationDraft(
      el("settingsStartDate").value,
      el("settingsEndDate").value,
      "",
      "AUD",
      1
    ));
    renderDestinationDrafts("settings");
  });

  el("settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const nextName = el("settingsTripName").value.trim();
    const nextStart = el("settingsStartDate").value;
    const nextEnd = el("settingsEndDate").value;
    const nextBudget = Number(el("settingsBudget").value);
    const destinations = cloneDestinations(settingsDraftDestinations);

    const error = validateTripCreate(nextName, nextStart, nextEnd, nextBudget, destinations);
    el("settingsError").textContent = error;
    if (error) return;

    const destinationIds = new Set(destinations.map((d) => d.id));
    if (state.expenses.some((x) => x.destinationId && !destinationIds.has(x.destinationId))) {
      el("settingsError").textContent = "You cannot remove a destination that already has expenses. Reassign or delete those expenses first.";
      return;
    }

    state.trip.name = nextName;
    state.trip.startDate = nextStart;
    state.trip.endDate = nextEnd;
    state.trip.budget.totalBudget = nextBudget;
    state.trip.budget.destinations = destinations;

    state.expenses = state.expenses.map((item) => {
      const d = destinations.find((x) => x.id === item.destinationId);
      return { ...item, destinationName: d?.name || item.destinationName };
    });

    saveState();
    selectedItineraryDate = defaultSelectedDate();
    settingsDraftDestinations = cloneDestinations(destinations);
    render();
    el("backupMessage").textContent = "Settings saved.";
  });

  el("resetBtn").addEventListener("click", () => {
    if (typeof el("confirmDialog").showModal === "function") el("confirmDialog").showModal();
    else if (window.confirm("Erase this trip from this device?")) resetAll();
  });

  el("confirmDialog").addEventListener("close", () => {
    if (el("confirmDialog").returnValue === "confirm") resetAll();
  });

  function resetAll() {
    state = blankState();
    localStorage.removeItem(STORAGE_KEY);
    setupDraftDestinations = [];
    settingsDraftDestinations = [];
    selectedItineraryDate = "";
    setupVisible = false;
    render();
    activateMode("itinerary");
  }

  function updateConnection() {
    const badge = el("connectionBadge");
    const online = navigator.onLine;
    badge.textContent = online ? "Online" : "Offline";
    badge.classList.toggle("online", online);
    badge.classList.toggle("offline", !online);
  }

  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  updateConnection();
  render();
})();
