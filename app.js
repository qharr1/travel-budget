(() => {
  "use strict";

  const STORAGE_KEY = "tripBudgetApp.v1";
  const UI_SETTINGS_KEY = "travelPlanner.ui.v1";
  const APP_VERSION = 28;

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
  let uiSettings = loadUiSettings();
  let setupDraftDestinations = [];
  let settingsDraftDestinations = [];
  let selectedItineraryDate = "";
  let itineraryViewMode = uiSettings.itineraryDefaultView;
  let lastNonSettingsMode = uiSettings.startScreen;
  let setupVisible = false;
  let lastObservedCalendarDate = todayISO();
  let directionsTarget = "";
  let pendingPlaceToScheduleId = "";
  let reminderTimer = null;
  let vaultDbPromise = null;

  function defaultUiSettings() {
    return {
      startScreen: "home",
      appearance: "light",
      itineraryDefaultView: "day",
      homeNextCount: 3,
      homeWidgets: {
        budget: true,
        preTrip: true,
        upNext: true,
        tonight: true,
        payments: true,
        reminders: true,
        notes: true
      },
      summaryWidgets: {
        hero: true,
        paid: true,
        outstanding: true,
        unpriced: true,
        priced: true,
        progress: true,
        breakdown: true,
        costResponsibility: true,
        outstandingList: true
      }
    };
  }

  function normalizeUiSettings(raw) {
    const defaults = defaultUiSettings();
    const startScreens = ["home", "itinerary", "map", "summary", "budget", "more"];
    return {
      startScreen: startScreens.includes(raw?.startScreen) ? raw.startScreen : defaults.startScreen,
      appearance: ["system", "light", "dark"].includes(raw?.appearance) ? raw.appearance : defaults.appearance,
      itineraryDefaultView: raw?.itineraryDefaultView === "full" ? "full" : "day",
      homeNextCount: [1, 2, 3, 5].includes(Number(raw?.homeNextCount)) ? Number(raw.homeNextCount) : defaults.homeNextCount,
      homeWidgets: { ...defaults.homeWidgets, ...(raw?.homeWidgets || {}) },
      summaryWidgets: { ...defaults.summaryWidgets, ...(raw?.summaryWidgets || {}) }
    };
  }

  function loadUiSettings() {
    try {
      const raw = localStorage.getItem(UI_SETTINGS_KEY);
      return raw ? normalizeUiSettings(JSON.parse(raw)) : defaultUiSettings();
    } catch {
      return defaultUiSettings();
    }
  }

  function saveUiSettings() {
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(uiSettings));
  }

  function setHiddenByPreference(id, visible) {
    const node = el(id);
    if (node) node.classList.toggle("hidden", !visible);
  }

  function applyHomeWidgetVisibility() {
    setHiddenByPreference("homeBudgetWidget", uiSettings.homeWidgets.budget);
    setHiddenByPreference("homeUpNextWidget", uiSettings.homeWidgets.upNext);
    setHiddenByPreference("homeTonightWidget", uiSettings.homeWidgets.tonight);
    setHiddenByPreference("homePaymentsWidget", uiSettings.homeWidgets.payments);
    setHiddenByPreference("homeRemindersWidget", uiSettings.homeWidgets.reminders);
    if (!uiSettings.homeWidgets.preTrip) el("homePreTripWarning")?.classList.add("hidden");
    if (!uiSettings.homeWidgets.notes) el("homeDayNotesCard")?.classList.add("hidden");
  }

  function applySummaryWidgetVisibility() {
    const map = {
      summaryHeroWidget: uiSettings.summaryWidgets.hero,
      summaryPaidWidget: uiSettings.summaryWidgets.paid,
      summaryOutstandingWidget: uiSettings.summaryWidgets.outstanding,
      summaryUnpricedWidget: uiSettings.summaryWidgets.unpriced,
      summaryPricedWidget: uiSettings.summaryWidgets.priced,
      summaryProgressWidget: uiSettings.summaryWidgets.progress,
      summaryBreakdownWidget: uiSettings.summaryWidgets.breakdown,
      summaryCostResponsibilityWidget: uiSettings.summaryWidgets.costResponsibility,
      summaryOutstandingListWidget: uiSettings.summaryWidgets.outstandingList
    };
    Object.entries(map).forEach(([id, visible]) => setHiddenByPreference(id, visible));
  }

  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function resolvedTheme() {
    if (uiSettings.appearance === "dark") return "dark";
    if (uiSettings.appearance === "light") return "light";
    return systemThemeQuery.matches ? "dark" : "light";
  }

  function applyAppearance() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", theme === "dark" ? "#07111f" : "#0f172a");
    }
  }

  function renderUiSettings() {
    if (!el("settingsStartScreen")) return;
    el("settingsStartScreen").value = uiSettings.startScreen;
    el("settingsAppearance").value = uiSettings.appearance;
    el("settingsItineraryView").value = uiSettings.itineraryDefaultView;
    el("settingsHomeNextCount").value = String(uiSettings.homeNextCount);
    document.querySelectorAll("[data-home-widget]").forEach((input) => {
      input.checked = Boolean(uiSettings.homeWidgets[input.dataset.homeWidget]);
    });
    document.querySelectorAll("[data-summary-widget]").forEach((input) => {
      input.checked = Boolean(uiSettings.summaryWidgets[input.dataset.summaryWidget]);
    });
    applyAppearance();
    applyHomeWidgetVisibility();
    applySummaryWidgetVisibility();
  }

  function resetUiSettings() {
    uiSettings = defaultUiSettings();
    saveUiSettings();
    itineraryViewMode = uiSettings.itineraryDefaultView;
    renderUiSettings();
    renderHome();
    renderSummary();
    renderItinerary();
    el("layoutSettingsMessage").textContent = "Layout preferences reset.";
  }

  function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function blankState() {
    return { version: APP_VERSION, trip: null, expenses: [] };
  }

  function emptyTrip() {
    return {
      id: uid("trip"),
      updatedAt: Date.now(),
      name: "",
      startDate: "",
      endDate: "",
      travellers: { adults: 0, children: 0 },
      travellerProfiles: [],
      budget: { configured: false, totalBudget: null, day1HardLimit: null, destinations: [] },
      dayMeta: {},
      itinerary: [],
      preTripTasks: [],
      documents: [],
      travelInfo: [],
      places: [],
      reminders: [],
      timelineNotes: [],
      dayNotes: {}
    };
  }

  function normalizeTravellerProfile(item) {
    const type = String(item?.type || "adult").toLowerCase() === "child" ? "child" : "adult";
    return {
      id: String(item?.id || uid("person")),
      name: String(item?.name || (type === "child" ? "Child" : "Adult")).trim() || (type === "child" ? "Child" : "Adult"),
      type,
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
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
      endDate: String(item?.endDate || ""),
      startTimeZone: String(item?.startTimeZone || ""),
      endTimeZone: String(item?.endTimeZone || ""),
      durationText: String(item?.durationText || ""),
      location: String(item?.location || ""),
      latitude: item?.latitude === null || item?.latitude === "" || item?.latitude === undefined ? null : Number(item.latitude),
      longitude: item?.longitude === null || item?.longitude === "" || item?.longitude === undefined ? null : Number(item.longitude),
      geocodeLabel: String(item?.geocodeLabel || ""),
      geocodedAt: item?.geocodedAt ? Number(item.geocodedAt) : null,
      status: String(item?.status || "Planned"),
      bookingRef: String(item?.bookingRef || ""),
      costTotal: item?.costTotal === null || item?.costTotal === "" || item?.costTotal === undefined ? null : Number(item.costTotal),
      costCurrency: String(item?.costCurrency || "AUD").toUpperCase(),
      costAud: item?.costAud === null || item?.costAud === "" || item?.costAud === undefined ? null : Number(item.costAud),
      fxRate: item?.fxRate === null || item?.fxRate === "" || item?.fxRate === undefined ? null : Number(item.fxRate),
      fxRateCapturedAt: String(item?.fxRateCapturedAt || ""),
      adultCost: item?.adultCost === null || item?.adultCost === "" || item?.adultCost === undefined ? null : Number(item.adultCost),
      childCost: item?.childCost === null || item?.childCost === "" || item?.childCost === undefined ? null : Number(item.childCost),
      participants: String(item?.participants || ""),
      attendeeIds: Array.isArray(item?.attendeeIds) ? item.attendeeIds.map(String) : [],
      paymentMode: ["none", "individual", "split"].includes(item?.paymentMode) ? item.paymentMode : "none",
      payerIds: Array.isArray(item?.payerIds) ? item.payerIds.map(String) : [],
      notes: String(item?.notes || ""),
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
    };
  }

  function normalizePreTripTask(item) {
    return {
      id: String(item?.id || uid("pre")),
      title: String(item?.title || "Pre-trip task"),
      dueDate: String(item?.dueDate || ""),
      category: String(item?.category || "Other"),
      status: String(item?.status || "Planned"),
      costTotal: item?.costTotal === null || item?.costTotal === "" || item?.costTotal === undefined
        ? null
        : Number(item.costTotal),
      costCurrency: String(item?.costCurrency || "AUD").toUpperCase(),
      costAud: item?.costAud === null || item?.costAud === "" || item?.costAud === undefined ? null : Number(item.costAud),
      fxRate: item?.fxRate === null || item?.fxRate === "" || item?.fxRate === undefined ? null : Number(item.fxRate),
      fxRateCapturedAt: String(item?.fxRateCapturedAt || ""),
      paymentMode: ["none", "individual", "split"].includes(item?.paymentMode) ? item.paymentMode : "none",
      payerIds: Array.isArray(item?.payerIds) ? item.payerIds.map(String) : [],
      notes: String(item?.notes || ""),
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
    };
  }

  function normalizeDocument(item) {
    return {
      id: String(item?.id || uid("doc")),
      title: String(item?.title || "Document"),
      category: String(item?.category || "Other"),
      linkedItineraryId: String(item?.linkedItineraryId || ""),
      bookingRef: String(item?.bookingRef || ""),
      confirmation: String(item?.confirmation || ""),
      phone: String(item?.phone || ""),
      website: String(item?.website || ""),
      notes: String(item?.notes || ""),
      attachmentId: String(item?.attachmentId || ""),
      attachmentName: String(item?.attachmentName || ""),
      attachmentType: String(item?.attachmentType || ""),
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
    };
  }

  function normalizeTravelInfo(item) {
    return {
      id: String(item?.id || uid("info")),
      type: String(item?.type || "Other"),
      name: String(item?.name || "Travel info"),
      reference: String(item?.reference || ""),
      phone: String(item?.phone || ""),
      email: String(item?.email || ""),
      website: String(item?.website || ""),
      notes: String(item?.notes || ""),
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
    };
  }

  function normalizePlace(item) {
    return {
      id: String(item?.id || uid("place")),
      title: String(item?.title || "Place"),
      category: String(item?.category || "Other"),
      status: String(item?.status || "Wishlist"),
      location: String(item?.location || ""),
      latitude: item?.latitude === null || item?.latitude === "" || item?.latitude === undefined ? null : Number(item.latitude),
      longitude: item?.longitude === null || item?.longitude === "" || item?.longitude === undefined ? null : Number(item.longitude),
      geocodeLabel: String(item?.geocodeLabel || ""),
      geocodedAt: item?.geocodedAt ? Number(item.geocodedAt) : null,
      website: String(item?.website || ""),
      notes: String(item?.notes || ""),
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
    };
  }

  function normalizeReminder(item) {
    return {
      id: String(item?.id || uid("rem")),
      title: String(item?.title || "Reminder"),
      dueAt: String(item?.dueAt || ""),
      notes: String(item?.notes || ""),
      status: String(item?.status || "Active"),
      linkedKind: String(item?.linkedKind || ""),
      linkedId: String(item?.linkedId || ""),
      notifiedAt: item?.notifiedAt ? Number(item.notifiedAt) : null,
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
    };
  }

  function normalizeTimelineNote(item) {
    return {
      id: String(item?.id || uid("timeline-note")),
      date: String(item?.date || ""),
      time: String(item?.time || ""),
      title: String(item?.title || ""),
      text: String(item?.text || ""),
      createdAt: Number(item?.createdAt || Date.now()),
      updatedAt: Number(item?.updatedAt || Date.now())
    };
  }

  function normalizeDayNote(item) {
    return {
      id: String(item?.id || uid("note")),
      title: String(item?.title || ""),
      text: String(item?.text || ""),
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
    trip.updatedAt = Number(raw?.updatedAt || Date.now());
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
      day1HardLimit: raw?.budget?.day1HardLimit === null || raw?.budget?.day1HardLimit === "" || raw?.budget?.day1HardLimit === undefined
        ? null
        : Number(raw.budget.day1HardLimit),
      destinations: Array.isArray(raw?.budget?.destinations) ? raw.budget.destinations.map(normalizeDestination) : []
    };
    trip.dayMeta = raw?.dayMeta && typeof raw.dayMeta === "object" ? raw.dayMeta : {};
    trip.itinerary = Array.isArray(raw?.itinerary) ? raw.itinerary.map(normalizeItineraryItem) : [];
    trip.travellerProfiles = Array.isArray(raw?.travellerProfiles) ? raw.travellerProfiles.map(normalizeTravellerProfile) : [];
    trip.preTripTasks = Array.isArray(raw?.preTripTasks) ? raw.preTripTasks.map(normalizePreTripTask) : [];
    trip.documents = Array.isArray(raw?.documents) ? raw.documents.map(normalizeDocument) : [];
    trip.travelInfo = Array.isArray(raw?.travelInfo) ? raw.travelInfo.map(normalizeTravelInfo) : [];
    trip.places = Array.isArray(raw?.places) ? raw.places.map(normalizePlace) : [];
    trip.reminders = Array.isArray(raw?.reminders) ? raw.reminders.map(normalizeReminder) : [];
    trip.timelineNotes = Array.isArray(raw?.timelineNotes) ? raw.timelineNotes.map(normalizeTimelineNote) : [];
    trip.dayNotes = raw?.dayNotes && typeof raw.dayNotes === "object"
      ? Object.fromEntries(Object.entries(raw.dayNotes).map(([date, notes]) => [
          date,
          Array.isArray(notes) ? notes.map(normalizeDayNote) : []
        ]))
      : {};
    return trip;
  }

  function ensureTravellerProfiles(trip) {
    if (!trip) return trip;
    if (!Array.isArray(trip.travellerProfiles)) trip.travellerProfiles = [];
    if (trip.travellerProfiles.length > 0) return trip;

    const adults = Math.max(0, Number(trip.travellers?.adults || 0));
    const children = Math.max(0, Number(trip.travellers?.children || 0));

    for (let i = 0; i < adults; i++) {
      trip.travellerProfiles.push(normalizeTravellerProfile({
        name: `Adult ${i + 1}`,
        type: "adult"
      }));
    }

    for (let i = 0; i < children; i++) {
      trip.travellerProfiles.push(normalizeTravellerProfile({
        name: `Child ${i + 1}`,
        type: "child"
      }));
    }

    return trip;
  }

  function migrateState(parsed) {
    if (!parsed || typeof parsed !== "object") return blankState();

    if (Number(parsed.version) >= 3 && parsed.trip) {
      return {
        version: APP_VERSION,
        trip: ensureTravellerProfiles(normalizeTrip(parsed.trip)),
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
        day1HardLimit: null,
        destinations: Array.isArray(old.destinations) ? old.destinations.map(normalizeDestination) : []
      };
      ensureTravellerProfiles(trip);
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
        day1HardLimit: null,
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
      ensureTravellerProfiles(trip);
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

  function saveState(options = {}) {
    state.version = APP_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!options.skipFamilySync && state.trip) {
      window.FamilySync?.localChanged?.();
    }
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


  function typeClass(type) {
    const key = String(type || "Other").trim().toLowerCase();
    if (key === "flight") return "type-flight";
    if (key === "accommodation") return "type-accommodation";
    if (key === "theme park") return "type-theme-park";
    if (key === "activity") return "type-activity";
    if (key === "travel") return "type-travel";
    if (key === "food") return "type-food";
    if (key === "shopping") return "type-shopping";
    return "type-other";
  }

  function travellerById(id) {
    return state.trip?.travellerProfiles?.find((person) => person.id === id) || null;
  }

  function adultTravellers() {
    return (state.trip?.travellerProfiles || []).filter((person) => person.type === "adult");
  }

  function travellerNames(ids) {
    return (ids || []).map((id) => travellerById(id)?.name).filter(Boolean);
  }

  function itemAttendeeText(item) {
    const names = travellerNames(item?.attendeeIds || []);
    if (names.length) return names.join(", ");
    return item?.participants || "";
  }

  function itemPaymentText(item) {
    const total = itemLocalCost(item);
    if (total === null || !Number.isFinite(total) || total <= 0) return "";

    const payers = travellerNames(item?.payerIds || []);
    if (item?.paymentMode === "individual" && payers.length === 1) {
      return `${payers[0]} • ${money(total, item.costCurrency || "AUD")}`;
    }

    if (item?.paymentMode === "split" && payers.length >= 2) {
      const share = total / payers.length;
      return `${payers.join(" + ")} • ${money(share, item.costCurrency || "AUD")} each`;
    }

    return "";
  }

  function preTripPaymentText(task) {
    const total = Number(task?.costTotal);
    if (task?.costTotal === null || !Number.isFinite(total) || total <= 0) return "";

    const payers = travellerNames(task?.payerIds || []);
    if (task?.paymentMode === "individual" && payers.length === 1) {
      return `${payers[0]} • ${money(total, task.costCurrency || "AUD")}`;
    }

    if (task?.paymentMode === "split" && payers.length >= 2) {
      const share = total / payers.length;
      return `${payers.join(" + ")} • ${money(share, task.costCurrency || "AUD")} each`;
    }

    return "";
  }

  function syncTravellerCounts() {
    if (!state.trip) return;
    const people = state.trip.travellerProfiles || [];
    state.trip.travellers = {
      adults: people.filter((person) => person.type === "adult").length,
      children: people.filter((person) => person.type === "child").length
    };
  }

  function itemLocalCost(item) {
    const explicit = Number(item?.costTotal);
    if (item?.costTotal !== null && item?.costTotal !== "" && item?.costTotal !== undefined && Number.isFinite(explicit)) {
      return explicit;
    }

    const adults = Number(state.trip?.travellers?.adults || 0);
    const children = Number(state.trip?.travellers?.children || 0);
    const adultCost = Number(item?.adultCost);
    const childCost = Number(item?.childCost);

    const hasAdult = item?.adultCost !== null && item?.adultCost !== "" && item?.adultCost !== undefined && Number.isFinite(adultCost);
    const hasChild = item?.childCost !== null && item?.childCost !== "" && item?.childCost !== undefined && Number.isFinite(childCost);

    if (!hasAdult && !hasChild) return null;

    return (hasAdult ? adults * adultCost : 0) + (hasChild ? children * childCost : 0);
  }


  function planningRateFor(currency, dateStr = "") {
    const code = String(currency || "AUD").toUpperCase();
    if (code === "AUD") return 1;

    const destinations = state.trip?.budget?.destinations || [];
    const valid = (d) =>
      d.currency === code &&
      Number.isFinite(Number(d.rate)) &&
      Number(d.rate) > 0;

    if (dateStr) {
      const dated = destinations.find((d) =>
        valid(d) &&
        dayNumber(dateStr) >= dayNumber(d.startDate) &&
        dayNumber(dateStr) <= dayNumber(d.endDate)
      );
      if (dated) return Number(dated.rate);
    }

    const any = destinations.find(valid);
    return any ? Number(any.rate) : null;
  }

  function preferredCurrencyForDate(dateStr) {
    if (!dateStr) return "AUD";
    const matches = matchingDestinationsForDate(dateStr).filter((d) => d.currency && d.currency !== "AUD");
    return matches.length ? matches[0].currency : "AUD";
  }

  function audFromLocalCost(localAmount, currency, dateStr = "", snapshotRate = null) {
    if (localAmount === null || localAmount === "" || localAmount === undefined) return null;
    const amount = Number(localAmount);
    if (!Number.isFinite(amount)) return null;

    const code = String(currency || "AUD").toUpperCase();
    if (code === "AUD") return amount;

    const savedRate = Number(snapshotRate);
    const rate = Number.isFinite(savedRate) && savedRate > 0
      ? savedRate
      : planningRateFor(code, dateStr);

    if (!Number.isFinite(rate) || rate <= 0) return null;
    return amount / rate;
  }

  function itemEffectiveCost(item) {
    const local = itemLocalCost(item);
    if (local === null || !Number.isFinite(local)) return null;

    const captured = Number(item?.costAud);
    if (item?.costAud !== null && item?.costAud !== "" && item?.costAud !== undefined && Number.isFinite(captured)) {
      return captured;
    }

    return audFromLocalCost(local, item?.costCurrency || "AUD", item?.date || "", item?.fxRate);
  }

  function preTripEffectiveCost(task) {
    const local = task?.costTotal === null || task?.costTotal === "" || task?.costTotal === undefined
      ? null
      : Number(task.costTotal);
    if (local === null || !Number.isFinite(local)) return null;

    const captured = Number(task?.costAud);
    if (task?.costAud !== null && task?.costAud !== "" && task?.costAud !== undefined && Number.isFinite(captured)) {
      return captured;
    }

    return audFromLocalCost(local, task?.costCurrency || "AUD", "", task?.fxRate);
  }

  function rateLabelFor(currency) {
    const code = String(currency || "AUD").toUpperCase();
    return code === "AUD" ? "AUD cost — no conversion needed" : `${code} per A$1`;
  }

  function isPaidStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    return value === "paid" || value === "booked - paid";
  }

  function showModalSafe(dialog) {
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function closeModalSafe(dialog) {
    if (dialog?.open) dialog.close();
  }

  function syncModalLock() {
    const anyOpen = Boolean(document.querySelector("dialog[open]"));
    document.documentElement.classList.toggle("modal-open", anyOpen);
    document.body.classList.toggle("modal-open", anyOpen);
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
    const rateLabel = item.currency === "AUD" ? "Planning rate" : `Planning rate: ${item.currency} per A$1`;

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

  function validTimeZone(value) {
    const zone = String(value || "").trim();
    if (!zone) return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  function timeZoneCityLabel(value) {
    const zone = String(value || "").trim();
    if (!zone) return "";
    const part = zone.split("/").pop() || zone;
    return part.replace(/_/g, " ");
  }

  function timeZoneOffsetAt(timeZone, epochMs) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(epochMs));

    const values = {};
    parts.forEach((part) => {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    });

    const asUtc = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );

    return asUtc - epochMs;
  }

  function zonedLocalToEpoch(dateStr, timeStr, timeZone) {
    if (!dateStr || !timeStr || !validTimeZone(timeZone)) return NaN;

    const [year, month, day] = dateStr.split("-").map(Number);
    const [hour, minute] = timeStr.split(":").map(Number);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return NaN;

    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
    let offset = timeZoneOffsetAt(timeZone, utcGuess);
    let result = utcGuess - offset;

    // Re-check at the resulting instant to handle DST offset changes.
    const correctedOffset = timeZoneOffsetAt(timeZone, result);
    if (correctedOffset !== offset) result = utcGuess - correctedOffset;

    return result;
  }

  function durationLabelFromMinutes(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "";
    const mins = Math.round(totalMinutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }

  function itemCalculatedDuration(item) {
    if (!item?.startTime || !item?.endTime) return "";

    const startDate = item.date;
    let endDate = item.endDate || item.date;

    if (validTimeZone(item.startTimeZone) && validTimeZone(item.endTimeZone)) {
      const startMs = zonedLocalToEpoch(startDate, item.startTime, item.startTimeZone);
      const endMs = zonedLocalToEpoch(endDate, item.endTime, item.endTimeZone);
      const diff = endMs - startMs;
      if (Number.isFinite(diff) && diff >= 0) return durationLabelFromMinutes(diff / 60000);
    }

    const [sh, sm] = item.startTime.split(":").map(Number);
    const [eh, em] = item.endTime.split(":").map(Number);
    if (![sh, sm, eh, em].every(Number.isFinite)) return "";

    let dayDiff = 0;
    if (startDate && endDate) dayDiff = dayNumber(endDate) - dayNumber(startDate);

    let mins = dayDiff * 24 * 60 + (eh * 60 + em) - (sh * 60 + sm);
    if (!item.endDate && mins < 0) mins += 24 * 60;
    return durationLabelFromMinutes(mins);
  }

  function itemTimeLabel(item) {
    if (!item.startTime) return "All day";

    const startZone = timeZoneCityLabel(item.startTimeZone);
    const endZone = timeZoneCityLabel(item.endTimeZone);
    const startLabel = `${item.startTime}${startZone ? ` ${startZone}` : ""}`;

    if (!item.endTime) return startLabel;

    let endLabel = `${item.endTime}${endZone ? ` ${endZone}` : ""}`;
    if (item.endDate && item.endDate !== item.date) {
      endLabel += ` ${formatDate(item.endDate, { year: false })}`;
    }

    return `${startLabel} → ${endLabel}`;
  }

  function directionsDestination(item) {
    const raw = String(item?.location || "").trim();
    if (!raw) return "";

    if (raw.includes("→")) {
      const parts = raw.split("→");
      return parts[parts.length - 1].trim();
    }

    if (raw.includes("->")) {
      const parts = raw.split("->");
      return parts[parts.length - 1].trim();
    }

    return raw;
  }

  function openDirectionsChooser(destination, title = "") {
    directionsTarget = String(destination || "").trim();
    if (!directionsTarget) return;

    el("directionsDialogTitle").textContent = title ? `Directions to ${title}` : "Open directions";
    el("directionsDestinationText").textContent = directionsTarget;
    el("directionsMessage").textContent = "";
    showModalSafe(el("directionsDialog"));
  }

  function openExternalMap(url) {
    closeModalSafe(el("directionsDialog"));
    window.location.href = url;
  }

  function appleMapsUrl(destination) {
    return `https://maps.apple.com/directions?destination=${encodeURIComponent(destination)}`;
  }

  function googleMapsUrl(destination) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  function wazeUrl(destination) {
    return `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
  }

  function timelineNoteMarkup(note) {
    return `
      <article class="timeline-note-card" data-timeline-note-id="${escapeHtml(note.id)}">
        <div class="timeline-note-marker" aria-hidden="true">✎</div>
        <div class="timeline-note-main">
          <div class="timeline-note-topline">
            <span class="timeline-note-time">${note.time ? escapeHtml(note.time) : "All day"}</span>
            <span class="timeline-note-type">NOTE</span>
          </div>
          ${note.title ? `<h3>${escapeHtml(note.title)}</h3>` : ""}
          <p>${escapeHtml(note.text)}</p>
        </div>
        <div class="timeline-note-actions">
          <button class="mini-btn edit-timeline-note" type="button" data-id="${escapeHtml(note.id)}">Edit</button>
        </div>
      </article>`;
  }

  function timelineEntriesForDate(date) {
    const activities = (state.trip?.itinerary || [])
      .filter((item) => item.date === date)
      .map((item) => ({
        kind: "item",
        time: item.startTime || "",
        createdAt: Number(item.createdAt || 0),
        value: item
      }));

    const notes = (state.trip?.timelineNotes || [])
      .filter((note) => note.date === date)
      .map((note) => ({
        kind: "note",
        time: note.time || "",
        createdAt: Number(note.createdAt || 0),
        value: note
      }));

    return [...activities, ...notes].sort((a, b) => {
      const at = a.time || "00:00";
      const bt = b.time || "00:00";
      if (at !== bt) return at.localeCompare(bt);
      if (a.kind !== b.kind) return a.kind === "item" ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  function timelineEntryMarkup(entry) {
    return entry.kind === "note" ? timelineNoteMarkup(entry.value) : itineraryItemMarkup(entry.value);
  }

  function bindTimelineNoteButtons(root = document) {
    root.querySelectorAll(".edit-timeline-note").forEach((button) => {
      button.addEventListener("click", () => openTimelineNoteDialog(button.dataset.id));
    });
  }

  function itineraryItemMarkup(item) {
    const duration = item.durationText || itemCalculatedDuration(item);
    const chips = [];
    if (duration) chips.push(duration);
    if (item.startTimeZone && item.endTimeZone && item.startTimeZone !== item.endTimeZone) {
      chips.push(`${timeZoneCityLabel(item.startTimeZone)} time → ${timeZoneCityLabel(item.endTimeZone)} time`);
    } else if (item.startTimeZone) {
      chips.push(`${timeZoneCityLabel(item.startTimeZone)} time`);
    }
    if (item.status) chips.push(item.status);
    if (itemAttendeeText(item)) chips.push(`Attending: ${itemAttendeeText(item)}`);
    if (item.bookingRef) chips.push(`Ref: ${item.bookingRef}`);

    const hasCosts = Number.isFinite(Number(item.costTotal)) || Number.isFinite(Number(item.adultCost)) || Number.isFinite(Number(item.childCost));
    const costCurrency = item.costCurrency || "AUD";

    return `
      <article class="itinerary-item ${typeClass(item.type)}" data-itinerary-id="${escapeHtml(item.id)}">
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
              ${costCurrency !== "AUD" && itemEffectiveCost(item) !== null ? `<div class="aud-equivalent-line">≈ ${escapeHtml(aud(itemEffectiveCost(item)))} AUD${Number.isFinite(Number(item.fxRate)) ? ` • saved at 1 AUD = ${escapeHtml(String(item.fxRate))} ${escapeHtml(costCurrency)}` : ""}</div>` : ""}
              <div class="per-person">
                ${Number.isFinite(Number(item.adultCost)) ? `Adult ticket: ${escapeHtml(money(item.adultCost, costCurrency))} each` : ""}
                ${Number.isFinite(Number(item.adultCost)) && Number.isFinite(Number(item.childCost)) ? ` • ` : ""}
                ${Number.isFinite(Number(item.childCost)) ? `Child ticket: ${escapeHtml(money(item.childCost, costCurrency))} each` : ""}
              </div>
              ${itemPaymentText(item) ? `<div class="item-payment-line"><strong>${item.paymentMode === "split" ? "Split:" : "Responsible:"}</strong> ${escapeHtml(itemPaymentText(item))}</div>` : ""}
            </div>` : ""}
          ${item.notes ? `<p class="item-notes">${escapeHtml(item.notes)}</p>` : ""}
        </div>
        <div class="item-actions">
          ${directionsDestination(item)
            ? `<button class="directions-btn itinerary-directions" type="button" data-id="${escapeHtml(item.id)}">Directions</button>`
            : ""}
          <button class="mini-btn itinerary-reminder" type="button" data-id="${escapeHtml(item.id)}">Reminder</button>
          <button class="mini-btn edit-itinerary-item" type="button" data-id="${escapeHtml(item.id)}">Edit</button>
        </div>
      </article>`;
  }

  function preTripCategoryClass(category) {
    const key = String(category || "Other").trim().toLowerCase();
    if (key === "insurance") return "category-insurance";
    if (key === "connectivity") return "category-connectivity";
    if (key === "transport") return "category-transport";
    if (key === "hotel") return "category-hotel";
    if (key === "app / setup") return "category-app-setup";
    if (key === "documents") return "category-documents";
    return "category-other";
  }

  function isPreTripComplete(status) {
    const value = String(status || "").trim().toLowerCase();
    return ["completed", "paid", "booked - paid"].includes(value);
  }

  function preTripTaskMarkup(task) {
    const due = task.dueDate ? formatDate(task.dueDate, { weekday: true }) : "No due date";
    const cost = task.costTotal !== null && Number.isFinite(Number(task.costTotal))
      ? money(task.costTotal, task.costCurrency || "AUD")
      : "No cost";

    return `
      <article class="pretrip-task-card ${preTripCategoryClass(task.category)}">
        <span class="pretrip-stripe" aria-hidden="true"></span>
        <div class="pretrip-card-content">
          <div class="pretrip-card-top">
            <div>
              <h3 class="pretrip-card-title">${escapeHtml(task.title)}</h3>
              <div class="pretrip-card-meta">${escapeHtml(due)} • ${escapeHtml(task.category)} • ${escapeHtml(task.status)}</div>
            </div>
            <div class="pretrip-card-cost">${escapeHtml(cost)}</div>
          </div>
          ${task.costCurrency !== "AUD" && preTripEffectiveCost(task) !== null ? `<div class="aud-equivalent-line pretrip-aud-equivalent">≈ ${escapeHtml(aud(preTripEffectiveCost(task)))} AUD${Number.isFinite(Number(task.fxRate)) ? ` • saved at 1 AUD = ${escapeHtml(String(task.fxRate))} ${escapeHtml(task.costCurrency)}` : ""}</div>` : ""}
          ${preTripPaymentText(task) ? `<div class="item-payment-line pretrip-payment-line"><strong>${task.paymentMode === "split" ? "Split:" : "Responsible:"}</strong> ${escapeHtml(preTripPaymentText(task))}</div>` : ""}
          ${task.notes ? `<p class="pretrip-card-notes">${escapeHtml(task.notes)}</p>` : ""}
          <div class="pretrip-card-actions">
            ${!isPreTripComplete(task.status) ? `<button class="mini-btn complete-pretrip-task" type="button" data-id="${escapeHtml(task.id)}">Mark done</button>` : ""}
            <button class="mini-btn reminder-pretrip-task" type="button" data-id="${escapeHtml(task.id)}">Reminder</button>
            <button class="mini-btn edit-pretrip-task" type="button" data-id="${escapeHtml(task.id)}">Edit</button>
          </div>
        </div>
      </article>`;
  }

  function renderPreTrip() {
    if (!state.trip) return;
    const tasks = [...(state.trip.preTripTasks || [])].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

    const complete = tasks.filter((x) => isPreTripComplete(x.status)).length;
    const outstandingCost = tasks.reduce((sum, task) => {
      if (isPreTripComplete(task.status)) return sum;
      const cost = preTripEffectiveCost(task);
      return cost !== null && Number.isFinite(cost) ? sum + cost : sum;
    }, 0);

    el("preTripSummaryText").textContent = tasks.length
      ? `${complete}/${tasks.length} complete${outstandingCost > 0 ? ` • ${aud(outstandingCost)} still to pay` : ""}`
      : "No tasks yet";

    el("preTripTaskList").innerHTML = tasks.length
      ? tasks.map(preTripTaskMarkup).join("")
      : `<p class="expense-empty">No pre-trip tasks yet. Add insurance, eSIM, booking reminders or anything else you need before departure.</p>`;

    el("preTripTaskList").querySelectorAll(".edit-pretrip-task").forEach((button) => {
      button.addEventListener("click", () => openPreTripTaskDialog(button.dataset.id));
    });

    el("preTripTaskList").querySelectorAll(".reminder-pretrip-task").forEach((button) => {
      button.addEventListener("click", () => openReminderDialog("", "pretrip", button.dataset.id));
    });

    el("preTripTaskList").querySelectorAll(".complete-pretrip-task").forEach((button) => {
      button.addEventListener("click", () => {
        const task = state.trip.preTripTasks.find((x) => x.id === button.dataset.id);
        if (!task) return;
        task.status = "Completed";
        task.updatedAt = Date.now();
        saveState();
        renderPreTrip();
        renderSummary();
      });
    });
  }

  function fullDayMarkup(date, index) {
    const meta = state.trip.dayMeta?.[date] || {};
    const entries = timelineEntriesForDate(date);
    const todayClass = date === todayISO() ? "today-full-day" : "";

    return `
      <article class="full-day-card">
        <div class="full-day-header ${todayClass}">
          <div class="full-day-title">
            <strong>Day ${index + 1} • ${escapeHtml(formatDate(date, { weekday: true }))}</strong>
            <span>${escapeHtml(meta.location || "")}</span>
            <p class="full-day-headline">${escapeHtml(meta.headline || (entries.length ? "Planned day" : "Nothing planned"))}</p>
          </div>
          <button class="full-day-open" type="button" data-date="${date}">Open day</button>
        </div>
        <div class="full-day-body">
          ${meta.overnight ? `<p class="full-day-overnight">Overnight: ${escapeHtml(meta.overnight)}</p>` : ""}
          ${entries.length ? entries.map(timelineEntryMarkup).join("") : `<div class="full-day-empty">Nothing planned</div>`}
        </div>
      </article>`;
  }

  function renderFullItinerary() {
    if (!state.trip) return;
    const dates = tripDates();
    el("fullItineraryCount").textContent = `${dates.length} days`;
    el("fullItineraryList").innerHTML = dates.map(fullDayMarkup).join("");

    el("fullItineraryList").querySelectorAll(".full-day-open").forEach((button) => {
      button.addEventListener("click", () => {
        selectedItineraryDate = button.dataset.date;
        itineraryViewMode = "day";
        renderItinerary();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    el("fullItineraryList").querySelectorAll(".edit-itinerary-item").forEach((button) => {
      button.addEventListener("click", () => openItineraryItemDialog(button.dataset.id));
    });

    el("fullItineraryList").querySelectorAll(".itinerary-directions").forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.trip?.itinerary.find((x) => x.id === button.dataset.id);
        if (!item) return;
        openDirectionsChooser(directionsDestination(item), item.title);
      });
    });

    el("fullItineraryList").querySelectorAll(".itinerary-reminder").forEach((button) => {
      button.addEventListener("click", () => openReminderDialog("", "itinerary", button.dataset.id));
    });

    bindTimelineNoteButtons(el("fullItineraryList"));
  }

  function renderItineraryViewMode() {
    const full = itineraryViewMode === "full";
    el("dayItineraryView").classList.toggle("hidden", full);
    el("fullItineraryView").classList.toggle("hidden", !full);
    if (full) renderFullItinerary();
  }

  function renderItinerary() {
    if (!state.trip) return;

    renderPreTrip();
    renderItineraryViewMode();
    if (itineraryViewMode === "full") return;

    renderDayStrip();

    const dates = tripDates();
    const dayIndex = dates.indexOf(selectedItineraryDate);
    const meta = state.trip.dayMeta?.[selectedItineraryDate] || {};
    const items = [...state.trip.itinerary]
      .filter((x) => x.date === selectedItineraryDate)
      .sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
    const timelineNotes = (state.trip.timelineNotes || []).filter((x) => x.date === selectedItineraryDate);
    const entries = timelineEntriesForDate(selectedItineraryDate);

    el("itineraryDayLabel").textContent = `DAY ${dayIndex + 1} OF ${dates.length}`;
    el("itineraryDateTitle").textContent = formatDate(selectedItineraryDate, { weekday: true });
    el("itineraryHeadline").textContent = meta.headline || (entries.length ? "Planned day" : "Nothing planned");
    el("itineraryLocation").textContent = meta.location || "";
    el("overnightBanner").classList.toggle("hidden", !meta.overnight);
    el("overnightBanner").textContent = meta.overnight ? `Overnight: ${meta.overnight}` : "";
    el("dayNotesBanner").classList.toggle("hidden", !meta.notes);
    el("dayNotesBanner").textContent = meta.notes || "";

    if (items.length || timelineNotes.length) {
      const parts = [];
      if (items.length) parts.push(`${items.length} planned item${items.length === 1 ? "" : "s"}`);
      if (timelineNotes.length) parts.push(`${timelineNotes.length} timeline note${timelineNotes.length === 1 ? "" : "s"}`);
      el("dayItemsHeading").textContent = parts.join(" • ");
    } else {
      el("dayItemsHeading").textContent = "Itinerary";
    }

    const buckets = [
      ["All day", (x) => !x.time],
      ["Morning", (x) => x.time && x.time < "12:00"],
      ["Afternoon", (x) => x.time && x.time >= "12:00" && x.time < "17:00"],
      ["Evening", (x) => x.time && x.time >= "17:00"]
    ];

    el("itineraryItems").innerHTML = entries.length
      ? buckets.map(([label, test]) => {
          const group = entries.filter(test);
          if (!group.length) return "";
          return `<section class="day-part"><h3 class="day-part-heading">${label}</h3>${group.map(timelineEntryMarkup).join("")}</section>`;
        }).join("")
      : `<div class="empty-day"><strong>Nothing planned</strong><br><span>Add an activity or timeline note, or leave it as a free day.</span></div>`;

    document.querySelectorAll(".edit-itinerary-item").forEach((button) => {
      button.addEventListener("click", () => openItineraryItemDialog(button.dataset.id));
    });

    document.querySelectorAll(".itinerary-directions").forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.trip?.itinerary.find((x) => x.id === button.dataset.id);
        if (!item) return;
        openDirectionsChooser(directionsDestination(item), item.title);
      });
    });

    document.querySelectorAll(".itinerary-reminder").forEach((button) => {
      button.addEventListener("click", () => openReminderDialog("", "itinerary", button.dataset.id));
    });

    bindTimelineNoteButtons(el("itineraryItems"));

    el("prevDayBtn").disabled = dayIndex <= 0;
    el("nextDayBtn").disabled = dayIndex >= dates.length - 1;
    renderDayJournal();
  }


  function renderCostResponsibilitySummary() {
    if (!state.trip || !el("summaryPayerCards") || !el("summaryResponsibilityTotals")) return;

    const adults = adultTravellers();
    const totals = new Map(
      adults.map((person) => [
        person.id,
        {
          person,
          total: 0,
          owing: 0,
          paid: 0,
          itemCount: 0
        }
      ])
    );

    let sharedTotal = 0;
    let sharedOwing = 0;
    let sharedCount = 0;

    let unassignedTotal = 0;
    let unassignedOwing = 0;
    let unassignedCount = 0;

    function allocate(cost, paymentMode, payerIds, isPaid) {
      if (!Number.isFinite(cost) || cost <= 0) return;

      const validPayerIds = [...new Set((payerIds || []).filter((id) => totals.has(id)))];

      if (paymentMode === "individual" && validPayerIds.length === 1) {
        const row = totals.get(validPayerIds[0]);
        row.total += cost;
        row.itemCount += 1;
        if (isPaid) row.paid += cost;
        else row.owing += cost;
        return;
      }

      if (paymentMode === "split" && validPayerIds.length >= 2) {
        sharedTotal += cost;
        sharedCount += 1;
        if (!isPaid) sharedOwing += cost;

        const share = cost / validPayerIds.length;
        validPayerIds.forEach((id) => {
          const row = totals.get(id);
          row.total += share;
          row.itemCount += 1;
          if (isPaid) row.paid += share;
          else row.owing += share;
        });
        return;
      }

      unassignedTotal += cost;
      unassignedCount += 1;
      if (!isPaid) unassignedOwing += cost;
    }

    for (const item of state.trip.itinerary || []) {
      const cost = itemEffectiveCost(item);
      if (cost === null || !Number.isFinite(cost) || cost <= 0) continue;
      allocate(cost, item.paymentMode || "none", item.payerIds || [], isPaidStatus(item.status));
    }

    for (const task of state.trip.preTripTasks || []) {
      const cost = preTripEffectiveCost(task);
      if (cost === null || !Number.isFinite(cost) || cost <= 0) continue;
      allocate(cost, task.paymentMode || "none", task.payerIds || [], isPreTripComplete(task.status));
    }

    el("summaryPayerCards").innerHTML = adults.length
      ? adults.map((person) => {
          const row = totals.get(person.id);
          return `
            <article class="responsibility-person-card">
              <div class="responsibility-card-head">
                <span class="responsibility-avatar" aria-hidden="true">${escapeHtml(person.name.slice(0, 1).toUpperCase())}</span>
                <div>
                  <strong>${escapeHtml(person.name)}</strong>
                  <span>${row.itemCount} assigned item${row.itemCount === 1 ? "" : "s"}</span>
                </div>
              </div>
              <p class="responsibility-label">Still owing</p>
              <p class="responsibility-value ${row.owing > 0 ? "has-owing" : "all-paid"}">${escapeHtml(aud(row.owing))}</p>
              <div class="responsibility-foot">
                <span><strong>${escapeHtml(aud(row.total))}</strong> total responsibility</span>
                <span><strong>${escapeHtml(aud(row.paid))}</strong> already paid</span>
              </div>
            </article>
          `;
        }).join("")
      : `<p class="expense-empty">Add adult travellers in Settings to assign trip costs.</p>`;

    el("summaryResponsibilityTotals").innerHTML = `
      <article class="responsibility-special-card shared-card">
        <p class="metric-label">Shared costs</p>
        <p class="responsibility-special-value">${escapeHtml(aud(sharedTotal))}</p>
        <p class="metric-note">${sharedCount} split item${sharedCount === 1 ? "" : "s"} • ${escapeHtml(aud(sharedOwing))} still unpaid</p>
      </article>
      <article class="responsibility-special-card unassigned-card">
        <p class="metric-label">Unassigned costs</p>
        <p class="responsibility-special-value">${escapeHtml(aud(unassignedTotal))}</p>
        <p class="metric-note">${unassignedCount} item${unassignedCount === 1 ? "" : "s"} • ${escapeHtml(aud(unassignedOwing))} still unpaid</p>
      </article>
    `;
  }

  function renderSummary() {
    if (!state.trip) return;

    const itineraryItems = Array.isArray(state.trip.itinerary) ? state.trip.itinerary : [];
    const preTripTasks = Array.isArray(state.trip.preTripTasks) ? state.trip.preTripTasks : [];
    const priced = [];
    const unpriced = [];
    let total = 0;
    let paid = 0;
    let outstanding = 0;

    for (const item of itineraryItems) {
      const cost = itemEffectiveCost(item);
      const summaryItem = {
        kind: "itinerary",
        type: item.type || "Other",
        title: item.title,
        date: item.date,
        status: item.status || "Planned"
      };

      if (cost === null || !Number.isFinite(cost)) {
        unpriced.push(summaryItem);
        continue;
      }

      priced.push({ item: summaryItem, cost });
      total += cost;
      if (isPaidStatus(item.status)) paid += cost;
      else outstanding += cost;
    }

    for (const task of preTripTasks) {
      const cost = preTripEffectiveCost(task);
      const summaryItem = {
        kind: "pretrip",
        type: "Pre-trip",
        title: task.title,
        date: task.dueDate,
        status: task.status || "Planned"
      };

      if (cost === null || !Number.isFinite(cost)) {
        unpriced.push(summaryItem);
        continue;
      }

      priced.push({ item: summaryItem, cost });
      total += cost;
      if (isPreTripComplete(task.status)) paid += cost;
      else outstanding += cost;
    }

    const paidPct = total > 0 ? (paid / total) * 100 : 0;

    el("summaryTotalCost").textContent = aud(total);
    el("summaryPaid").textContent = aud(paid);
    el("summaryOutstanding").textContent = aud(outstanding);
    el("summaryUnpriced").textContent = String(unpriced.length);
    el("summaryPricedItems").textContent = String(priced.length);
    el("summaryPaidPct").textContent = `${paidPct.toFixed(1)}% of priced trip`;
    el("summaryProgressText").textContent = `${paidPct.toFixed(0)}% paid`;
    el("summaryPaidProgress").style.width = `${Math.max(0, Math.min(100, paidPct))}%`;
    el("summaryItemCount").textContent =
      `${itineraryItems.length} itinerary item${itineraryItems.length === 1 ? "" : "s"} • ${preTripTasks.length} pre-trip task${preTripTasks.length === 1 ? "" : "s"}`;

    const dayCount = daysInclusive(state.trip.startDate, state.trip.endDate);
    el("summaryDayCount").textContent = `${dayCount} trip day${dayCount === 1 ? "" : "s"}`;

    const groups = new Map();
    for (const { item, cost } of priced) {
      const type = item.type || "Other";
      const current = groups.get(type) || { type, count: 0, cost: 0 };
      current.count += 1;
      current.cost += cost;
      groups.set(type, current);
    }

    const breakdown = [...groups.values()].sort((a, b) => b.cost - a.cost);
    el("summaryBreakdown").innerHTML = breakdown.length
      ? breakdown.map((group) => `
          <div class="summary-breakdown-row ${group.type === "Pre-trip" ? "type-pretrip" : typeClass(group.type)}">
            <span class="summary-colour-dot" aria-hidden="true"></span>
            <div class="summary-breakdown-label">
              <strong>${escapeHtml(group.type)}</strong>
              <span>${group.count} priced item${group.count === 1 ? "" : "s"}</span>
            </div>
            <div class="summary-breakdown-value">${escapeHtml(aud(group.cost))}</div>
          </div>
        `).join("")
      : `<p class="expense-empty">No priced trip items yet.</p>`;

    const unpaidItems = priced
      .filter(({ item }) => item.kind === "pretrip" ? !isPreTripComplete(item.status) : !isPaidStatus(item.status))
      .sort((a, b) => {
        const aDate = a.item.date || "9999-12-31";
        const bDate = b.item.date || "9999-12-31";
        return aDate.localeCompare(bDate);
      });

    el("summaryOutstandingList").innerHTML = unpaidItems.length
      ? unpaidItems.map(({ item, cost }) => `
          <div class="summary-outstanding-item ${item.type === "Pre-trip" ? "type-pretrip" : typeClass(item.type)}">
            <span class="summary-outstanding-stripe" aria-hidden="true"></span>
            <div class="summary-outstanding-main">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${item.date ? escapeHtml(formatDate(item.date, { weekday: true })) : "No date"} • ${escapeHtml(item.status || "Planned")}</span>
            </div>
            <div class="summary-outstanding-amount">${escapeHtml(aud(cost))}</div>
          </div>
        `).join("")
      : `<p class="expense-empty">Nothing priced is currently marked as unpaid.</p>`;

    renderCostResponsibilitySummary();
    applySummaryWidgetVisibility();
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
    el("configureDay1HardLimit").value = state.trip.budget?.day1HardLimit ?? "";
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

  function configuredDay1HardLimit() {
    const value = Number(state.trip?.budget?.day1HardLimit);
    const total = Number(state.trip?.budget?.totalBudget);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (!Number.isFinite(total) || total <= 0) return null;
    return Math.min(value, total);
  }

  function plannedFutureAllowanceWithDay1Limit(today, spentTotal, spentDay1) {
    const hardLimit = configuredDay1HardLimit();
    if (hardLimit === null || !state.trip) return null;

    const startN = dayNumber(state.trip.startDate);
    const endN = dayNumber(state.trip.endDate);
    const todayN = dayNumber(today);
    const totalDays = daysInclusive(state.trip.startDate, state.trip.endDate);
    if (totalDays <= 1) return 0;

    if (todayN < startN || todayN === startN) {
      const otherRecorded = Math.max(0, spentTotal - spentDay1);
      const reserve = Math.max(hardLimit, spentDay1);
      return Math.max(0, Number(state.trip.budget.totalBudget) - otherRecorded - reserve) / (totalDays - 1);
    }

    if (todayN <= endN) return null;
    return 0;
  }

  function spentBeforeDate(dateStr) {
    const target = dayNumber(dateStr);
    return state.expenses.reduce((sum, item) => {
      return dayNumber(item.date) < target ? sum + Number(item.audAmount || 0) : sum;
    }, 0);
  }

  function currentTripDayBudget(today) {
    if (!state.trip?.budget?.configured) return 0;

    const trip = state.trip;
    const startN = dayNumber(trip.startDate);
    const endN = dayNumber(trip.endDate);
    const todayN = dayNumber(today);
    const totalDays = daysInclusive(trip.startDate, trip.endDate);
    const totalBudget = Number(trip.budget.totalBudget);
    const hardLimit = configuredDay1HardLimit();

    // Before the trip, show the planned Day 1 budget.
    if (todayN < startN) {
      return hardLimit !== null
        ? hardLimit
        : (totalDays > 0 ? totalBudget / totalDays : 0);
    }

    // Day 1 uses the hard limit when one is configured.
    if (todayN === startN && hardLimit !== null) {
      return hardLimit;
    }

    // After the trip, preserve the final day's calculated starting allowance.
    const effectiveDateN = todayN > endN ? endN : todayN;
    const effectiveDate = addDays(trip.startDate, effectiveDateN - startN);
    const priorSpend = spentBeforeDate(effectiveDate);
    const remainingAtStartOfDay = totalBudget - priorSpend;
    const daysIncludingThisDay = endN - effectiveDateN + 1;

    return daysIncludingThisDay > 0
      ? remainingAtStartOfDay / daysIncludingThisDay
      : 0;
  }

  function tripStats() {
    const trip = state.trip;
    if (!trip?.budget?.configured) return null;

    const today = todayISO();
    const startN = dayNumber(trip.startDate);
    const endN = dayNumber(trip.endDate);
    const todayN = dayNumber(today);
    const totalDays = daysInclusive(trip.startDate, trip.endDate);
    const budget = Number(trip.budget.totalBudget);
    const spent = totalSpent();
    const remaining = budget - spent;
    const hardLimit = configuredDay1HardLimit();
    const spentDay1 = totalSpent(expensesOn(trip.startDate));

    let status = "during";
    let dayIndex = 0;
    let elapsedDays = 0;
    let displayDayDate = today;

    if (todayN < startN) {
      status = "before";
      displayDayDate = trip.startDate;
    } else if (todayN > endN) {
      status = "after";
      dayIndex = totalDays;
      elapsedDays = totalDays;
      displayDayDate = trip.endDate;
    } else {
      dayIndex = todayN - startN + 1;
      elapsedDays = dayIndex;
    }

    const futureDaysRaw = futureDaysAfterToday(trip, today);
    const day1PlannedFutureAllowance = plannedFutureAllowanceWithDay1Limit(today, spent, spentDay1);

    let allowanceDayCount = futureDaysRaw;
    if (status === "before" && hardLimit !== null) {
      allowanceDayCount = Math.max(0, totalDays - 1);
    }

    const availablePerFutureDay = day1PlannedFutureAllowance !== null
      ? day1PlannedFutureAllowance
      : (futureDaysRaw > 0 ? remaining / futureDaysRaw : 0);

    const todayBudget = currentTripDayBudget(today);
    const spentForDisplayedDay = status === "before"
      ? totalSpent(expensesOn(trip.startDate))
      : totalSpent(expensesOn(displayDayDate));

    const dayVariance = todayBudget - spentForDisplayedDay;
    const todayProgressPct = todayBudget > 0 ? (spentForDisplayedDay / todayBudget) * 100 : 0;

    return {
      today,
      totalDays,
      spent,
      remaining,
      status,
      dayIndex,
      elapsedDays,
      futureDays: futureDaysRaw,
      allowanceDayCount,
      availablePerFutureDay,
      spentToday: spentForDisplayedDay,
      spentDay1,
      hardLimit,
      todayBudget,
      dayVariance,
      todayProgressPct,
      displayDayDate
    };
  }

  function renderDashboard() {
    const stats = tripStats();
    if (!stats) return;

    const budget = Number(state.trip.budget.totalBudget);
    const spentPct = budget > 0 ? (stats.spent / budget) * 100 : 0;

    // Main trip total.
    el("remainingBudget").textContent = aud(stats.remaining);
    el("remainingBudget").classList.toggle("bad", stats.remaining < 0);
    el("heroTotalSpent").textContent = `Total spent ${aud(stats.spent)}`;
    el("overallSpentLabel").textContent = `Total spent ${aud(stats.spent)}`;

    el("tripDay").textContent =
      stats.status === "before"
        ? `Trip starts ${formatDate(state.trip.startDate, { year: false })}`
        : stats.status === "after"
          ? `Trip finished • ${stats.totalDays} days`
          : `Trip day ${stats.dayIndex} of ${stats.totalDays}`;

    // Today's / Day 1 budget strip.
    const budgetLabel = el("todayBudgetLabel");
    const spentLabel = el("todaySpentLabel");
    const badge = el("todayBudgetBadge");

    if (stats.status === "before") {
      budgetLabel.textContent = "Day 1 budget";
      spentLabel.textContent = "Day 1 spent";
    } else if (stats.status === "after") {
      budgetLabel.textContent = "Final day budget";
      spentLabel.textContent = "Final day spent";
    } else {
      budgetLabel.textContent = "Today's budget";
      spentLabel.textContent = "Spent today";
    }

    const isHardLimitDay =
      stats.hardLimit !== null &&
      dayNumber(stats.displayDayDate) === dayNumber(state.trip.startDate);

    badge.classList.toggle("hidden", !isHardLimitDay);
    badge.textContent = isHardLimitDay ? "Hard limit" : "";

    el("todayBudgetValue").textContent = aud(stats.todayBudget);
    el("spentToday").textContent = aud(stats.spentToday);
    el("todayLocalDate").textContent =
      stats.status === "before"
        ? formatDate(state.trip.startDate, { weekday: true })
        : formatDate(stats.displayDayDate, { weekday: true });

    const dailyProgress = Math.max(0, Math.min(100, stats.todayProgressPct));
    el("todayProgressBar").style.width = `${dailyProgress}%`;
    el("todayProgressBar").classList.toggle("over", stats.todayProgressPct > 100);

    const todayStatus = el("todayBudgetStatus");
    todayStatus.classList.remove("good", "bad");

    if (stats.status === "before" && stats.spentToday === 0) {
      todayStatus.textContent = `${aud(stats.todayBudget)} reserved for Day 1`;
    } else if (stats.dayVariance >= 0) {
      todayStatus.classList.add("good");
      todayStatus.textContent = `${aud(stats.dayVariance)} left for ${stats.status === "before" ? "Day 1" : "today"}`;
    } else {
      todayStatus.classList.add("bad");
      todayStatus.textContent = `${aud(Math.abs(stats.dayVariance))} over ${stats.status === "before" ? "Day 1 budget" : "today's budget"}`;
    }

    // Ahead / behind pace now matches the current day's rolling budget.
    const paceEl = el("paceValue");
    const paceNote = el("paceNote");
    paceEl.classList.remove("good", "bad", "warn");

    if (stats.status === "before") {
      paceEl.textContent = aud(0);
      paceEl.classList.add("warn");
      paceNote.textContent = "Trip has not started yet";
    } else if (stats.status === "after") {
      const finalVariance = budget - stats.spent;
      paceEl.textContent = `${finalVariance >= 0 ? "+" : "−"}${aud(Math.abs(finalVariance))}`;
      paceEl.classList.add(finalVariance >= 0 ? "good" : "bad");
      paceNote.textContent = finalVariance >= 0 ? "Finished under trip budget" : "Finished over trip budget";
    } else {
      paceEl.textContent = `${stats.dayVariance >= 0 ? "+" : "−"}${aud(Math.abs(stats.dayVariance))}`;
      paceEl.classList.add(stats.dayVariance >= 0 ? "good" : "bad");
      paceNote.textContent = stats.dayVariance >= 0
        ? "Ahead of today's pace"
        : "Behind today's pace";
    }

    // Future allowance.
    el("dailyAllowance").textContent = aud(stats.availablePerFutureDay);

    if (stats.allowanceDayCount <= 0) {
      el("futureAllowanceNote").textContent = "No future trip days remaining";
    } else if (stats.status === "before" && stats.hardLimit !== null) {
      el("futureAllowanceNote").textContent =
        `${stats.allowanceDayCount} days after Day 1`;
    } else {
      el("futureAllowanceNote").textContent =
        `${stats.allowanceDayCount} future day${stats.allowanceDayCount === 1 ? "" : "s"}`;
    }

    el("daysRemaining").textContent =
      stats.allowanceDayCount === 1
        ? "1 future day"
        : `${stats.allowanceDayCount} future days`;

    // Overall budget progress.
    const clampedPct = Math.max(0, Math.min(100, spentPct));
    el("budgetProgress").style.width = `${clampedPct}%`;
    el("budgetProgress").style.background = spentPct > 100 ? "#b91c1c" : "";
    el("progressUsed").textContent = `${Math.max(0, spentPct).toFixed(0)}% used`;
    el("progressRemaining").textContent =
      stats.remaining >= 0
        ? `${Math.max(0, 100 - spentPct).toFixed(0)}% left`
        : `${aud(Math.abs(stats.remaining))} over`;

    // Status copy.
    if (stats.status === "before") {
      const until = dayNumber(state.trip.startDate) - dayNumber(stats.today);
      if (stats.hardLimit !== null) {
        el("tripStatus").textContent =
          `Your trip starts in ${until} day${until === 1 ? "" : "s"}. ${aud(stats.hardLimit)} is reserved for Day 1, so Days 2 onward currently have ${aud(stats.availablePerFutureDay)} per day.`;
      } else {
        el("tripStatus").textContent =
          `Your trip starts in ${until} day${until === 1 ? "" : "s"}. The budget is currently spread evenly across all ${stats.totalDays} trip days.`;
      }
    } else if (stats.status === "after") {
      el("tripStatus").textContent =
        `This trip ended on ${formatDate(state.trip.endDate)}. Your history remains available.`;
    } else if (stats.futureDays === 0) {
      el("tripStatus").textContent =
        `Today is the final day. There are no future days left to redistribute the remaining budget across.`;
    } else {
      el("tripStatus").textContent =
        `Today is day ${stats.dayIndex} of ${stats.totalDays}. Today's allowance is fixed at the start of the day; future days recalculate from what is actually left.`;
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
    const hardLimit = configuredDay1HardLimit();
    let remainingBudget = Number(state.trip.budget.totalBudget);
    let currentFutureAllocation = null;
    const rows = [];

    for (let i = 0; i < totalDays; i++) {
      const date = addDays(state.trip.startDate, i);
      const dateN = dayNumber(date);
      const remainingDaysAtStart = totalDays - i;
      const spent = totalSpent(expensesOn(date));
      let allocation;

      if (hardLimit !== null && i === 0) {
        allocation = hardLimit;
      } else if (hardLimit !== null && todayN <= startN && i > 0) {
        const firstDaySpent = totalSpent(expensesOn(state.trip.startDate));
        const reserve = Math.max(hardLimit, firstDaySpent);
        allocation = totalDays > 1
          ? Math.max(0, Number(state.trip.budget.totalBudget) - reserve) / (totalDays - 1)
          : 0;
      } else if (todayN < startN) {
        allocation = totalDays > 0 ? Number(state.trip.budget.totalBudget) / totalDays : 0;
      } else if (todayN > endN || dateN <= todayN) {
        allocation = remainingDaysAtStart > 0 ? remainingBudget / remainingDaysAtStart : 0;
      } else {
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

      if (todayN > endN || dateN <= todayN) {
        remainingBudget -= spent;
      } else if (hardLimit !== null && i === 0 && todayN <= startN) {
        remainingBudget -= Math.max(spent, hardLimit);
      }
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
    renderUiSettings();
    if (!state.trip?.budget?.configured) return;
    el("settingsTripName").value = state.trip.name;
    el("settingsStartDate").value = state.trip.startDate;
    el("settingsEndDate").value = state.trip.endDate;
    el("settingsBudget").value = state.trip.budget.totalBudget;
    el("settingsDay1HardLimit").value = state.trip.budget.day1HardLimit ?? "";
    if (settingsDraftDestinations.length === 0) {
      settingsDraftDestinations = cloneDestinations(state.trip.budget.destinations || []);
      renderDestinationDrafts("settings");
    }
  }

  function dateTimeMs(value) {
    if (!value) return NaN;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  function dateTimeLabel(value) {
    const ms = dateTimeMs(value);
    if (!Number.isFinite(ms)) return "No date";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
    }).format(new Date(ms));
  }

  function toDateTimeLocal(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function safeExternalUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  function openVaultDb() {
    if (vaultDbPromise) return vaultDbPromise;
    vaultDbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("Local file storage is not supported on this browser."));
        return;
      }
      const request = indexedDB.open("travelPlannerVault.v1", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("attachments")) {
          db.createObjectStore("attachments", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local document storage."));
    });
    return vaultDbPromise;
  }

  async function saveVaultAttachment(id, file) {
    const db = await openVaultDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("attachments", "readwrite");
      tx.objectStore("attachments").put({
        id,
        blob: file,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        updatedAt: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Could not save attachment."));
    });
  }

  async function getVaultAttachment(id) {
    if (!id) return null;
    const db = await openVaultDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("attachments", "readonly");
      const request = tx.objectStore("attachments").get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not load attachment."));
    });
  }

  async function deleteVaultAttachment(id) {
    if (!id) return;
    try {
      const db = await openVaultDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("attachments", "readwrite");
        tx.objectStore("attachments").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
  }

  async function clearVaultAttachments() {
    try {
      const db = await openVaultDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("attachments", "readwrite");
        tx.objectStore("attachments").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
  }

  function homeItemTypeClass(type) {
    const cls = typeClass(type);
    if (cls === "type-flight") return "#2563eb";
    if (cls === "type-accommodation") return "#7c3aed";
    if (cls === "type-theme-park") return "#db2777";
    if (cls === "type-activity") return "#d97706";
    if (cls === "type-travel") return "#0891b2";
    if (cls === "type-food") return "#ea580c";
    if (cls === "type-shopping") return "#16a34a";
    return "#64748b";
  }

  function upcomingItineraryItems(limit = 3) {
    if (!state.trip) return [];
    const today = todayISO();
    const nowTime = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
    const beforeTrip = dayNumber(today) < dayNumber(state.trip.startDate);

    const sorted = [...state.trip.itinerary].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.startTime || "00:00").localeCompare(b.startTime || "00:00");
    });

    return sorted.filter((item) => {
      if (beforeTrip) return dayNumber(item.date) >= dayNumber(state.trip.startDate);
      if (item.date > today) return true;
      if (item.date < today) return false;
      if (!item.startTime) return true;
      return item.startTime >= nowTime;
    }).slice(0, limit);
  }

  function nextOutstandingTripItem() {
    if (!state.trip) return null;
    const candidates = [];

    for (const task of state.trip.preTripTasks || []) {
      const cost = preTripEffectiveCost(task);
      if (!isPreTripComplete(task.status) && cost !== null && Number.isFinite(cost) && cost > 0) {
        candidates.push({
          title: task.title,
          date: task.dueDate || "9999-12-31",
          cost,
          label: "Pre-trip"
        });
      }
    }

    for (const item of state.trip.itinerary || []) {
      const cost = itemEffectiveCost(item);
      if (!isPaidStatus(item.status) && cost !== null && Number.isFinite(cost) && cost > 0) {
        candidates.push({
          title: item.title,
          date: item.date || "9999-12-31",
          cost,
          label: item.type || "Itinerary"
        });
      }
    }

    return candidates.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }

  function activeReminders() {
    return [...(state.trip?.reminders || [])]
      .filter((r) => String(r.status).toLowerCase() !== "done")
      .sort((a, b) => {
        const am = dateTimeMs(a.dueAt);
        const bm = dateTimeMs(b.dueAt);
        if (!Number.isFinite(am)) return 1;
        if (!Number.isFinite(bm)) return -1;
        return am - bm;
      });
  }

  function renderHome() {
    if (!state.trip) return;

    const trip = state.trip;
    const today = todayISO();
    const todayN = dayNumber(today);
    const startN = dayNumber(trip.startDate);
    const endN = dayNumber(trip.endDate);
    const totalDays = daysInclusive(trip.startDate, trip.endDate);
    const stats = trip.budget?.configured ? tripStats() : null;

    let displayDate = today;
    if (todayN < startN) displayDate = trip.startDate;
    if (todayN > endN) displayDate = trip.endDate;

    if (todayN < startN) {
      const days = startN - todayN;
      el("homeEyebrow").textContent = "BEFORE THE TRIP";
      el("homeTitle").textContent = trip.name;
      el("homeSubtitle").textContent = `Starts ${formatDate(trip.startDate, { weekday: true })}`;
      el("homeCountdown").textContent = `${days} day${days === 1 ? "" : "s"} to go`;
    } else if (todayN <= endN) {
      const day = todayN - startN + 1;
      const meta = trip.dayMeta?.[today] || {};
      el("homeEyebrow").textContent = `DAY ${day} OF ${totalDays}`;
      el("homeTitle").textContent = meta.headline || formatDate(today, { weekday: true });
      el("homeSubtitle").textContent = meta.location || trip.name;
      el("homeCountdown").textContent = "Today";
    } else {
      el("homeEyebrow").textContent = "TRIP COMPLETE";
      el("homeTitle").textContent = trip.name;
      el("homeSubtitle").textContent = `Ended ${formatDate(trip.endDate, { weekday: true })}`;
      el("homeCountdown").textContent = `${totalDays} days`;
    }

    if (stats) {
      el("homeBudgetLabel").textContent = stats.status === "before" ? "Day 1 budget" : "Today's budget";
      el("homeSpentLabel").textContent = stats.status === "before" ? "Day 1 spent" : "Spent today";
      el("homeTodayBudget").textContent = aud(stats.todayBudget);
      el("homeTodaySpent").textContent = aud(stats.spentToday);
      el("homeTodayBudgetNote").textContent =
        stats.hardLimit !== null && stats.status === "before"
          ? "Hard limit reserved"
          : `${aud(stats.availablePerFutureDay)} / future day`;
      el("homeSpendStatus").textContent =
        stats.dayVariance >= 0
          ? `${aud(stats.dayVariance)} remaining`
          : `${aud(Math.abs(stats.dayVariance))} over`;
      el("homeSpendStatus").classList.toggle("good", stats.dayVariance >= 0);
      el("homeSpendStatus").classList.toggle("bad", stats.dayVariance < 0);
    } else {
      el("homeTodayBudget").textContent = "Not set";
      el("homeTodaySpent").textContent = "—";
      el("homeTodayBudgetNote").textContent = "Set up budget";
      el("homeSpendStatus").textContent = "";
    }

    const nextItems = upcomingItineraryItems(uiSettings.homeNextCount);
    el("homeNextItems").innerHTML = nextItems.length
      ? nextItems.map((item) => `
          <div class="home-list-item" style="--home-accent:${homeItemTypeClass(item.type)}">
            <span class="home-list-stripe"></span>
            <div class="home-list-main">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(formatDate(item.date, { weekday: true }))}${item.startTime ? ` • ${escapeHtml(item.startTime)}` : ""}${item.location ? ` • ${escapeHtml(item.location)}` : ""}</span>
            </div>
            <div class="home-list-side">${escapeHtml(item.type || "")}</div>
          </div>
        `).join("")
      : `<p class="expense-empty">Nothing else scheduled.</p>`;

    const meta = trip.dayMeta?.[displayDate] || {};
    let overnight = meta.overnight || "";
    if (!overnight) {
      const accommodationItem = trip.itinerary.find((x) => x.date === displayDate && String(x.type).toLowerCase() === "accommodation");
      overnight = accommodationItem?.title || "";
    }
    el("homeAccommodation").innerHTML = overnight
      ? `<strong>${escapeHtml(overnight)}</strong><span>${escapeHtml(meta.location || formatDate(displayDate, { weekday: true }))}</span>`
      : `No overnight accommodation saved for this day.`;

    const outstanding = nextOutstandingTripItem();
    el("homeOutstanding").innerHTML = outstanding
      ? `<strong>${escapeHtml(outstanding.title)}</strong><span>${escapeHtml(outstanding.label)} • ${outstanding.date !== "9999-12-31" ? escapeHtml(formatDate(outstanding.date, { weekday: true })) : "No due date"} • ${escapeHtml(aud(outstanding.cost))}</span>`
      : `Nothing priced is currently outstanding.`;

    const alertBox = el("homePreTripWarning");
    const outstandingPreTrip = (trip.preTripTasks || [])
      .filter((t) => !isPreTripComplete(t.status))
      .sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"));
    if (todayN < startN && outstandingPreTrip.length) {
      const next = outstandingPreTrip[0];
      alertBox.classList.remove("hidden");
      alertBox.textContent = `${outstandingPreTrip.length} pre-trip task${outstandingPreTrip.length === 1 ? "" : "s"} still open. Next: ${next.title}${next.dueDate ? ` • due ${formatDate(next.dueDate, { weekday: true })}` : ""}.`;
    } else {
      alertBox.classList.add("hidden");
      alertBox.textContent = "";
    }

    const reminders = activeReminders().slice(0, 3);
    const now = Date.now();
    el("homeReminders").innerHTML = reminders.length
      ? reminders.map((r) => {
          const due = dateTimeMs(r.dueAt);
          const overdue = Number.isFinite(due) && due <= now;
          return `
            <div class="home-list-item" style="--home-accent:${overdue ? "#b91c1c" : "#0f766e"}">
              <span class="home-list-stripe"></span>
              <div class="home-list-main">
                <strong>${escapeHtml(r.title)}</strong>
                <span>${escapeHtml(dateTimeLabel(r.dueAt))}</span>
              </div>
              <div class="home-list-side">${overdue ? "Due" : "Upcoming"}</div>
            </div>`;
        }).join("")
      : `<p class="expense-empty">No active reminders.</p>`;

    const currentNotes = trip.dayNotes?.[today] || [];
    const notesCard = el("homeDayNotesCard");
    if (todayN >= startN && todayN <= endN) {
      notesCard.classList.remove("hidden");
      el("homeDayNotes").innerHTML = currentNotes.length
        ? currentNotes.slice(-3).reverse().map((n) => `
            <div class="home-list-item" style="--home-accent:#475569">
              <span class="home-list-stripe"></span>
              <div class="home-list-main">
                <strong>${escapeHtml(n.title || "Note")}</strong>
                <span>${escapeHtml(n.text)}</span>
              </div>
            </div>
          `).join("")
        : `<p class="expense-empty">No notes for today yet.</p>`;
    } else {
      notesCard.classList.add("hidden");
    }

    applyHomeWidgetVisibility();
  }

  function linkedItineraryOptions(selected = "") {
    const items = [...(state.trip?.itinerary || [])].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.startTime || "").localeCompare(b.startTime || "");
    });
    return `<option value="">Not linked</option>` + items.map((item) =>
      `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(formatDate(item.date, { weekday: false }))} — ${escapeHtml(item.title)}</option>`
    ).join("");
  }

  function renderDocuments() {
    if (!state.trip) return;
    const docs = [...(state.trip.documents || [])].sort((a, b) => a.title.localeCompare(b.title));
    el("documentsSummary").textContent = `${docs.length} document${docs.length === 1 ? "" : "s"}`;
    el("documentList").innerHTML = docs.length
      ? docs.map((doc) => `
          <article class="tool-card">
            <div class="tool-card-top">
              <div>
                <h3>${escapeHtml(doc.title)}</h3>
                <div class="tool-card-meta">${escapeHtml(doc.category)}${doc.bookingRef ? ` • Ref ${escapeHtml(doc.bookingRef)}` : ""}${doc.confirmation ? ` • Confirmation ${escapeHtml(doc.confirmation)}` : ""}</div>
                ${doc.attachmentName ? `<span class="local-file-pill">${escapeHtml(doc.attachmentName)} • local file</span>` : ""}
              </div>
            </div>
            ${doc.notes ? `<p class="tool-card-notes">${escapeHtml(doc.notes)}</p>` : ""}
            <div class="tool-card-actions">
              ${doc.phone ? `<a class="tool-link-btn" href="tel:${escapeHtml(doc.phone)}">Call</a>` : ""}
              ${doc.website ? `<a class="tool-link-btn" href="${escapeHtml(safeExternalUrl(doc.website))}" target="_blank" rel="noopener">Website</a>` : ""}
              ${doc.attachmentId ? `<button class="tool-link-btn open-document-file" type="button" data-id="${escapeHtml(doc.id)}">Open file</button>` : ""}
              <button class="tool-link-btn edit-document" type="button" data-id="${escapeHtml(doc.id)}">Edit</button>
            </div>
          </article>
        `).join("")
      : `<p class="expense-empty">No documents saved yet.</p>`;

    el("documentList").querySelectorAll(".edit-document").forEach((b) =>
      b.addEventListener("click", () => openDocumentDialog(b.dataset.id))
    );
    el("documentList").querySelectorAll(".open-document-file").forEach((b) =>
      b.addEventListener("click", () => openDocumentAttachment(b.dataset.id))
    );
  }

  function renderTravelInfo() {
    if (!state.trip) return;
    const items = [...(state.trip.travelInfo || [])].sort((a, b) => a.type.localeCompare(b.type));
    el("travelInfoSummary").textContent = `${items.length} saved contact${items.length === 1 ? "" : "s"}`;
    el("travelInfoList").innerHTML = items.length
      ? items.map((info) => `
          <article class="tool-card">
            <div class="tool-card-top">
              <div>
                <h3>${escapeHtml(info.name)}</h3>
                <div class="tool-card-meta">${escapeHtml(info.type)}${info.reference ? ` • ${escapeHtml(info.reference)}` : ""}</div>
              </div>
            </div>
            ${info.notes ? `<p class="tool-card-notes">${escapeHtml(info.notes)}</p>` : ""}
            <div class="tool-card-actions">
              ${info.phone ? `<a class="tool-link-btn" href="tel:${escapeHtml(info.phone)}">Call</a>` : ""}
              ${info.email ? `<a class="tool-link-btn" href="mailto:${escapeHtml(info.email)}">Email</a>` : ""}
              ${info.website ? `<a class="tool-link-btn" href="${escapeHtml(safeExternalUrl(info.website))}" target="_blank" rel="noopener">Website</a>` : ""}
              <button class="tool-link-btn edit-travel-info" type="button" data-id="${escapeHtml(info.id)}">Edit</button>
            </div>
          </article>
        `).join("")
      : `<p class="expense-empty">No emergency or travel contacts saved yet.</p>`;

    el("travelInfoList").querySelectorAll(".edit-travel-info").forEach((b) =>
      b.addEventListener("click", () => openTravelInfoDialog(b.dataset.id))
    );
  }

  function placeTypeForItinerary(category) {
    const key = String(category || "").toLowerCase();
    if (key === "restaurant") return "Food";
    if (key === "shop") return "Shopping";
    return "Activity";
  }

  function renderPlaces() {
    if (!state.trip) return;
    const places = [...(state.trip.places || [])].sort((a, b) => {
      if (a.status !== b.status) return a.status.localeCompare(b.status);
      return a.title.localeCompare(b.title);
    });
    el("placesSummary").textContent = `${places.length} place${places.length === 1 ? "" : "s"}`;
    el("placeList").innerHTML = places.length
      ? places.map((place) => `
          <article class="tool-card">
            <div class="tool-card-top">
              <div>
                <h3>${escapeHtml(place.title)}</h3>
                <div class="tool-card-meta">${escapeHtml(place.category)} • ${escapeHtml(place.status)}${place.location ? ` • ${escapeHtml(place.location)}` : ""}</div>
              </div>
            </div>
            ${place.notes ? `<p class="tool-card-notes">${escapeHtml(place.notes)}</p>` : ""}
            <div class="tool-card-actions">
              ${place.location ? `<button class="tool-link-btn place-directions" type="button" data-id="${escapeHtml(place.id)}">Directions</button>` : ""}
              ${place.website ? `<a class="tool-link-btn" href="${escapeHtml(safeExternalUrl(place.website))}" target="_blank" rel="noopener">Website</a>` : ""}
              <button class="tool-link-btn schedule-place" type="button" data-id="${escapeHtml(place.id)}">Add to itinerary</button>
              <button class="tool-link-btn edit-place" type="button" data-id="${escapeHtml(place.id)}">Edit</button>
            </div>
          </article>
        `).join("")
      : `<p class="expense-empty">No wishlist places yet.</p>`;

    el("placeList").querySelectorAll(".edit-place").forEach((b) =>
      b.addEventListener("click", () => openPlaceDialog(b.dataset.id))
    );
    el("placeList").querySelectorAll(".place-directions").forEach((b) =>
      b.addEventListener("click", () => {
        const place = state.trip.places.find((x) => x.id === b.dataset.id);
        if (place) openDirectionsChooser(place.location, place.title);
      })
    );
    el("placeList").querySelectorAll(".schedule-place").forEach((b) =>
      b.addEventListener("click", () => schedulePlaceIntoItinerary(b.dataset.id))
    );
  }

  function reminderStatus(reminder) {
    if (String(reminder.status).toLowerCase() === "done") return "Done";
    const due = dateTimeMs(reminder.dueAt);
    if (Number.isFinite(due) && due <= Date.now()) return "Due";
    return "Upcoming";
  }

  function renderReminders() {
    if (!state.trip) return;
    const reminders = [...(state.trip.reminders || [])].sort((a, b) => {
      if (String(a.status).toLowerCase() === "done" && String(b.status).toLowerCase() !== "done") return 1;
      if (String(a.status).toLowerCase() !== "done" && String(b.status).toLowerCase() === "done") return -1;
      return (dateTimeMs(a.dueAt) || Infinity) - (dateTimeMs(b.dueAt) || Infinity);
    });

    const activeCount = reminders.filter((r) => String(r.status).toLowerCase() !== "done").length;
    el("remindersSummary").textContent = `${activeCount} active reminder${activeCount === 1 ? "" : "s"}`;

    el("reminderList").innerHTML = reminders.length
      ? reminders.map((reminder) => {
          const status = reminderStatus(reminder);
          return `
            <article class="tool-card">
              <div class="tool-card-top">
                <div>
                  <h3>${escapeHtml(reminder.title)} <span class="status-pill ${status === "Due" ? "overdue" : status === "Done" ? "done" : ""}">${status}</span></h3>
                  <div class="tool-card-meta">${escapeHtml(dateTimeLabel(reminder.dueAt))}</div>
                </div>
              </div>
              ${reminder.notes ? `<p class="tool-card-notes">${escapeHtml(reminder.notes)}</p>` : ""}
              <div class="tool-card-actions">
                ${status !== "Done" ? `<button class="tool-link-btn complete-reminder" type="button" data-id="${escapeHtml(reminder.id)}">Mark done</button>` : ""}
                <button class="tool-link-btn edit-reminder" type="button" data-id="${escapeHtml(reminder.id)}">Edit</button>
              </div>
            </article>`;
        }).join("")
      : `<p class="expense-empty">No reminders saved yet.</p>`;

    el("reminderList").querySelectorAll(".edit-reminder").forEach((b) =>
      b.addEventListener("click", () => openReminderDialog(b.dataset.id))
    );
    el("reminderList").querySelectorAll(".complete-reminder").forEach((b) =>
      b.addEventListener("click", () => {
        const reminder = state.trip.reminders.find((x) => x.id === b.dataset.id);
        if (!reminder) return;
        reminder.status = "Done";
        reminder.updatedAt = Date.now();
        saveState();
        renderReminders();
        renderHome();
        updateReminderBadge();
        scheduleReminderCheck();
      })
    );

    renderNotificationStatus();
  }

  function renderDayJournal() {
    if (!state.trip || !selectedItineraryDate) return;
    const notes = [...(state.trip.dayNotes?.[selectedItineraryDate] || [])].sort((a, b) => b.createdAt - a.createdAt);
    el("dayJournalSummary").textContent = notes.length
      ? `${notes.length} note${notes.length === 1 ? "" : "s"}`
      : "No notes yet";

    el("dayJournalList").innerHTML = notes.length
      ? notes.map((note) => `
          <article class="day-note-card">
            <h3>${escapeHtml(note.title || "Note")}</h3>
            <div class="day-note-meta">${new Date(note.createdAt).toLocaleString()}</div>
            <p class="day-note-text">${escapeHtml(note.text)}</p>
            <div class="day-note-actions">
              <button class="tool-link-btn edit-day-note" type="button" data-id="${escapeHtml(note.id)}">Edit</button>
            </div>
          </article>
        `).join("")
      : `<p class="expense-empty">No notes for this day yet.</p>`;

    el("dayJournalList").querySelectorAll(".edit-day-note").forEach((b) =>
      b.addEventListener("click", () => openDayNoteDialog(b.dataset.id))
    );
  }

  function renderMore() {
    if (!state.trip) return;
    renderDocuments();
    renderTravelInfo();
    renderPlaces();
    renderReminders();
  }

  async function updateReminderBadge() {
    const dueCount = activeReminders().filter((r) => {
      const due = dateTimeMs(r.dueAt);
      return Number.isFinite(due) && due <= Date.now();
    }).length;
    try {
      if ("setAppBadge" in navigator) {
        if (dueCount > 0) await navigator.setAppBadge(dueCount);
        else if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
      }
    } catch {}
  }

  function renderNotificationStatus() {
    if (!el("notificationStatusText")) return;
    const supported = "Notification" in window && "serviceWorker" in navigator;
    if (!supported) {
      el("notificationStatusText").textContent = "System notifications are not supported in this browser.";
      el("enableNotificationsBtn").disabled = true;
      return;
    }

    const permission = Notification.permission;
    if (permission === "granted") {
      el("notificationStatusText").textContent = "Notifications are enabled. Local reminders are checked while the app is active or when you return to it.";
      el("enableNotificationsBtn").textContent = "Enabled";
      el("enableNotificationsBtn").disabled = true;
    } else if (permission === "denied") {
      el("notificationStatusText").textContent = "Notifications are blocked in iPhone settings for this web app.";
      el("enableNotificationsBtn").textContent = "Blocked";
      el("enableNotificationsBtn").disabled = true;
    } else {
      el("notificationStatusText").textContent = "Tap enable to allow iPhone notifications for due reminders.";
      el("enableNotificationsBtn").textContent = "Enable notifications";
      el("enableNotificationsBtn").disabled = false;
    }
  }

  async function checkRemindersAndNotify() {
    if (!state.trip) return;
    const due = activeReminders().filter((r) => {
      const dueMs = dateTimeMs(r.dueAt);
      return Number.isFinite(dueMs) && dueMs <= Date.now() && !r.notifiedAt;
    });

    if (due.length && "Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        for (const reminder of due) {
          await registration.showNotification(reminder.title, {
            body: reminder.notes || dateTimeLabel(reminder.dueAt),
            icon: "./icon-192.png",
            badge: "./icon-192.png",
            tag: `trip-reminder-${reminder.id}`,
            data: { reminderId: reminder.id }
          });
          reminder.notifiedAt = Date.now();
        }
        saveState();
      } catch {}
    }

    updateReminderBadge();
    renderHome();
    renderReminders();
    scheduleReminderCheck();
  }

  function scheduleReminderCheck() {
    if (reminderTimer) clearTimeout(reminderTimer);
    reminderTimer = null;
    if (!state.trip) return;

    const next = activeReminders()
      .map((r) => dateTimeMs(r.dueAt))
      .filter((ms) => Number.isFinite(ms) && ms > Date.now())
      .sort((a, b) => a - b)[0];

    if (!next) return;
    const delay = Math.max(1000, Math.min(next - Date.now(), 60 * 60 * 1000));
    reminderTimer = setTimeout(checkRemindersAndNotify, delay);
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
    renderSummary();
    renderBudgetVisibility();
    renderHome();
    renderMore();
    renderDayJournal();
    renderUiSettings();
    renderTravellerSettings();
    updateReminderBadge();
    scheduleReminderCheck();
    window.TripMap?.dataChanged?.();

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
    if (mode !== "settings") lastNonSettingsMode = mode;
    if (mode === "itinerary") {
      itineraryViewMode = uiSettings.itineraryDefaultView;
      renderItinerary();
    }
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", mode !== "settings" && b.dataset.mode === mode));
    document.querySelectorAll(".mode-panel").forEach((p) => p.classList.toggle("active", p.dataset.modePanel === mode));
    if (mode === "home") renderHome();
    if (mode === "map") window.TripMap?.activate?.();
    if (mode === "budget") renderBudgetVisibility();
    if (mode === "summary") renderSummary();
    if (mode === "more") renderMore();
    if (mode === "settings") {
      renderUiSettings();
      renderTravellerSettings();
      renderSettings();
      renderNotificationStatus();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function activateBudgetTab(name) {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.budgetTab === name));
    document.querySelectorAll(".budget-tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.budgetPanel === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyImportedTrip(imported, options = {}) {
    const currentTrip = state.trip;
    const importedTrip = imported.trip;
    const sameTrip = Boolean(
      currentTrip?.id &&
      importedTrip?.id &&
      currentTrip.id === importedTrip.id
    );

    if (sameTrip) {
      const preservedBudget = currentTrip.budget
        ? JSON.parse(JSON.stringify(currentTrip.budget))
        : null;
      const preservedExpenses = Array.isArray(state.expenses)
        ? JSON.parse(JSON.stringify(state.expenses))
        : [];

      state = imported;

      // The device already owns the live spending budget for this trip.
      // Incoming itinerary/full-trip updates must not overwrite it.
      if (preservedBudget) {
        state.trip.budget = preservedBudget;
      }
      state.expenses = preservedExpenses;

      return {
        sameTrip: true,
        preservedBudget: Boolean(preservedBudget),
        preservedExpenses: true
      };
    }

    window.FamilySync?.disconnect?.({ forget: true, silent: true });
    state = imported;
    return {
      sameTrip: false,
      preservedBudget: false,
      preservedExpenses: false
    };
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

      const importResult = applyImportedTrip(imported);
      setupVisible = false;
      selectedItineraryDate = defaultSelectedDate();
      itineraryViewMode = uiSettings.itineraryDefaultView;
      settingsDraftDestinations = [];
      saveState();
      render();
      activateMode(uiSettings.startScreen);
      if (messageElement) {
        messageElement.textContent = importResult.sameTrip
          ? "Trip updated. This device's budget, exchange rates and expense history were kept."
          : "Trip imported.";
      }
    } catch (error) {
      if (messageElement) messageElement.textContent = `Could not import trip: ${error.message}`;
    }
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function compressText(text) {
    if (!("CompressionStream" in window)) {
      return { method: "plain", bytes: new TextEncoder().encode(text) };
    }
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    return { method: "gzip", bytes: new Uint8Array(buffer) };
  }

  async function decompressText(method, bytes) {
    if (method === "plain") return new TextDecoder().decode(bytes);
    if (!("DecompressionStream" in window)) throw new Error("This browser cannot open this compressed shared trip link.");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }

  function sharePayload(includeFullTrip) {
    const clonedTrip = JSON.parse(JSON.stringify(state.trip));
    const clonedExpenses = includeFullTrip ? JSON.parse(JSON.stringify(state.expenses)) : [];

    clonedTrip.documents = (clonedTrip.documents || []).map((doc) => ({
      ...doc,
      attachmentId: "",
      attachmentName: doc.attachmentName ? `${doc.attachmentName} (local file not shared)` : ""
    }));

    if (!includeFullTrip) {
      clonedTrip.budget = {
        configured: false,
        totalBudget: null,
        day1HardLimit: null,
        destinations: (clonedTrip.budget?.destinations || []).map((d) => ({ ...d, rate: null }))
      };
      clonedTrip.documents = [];
      clonedTrip.travelInfo = [];
      clonedTrip.places = [];
      clonedTrip.reminders = [];
      clonedTrip.dayNotes = {};
    }

    return {
      kind: "travel-planner-share",
      version: APP_VERSION,
      shareMode: includeFullTrip ? "full" : "itinerary",
      createdAt: new Date().toISOString(),
      trip: clonedTrip,
      expenses: clonedExpenses
    };
  }

  function extractTripSharePacked(value) {
    const text = String(value || "").trim();
    if (!text) throw new Error("Paste a Travel Planner share link first.");

    // Accept:
    // - full URL containing #tripshare=
    // - copied message/text containing the URL
    // - #tripshare=...
    // - tripshare=...
    // - raw gzip.xxx / plain.xxx payload
    const marker = "tripshare=";
    const markerIndex = text.indexOf(marker);
    let packed = markerIndex >= 0 ? text.slice(markerIndex + marker.length) : text;

    // If copied from a message, stop at whitespace after the payload.
    packed = packed.split(/\s/)[0].trim();

    // Remove harmless trailing punctuation often introduced by messaging apps.
    packed = packed.replace(/[)>.,]+$/g, "");

    if (packed.startsWith("#")) packed = packed.slice(1);
    if (packed.startsWith("tripshare=")) packed = packed.slice("tripshare=".length);

    const dot = packed.indexOf(".");
    if (dot <= 0) throw new Error("This does not look like a valid Travel Planner share link.");

    const method = packed.slice(0, dot);
    if (!["gzip", "plain"].includes(method)) {
      throw new Error("This Travel Planner link uses an unsupported share format.");
    }

    if (!packed.slice(dot + 1)) {
      throw new Error("The Travel Planner share link is incomplete.");
    }

    return packed;
  }

  async function decodeTripSharePacked(packed) {
    const dot = packed.indexOf(".");
    const method = packed.slice(0, dot);
    const bytes = base64UrlToBytes(packed.slice(dot + 1));
    const payload = JSON.parse(await decompressText(method, bytes));

    if (payload?.kind !== "travel-planner-share" || !payload?.trip) {
      throw new Error("Invalid shared trip link.");
    }

    return payload;
  }

  async function importSharedTripPayload(payload, messageElement = null) {
    const tripName = String(payload.trip?.name || "this trip");
    const modeLabel = payload.shareMode === "full"
      ? "full trip, including budget data"
      : "itinerary only";

    const sameTrip = Boolean(
      state.trip?.id &&
      payload.trip?.id &&
      state.trip.id === payload.trip.id
    );

    const promptText = state.trip
      ? sameTrip
        ? `Update ${tripName} from this ${modeLabel} link? Your budget, exchange rates and expense history on this device will be kept.`
        : `Import ${tripName} (${modeLabel}) and replace the different trip currently stored on this device?`
      : `Import ${tripName} (${modeLabel})?`;

    if (!window.confirm(promptText)) {
      if (messageElement) messageElement.textContent = "Import cancelled.";
      return false;
    }

    const imported = migrateState({
      version: APP_VERSION,
      trip: payload.trip,
      expenses: Array.isArray(payload.expenses) ? payload.expenses : []
    });

    const importResult = applyImportedTrip(imported);

    setupVisible = false;
    selectedItineraryDate = defaultSelectedDate();
    itineraryViewMode = uiSettings.itineraryDefaultView;
    settingsDraftDestinations = [];
    saveState();
    render();
    activateMode(uiSettings.startScreen);

    if (messageElement) {
      messageElement.textContent = importResult.sameTrip
        ? `${tripName} updated. This device's budget, exchange rates and expense history were kept.`
        : `${tripName} imported from ${payload.shareMode === "full" ? "a full-trip" : "an itinerary"} link.`;
    }

    return true;
  }

  async function importTripFromPastedLink(value, messageElement) {
    try {
      if (messageElement) messageElement.textContent = "Reading share link…";
      const packed = extractTripSharePacked(value);
      const payload = await decodeTripSharePacked(packed);
      return await importSharedTripPayload(payload, messageElement);
    } catch (error) {
      if (messageElement) messageElement.textContent = `Could not import link: ${error.message}`;
      return false;
    }
  }

  async function buildShareLink(includeFullTrip) {
    const payload = JSON.stringify(sharePayload(includeFullTrip));
    const packed = await compressText(payload);
    const encoded = bytesToBase64Url(packed.bytes);
    const cleanBase = `${location.origin}${location.pathname}`;
    return `${cleanBase}#tripshare=${packed.method}.${encoded}`;
  }

  async function shareTripLink(includeFullTrip, messageElement) {
    if (!state.trip) return;

    try {
      const url = await buildShareLink(includeFullTrip);
      const text = `Open this link to import ${state.trip.name} into Travel Planner.`;

      if (navigator.share) {
        await navigator.share({ title: state.trip.name, text, url });
        if (messageElement) messageElement.textContent = `${includeFullTrip ? "Full trip" : "Itinerary"} link shared.`;
      } else {
        window.prompt("Copy this private share link:", url);
        if (messageElement) messageElement.textContent = "Share link created.";
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (messageElement) messageElement.textContent = `Could not create share link: ${error.message}`;
    }
  }

  async function importSharedLinkFromHash() {
    const rawHash = location.hash || "";
    if (!rawHash.startsWith("#tripshare=")) return;

    try {
      const packed = extractTripSharePacked(rawHash);
      const payload = await decodeTripSharePacked(packed);
      await importSharedTripPayload(payload);
    } catch (error) {
      alert(`Could not import shared trip: ${error.message}`);
    } finally {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
  }

  async function exportTrip(messageElement) {
    if (!state.trip) return;
    const exportTripData = JSON.parse(JSON.stringify(state.trip));
    exportTripData.documents = (exportTripData.documents || []).map((doc) => ({
      ...doc,
      attachmentId: "",
      attachmentName: doc.attachmentName ? `${doc.attachmentName} (local file not included)` : ""
    }));

    const payload = {
      kind: "travel-planner-trip",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      trip: exportTripData,
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

  function openDocumentDialog(id = "") {
    if (!state.trip) return;
    const doc = id ? state.trip.documents.find((x) => x.id === id) : null;
    el("documentId").value = doc?.id || "";
    el("documentDialogTitle").textContent = doc ? "Edit document" : "Add document";
    el("documentTitle").value = doc?.title || "";
    el("documentCategory").value = doc?.category || "Other";
    el("documentLinkedItinerary").innerHTML = linkedItineraryOptions(doc?.linkedItineraryId || "");
    el("documentBookingRef").value = doc?.bookingRef || "";
    el("documentConfirmation").value = doc?.confirmation || "";
    el("documentPhone").value = doc?.phone || "";
    el("documentWebsite").value = doc?.website || "";
    el("documentNotes").value = doc?.notes || "";
    el("documentAttachment").value = "";
    el("documentAttachmentStatus").textContent = doc?.attachmentName
      ? `Current local file: ${doc.attachmentName}`
      : "No local file attached.";
    el("documentError").textContent = "";
    el("deleteDocumentBtn").classList.toggle("hidden", !doc);
    showModalSafe(el("documentDialog"));
  }

  async function openDocumentAttachment(id) {
    const doc = state.trip?.documents.find((x) => x.id === id);
    if (!doc?.attachmentId) return;

    const popup = window.open("about:blank", "_blank");
    try {
      const record = await getVaultAttachment(doc.attachmentId);
      if (!record?.blob) throw new Error("This attachment is not stored on this device.");
      const url = URL.createObjectURL(record.blob);
      if (popup) popup.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (error) {
      if (popup) popup.close();
      alert(error.message || "Could not open this attachment.");
    }
  }

  function openTravelInfoDialog(id = "") {
    const info = id ? state.trip?.travelInfo.find((x) => x.id === id) : null;
    el("travelInfoId").value = info?.id || "";
    el("travelInfoDialogTitle").textContent = info ? "Edit travel info" : "Add travel info";
    el("travelInfoType").value = info?.type || "Other";
    el("travelInfoName").value = info?.name || "";
    el("travelInfoReference").value = info?.reference || "";
    el("travelInfoPhone").value = info?.phone || "";
    el("travelInfoEmail").value = info?.email || "";
    el("travelInfoWebsite").value = info?.website || "";
    el("travelInfoNotes").value = info?.notes || "";
    el("travelInfoError").textContent = "";
    el("deleteTravelInfoBtn").classList.toggle("hidden", !info);
    showModalSafe(el("travelInfoDialog"));
  }

  function openPlaceDialog(id = "") {
    const place = id ? state.trip?.places.find((x) => x.id === id) : null;
    el("placeId").value = place?.id || "";
    el("placeDialogTitle").textContent = place ? "Edit place" : "Add place";
    el("placeTitle").value = place?.title || "";
    el("placeCategory").value = place?.category || "Other";
    el("placeStatus").value = place?.status || "Wishlist";
    el("placeLocation").value = place?.location || "";
    el("placeWebsite").value = place?.website || "";
    el("placeNotes").value = place?.notes || "";
    el("placeError").textContent = "";
    el("deletePlaceBtn").classList.toggle("hidden", !place);
    showModalSafe(el("placeDialog"));
  }

  function schedulePlaceIntoItinerary(id) {
    const place = state.trip?.places.find((x) => x.id === id);
    if (!place) return;
    pendingPlaceToScheduleId = place.id;
    itineraryViewMode = "day";
    selectedItineraryDate = defaultSelectedDate();
    activateMode("itinerary");
    renderItinerary();
    openItineraryItemDialog("", {
      date: selectedItineraryDate,
      type: placeTypeForItinerary(place.category),
      title: place.title,
      location: place.location,
      notes: place.notes
    });
  }

  function openTimelineNoteDialog(id = "") {
    if (!state.trip) return;
    const note = id ? (state.trip.timelineNotes || []).find((x) => x.id === id) : null;
    const date = note?.date || selectedItineraryDate || defaultSelectedDate();

    el("timelineNoteId").value = note?.id || "";
    el("timelineNoteDialogTitle").textContent = note ? "Edit timeline note" : "Add timeline note";
    el("timelineNoteDate").value = date;
    el("timelineNoteTime").value = note?.time || "";
    el("timelineNoteTitle").value = note?.title || "";
    el("timelineNoteText").value = note?.text || "";
    el("timelineNoteError").textContent = "";
    el("deleteTimelineNoteBtn").classList.toggle("hidden", !note);
    showModalSafe(el("timelineNoteDialog"));
  }

  function openDayNoteDialog(id = "") {
    if (!state.trip || !selectedItineraryDate) return;
    const notes = state.trip.dayNotes?.[selectedItineraryDate] || [];
    const note = id ? notes.find((x) => x.id === id) : null;
    el("dayNoteId").value = note?.id || "";
    el("dayNoteDialogTitle").textContent = note ? "Edit note" : "Add note";
    el("dayNoteTitle").value = note?.title || "";
    el("dayNoteText").value = note?.text || "";
    el("dayNoteError").textContent = "";
    el("deleteDayNoteBtn").classList.toggle("hidden", !note);
    showModalSafe(el("dayNoteDialog"));
  }

  function linkedReminderDefaults(kind, id) {
    if (kind === "itinerary") {
      const item = state.trip?.itinerary.find((x) => x.id === id);
      if (!item) return null;
      let due = null;
      if (item.startTime) {
        due = new Date(`${item.date}T${item.startTime}`);
        due.setHours(due.getHours() - 1);
      } else {
        due = new Date(`${item.date}T18:00`);
        due.setDate(due.getDate() - 1);
      }
      return {
        title: `${item.title}`,
        dueAt: toDateTimeLocal(due),
        notes: item.location ? `Location: ${item.location}` : "",
        label: `Linked to itinerary: ${item.title}`
      };
    }

    if (kind === "pretrip") {
      const task = state.trip?.preTripTasks.find((x) => x.id === id);
      if (!task) return null;
      const due = task.dueDate ? new Date(`${task.dueDate}T09:00`) : new Date();
      return {
        title: task.title,
        dueAt: toDateTimeLocal(due),
        notes: task.notes || "",
        label: `Linked to pre-trip task: ${task.title}`
      };
    }

    return null;
  }

  function openReminderDialog(id = "", linkedKind = "", linkedId = "") {
    const reminder = id ? state.trip?.reminders.find((x) => x.id === id) : null;
    const defaults = !reminder && linkedKind ? linkedReminderDefaults(linkedKind, linkedId) : null;

    el("reminderId").value = reminder?.id || "";
    el("reminderLinkedKind").value = reminder?.linkedKind || linkedKind || "";
    el("reminderLinkedId").value = reminder?.linkedId || linkedId || "";
    el("reminderDialogTitle").textContent = reminder ? "Edit reminder" : "Add reminder";
    el("reminderTitle").value = reminder?.title || defaults?.title || "";
    el("reminderDueAt").value = reminder?.dueAt || defaults?.dueAt || "";
    el("reminderNotes").value = reminder?.notes || defaults?.notes || "";
    el("reminderLinkText").textContent = defaults?.label || (reminder?.linkedKind ? `Linked reminder • ${reminder.linkedKind}` : "");
    el("reminderError").textContent = "";
    el("deleteReminderBtn").classList.toggle("hidden", !reminder);
    showModalSafe(el("reminderDialog"));
  }

  function renderPreTripPeopleControls(task = null) {
    const adults = adultTravellers();
    const payerSet = new Set(task?.payerIds || []);

    el("preTripIndividualPayer").innerHTML = adults.length
      ? `<option value="">Choose adult</option>` + adults.map((person) =>
          `<option value="${escapeHtml(person.id)}" ${payerSet.has(person.id) ? "selected" : ""}>${escapeHtml(person.name)}</option>`
        ).join("")
      : `<option value="">No adults added</option>`;

    el("preTripSplitPayerOptions").innerHTML = adults.length
      ? adults.map((person) => `
          <label class="person-check">
            <input type="checkbox" value="${escapeHtml(person.id)}" data-pretrip-split-payer ${payerSet.has(person.id) ? "checked" : ""}>
            <span><strong>${escapeHtml(person.name)}</strong><small>Adult</small></span>
          </label>
        `).join("")
      : `<p class="muted small">Add adult travellers in Settings first.</p>`;

    const mode = task?.paymentMode || "none";
    document.querySelectorAll('input[name="preTripPaymentMode"]').forEach((radio) => {
      radio.checked = radio.value === mode;
    });

    document.querySelectorAll("[data-pretrip-split-payer]").forEach((input) => {
      input.addEventListener("change", updatePreTripPaymentControls);
    });

    updatePreTripPaymentControls();
  }

  function updatePreTripPaymentControls() {
    const mode = document.querySelector('input[name="preTripPaymentMode"]:checked')?.value || "none";
    const total = el("preTripCost").value === "" ? null : Number(el("preTripCost").value);
    const currency = el("preTripCostCurrency").value || "AUD";

    el("preTripIndividualPayerWrap").classList.toggle("hidden", mode !== "individual");
    el("preTripSplitPayersWrap").classList.toggle("hidden", mode !== "split");

    if (total === null || !Number.isFinite(total) || total <= 0) {
      el("preTripPaymentHelp").textContent = "Enter a task cost above before assigning who pays.";
      el("preTripSplitPreview").innerHTML = "";
      return;
    }

    if (mode === "none") {
      el("preTripPaymentHelp").textContent = "The task cost is tracked, but not assigned to a traveller.";
      el("preTripSplitPreview").innerHTML = "";
      return;
    }

    if (mode === "individual") {
      const payer = travellerById(el("preTripIndividualPayer").value);
      el("preTripPaymentHelp").textContent = payer
        ? `${payer.name} is responsible for ${money(total, currency)}.`
        : "Choose the adult responsible for the full cost.";
      el("preTripSplitPreview").innerHTML = "";
      return;
    }

    const payerIds = [...document.querySelectorAll("[data-pretrip-split-payer]:checked")].map((input) => input.value);
    if (payerIds.length >= 2) {
      const share = total / payerIds.length;
      el("preTripSplitPreview").innerHTML =
        `<strong>${escapeHtml(money(share, currency))} each</strong><span>${payerIds.length} adults splitting ${escapeHtml(money(total, currency))}</span>`;
      el("preTripPaymentHelp").textContent = "";
    } else {
      el("preTripSplitPreview").innerHTML = "";
      el("preTripPaymentHelp").textContent = "Choose at least two adults to split this cost.";
    }
  }

  function openPreTripTaskDialog(id = "") {
    if (!state.trip) return;
    const task = id ? state.trip.preTripTasks.find((x) => x.id === id) : null;

    el("preTripTaskId").value = task?.id || "";
    el("preTripDialogTitle").textContent = task ? "Edit task" : "Add task";
    el("preTripTitle").value = task?.title || "";
    el("preTripDueDate").value = task?.dueDate || "";
    el("preTripCategory").value = task?.category || "Other";
    el("preTripStatus").value = task?.status || "Planned";
    el("preTripCost").value =
      task?.costTotal !== null && task?.costTotal !== undefined && Number.isFinite(Number(task.costTotal))
        ? task.costTotal
        : "";
    const currencies = new Set(["AUD"]);
    (state.trip.budget?.destinations || []).forEach((d) => currencies.add(d.currency));
    el("preTripCostCurrency").innerHTML = [...currencies].map((code) => `<option value="${code}">${code}</option>`).join("");
    el("preTripCostCurrency").value = task?.costCurrency && currencies.has(task.costCurrency) ? task.costCurrency : "AUD";
    const startingRate = task?.fxRate ?? planningRateFor(el("preTripCostCurrency").value);
    el("preTripFxRate").value = startingRate ? String(startingRate) : "";

    el("preTripNotes").value = task?.notes || "";
    el("preTripTaskError").textContent = "";
    el("deletePreTripTaskBtn").classList.toggle("hidden", !task);
    updatePreTripFxPreview(false);
    renderPreTripPeopleControls(task);

    showModalSafe(el("preTripTaskDialog"));
  }

  function mergePreTripTasks(tasks) {
    if (!state.trip) return 0;
    let added = 0;

    for (const raw of tasks) {
      const incoming = normalizePreTripTask(raw);
      const existingIndex = state.trip.preTripTasks.findIndex((task) =>
        task.id === incoming.id ||
        (task.title.trim().toLowerCase() === incoming.title.trim().toLowerCase() &&
         task.dueDate === incoming.dueDate)
      );

      if (existingIndex >= 0) {
        state.trip.preTripTasks[existingIndex] = {
          ...state.trip.preTripTasks[existingIndex],
          ...incoming,
          id: state.trip.preTripTasks[existingIndex].id
        };
      } else {
        state.trip.preTripTasks.push(incoming);
        added += 1;
      }
    }

    saveState();
    renderPreTrip();
    renderSummary();
    return added;
  }

  async function importPreTripUpdate(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const tasks = Array.isArray(parsed?.preTripTasks)
        ? parsed.preTripTasks
        : Array.isArray(parsed?.trip?.preTripTasks)
          ? parsed.trip.preTripTasks
          : [];

      if (!tasks.length) throw new Error("No pre-trip tasks were found in this file.");

      if (parsed?.tripId && state.trip?.id && parsed.tripId !== state.trip.id) {
        const sameName = parsed?.tripName && parsed.tripName === state.trip.name;
        if (!sameName && !window.confirm("This update was created for a different trip. Import the tasks anyway?")) {
          return;
        }
      }

      const before = state.trip.preTripTasks.length;
      mergePreTripTasks(tasks);
      const after = state.trip.preTripTasks.length;
      el("preTripImportMessage").textContent =
        `Pre-trip update imported. ${after - before} new task${after - before === 1 ? "" : "s"} added; matching tasks were refreshed.`;
      el("preTripPanel").open = true;
    } catch (error) {
      el("preTripImportMessage").textContent = `Could not import pre-trip tasks: ${error.message}`;
    }
  }


  function itemFormLocalCost() {
    const explicit = el("itemCostTotal").value === "" ? null : Number(el("itemCostTotal").value);
    if (explicit !== null && Number.isFinite(explicit)) return explicit;

    const adults = Number(state.trip?.travellers?.adults || 0);
    const children = Number(state.trip?.travellers?.children || 0);
    const adultCost = el("itemAdultCost").value === "" ? null : Number(el("itemAdultCost").value);
    const childCost = el("itemChildCost").value === "" ? null : Number(el("itemChildCost").value);

    const hasAdult = adultCost !== null && Number.isFinite(adultCost);
    const hasChild = childCost !== null && Number.isFinite(childCost);
    if (!hasAdult && !hasChild) return null;

    return (hasAdult ? adults * adultCost : 0) + (hasChild ? children * childCost : 0);
  }

  function updateItemFxPreview(resetRate = false) {
    const currency = el("itemCostCurrency").value || "AUD";
    const date = el("itemDate").value;
    const local = itemFormLocalCost();

    el("itemFxRateLabel").textContent = rateLabelFor(currency);
    el("itemFxRateWrap").classList.toggle("hidden", currency === "AUD");

    if (currency === "AUD") {
      el("itemFxRate").value = "1";
    } else if (resetRate || !Number.isFinite(Number(el("itemFxRate").value)) || Number(el("itemFxRate").value) <= 0) {
      const planned = planningRateFor(currency, date);
      el("itemFxRate").value = planned ? String(planned) : "";
    }

    const rate = currency === "AUD" ? 1 : Number(el("itemFxRate").value);
    const converted = audFromLocalCost(local, currency, date, rate);

    if (local === null || !Number.isFinite(local)) {
      el("itemAudPreview").textContent = "—";
      el("itemFxPreviewNote").textContent = "Enter a cost to preview.";
    } else if (currency !== "AUD" && (!Number.isFinite(rate) || rate <= 0)) {
      el("itemAudPreview").textContent = "Rate needed";
      el("itemFxPreviewNote").textContent = `Add a ${currency} planning rate here or in Settings.`;
    } else {
      el("itemAudPreview").textContent = aud(converted);
      el("itemFxPreviewNote").textContent = currency === "AUD"
        ? "Already in AUD."
        : `${money(local, currency)} at 1 AUD = ${rate} ${currency}`;
    }

    updateItemPaymentControls();
  }

  function updatePreTripFxPreview(resetRate = false) {
    const currency = el("preTripCostCurrency").value || "AUD";
    const local = el("preTripCost").value === "" ? null : Number(el("preTripCost").value);

    el("preTripFxRateLabel").textContent = rateLabelFor(currency);
    el("preTripFxRateWrap").classList.toggle("hidden", currency === "AUD");

    if (currency === "AUD") {
      el("preTripFxRate").value = "1";
    } else if (resetRate || !Number.isFinite(Number(el("preTripFxRate").value)) || Number(el("preTripFxRate").value) <= 0) {
      const planned = planningRateFor(currency);
      el("preTripFxRate").value = planned ? String(planned) : "";
    }

    const rate = currency === "AUD" ? 1 : Number(el("preTripFxRate").value);
    const converted = audFromLocalCost(local, currency, "", rate);

    if (local === null || !Number.isFinite(local)) {
      el("preTripAudPreview").textContent = "—";
      el("preTripFxPreviewNote").textContent = "Enter a cost to preview.";
    } else if (currency !== "AUD" && (!Number.isFinite(rate) || rate <= 0)) {
      el("preTripAudPreview").textContent = "Rate needed";
      el("preTripFxPreviewNote").textContent = `Add a ${currency} planning rate here or in Settings.`;
    } else {
      el("preTripAudPreview").textContent = aud(converted);
      el("preTripFxPreviewNote").textContent = currency === "AUD"
        ? "Already in AUD."
        : `${money(local, currency)} at 1 AUD = ${rate} ${currency}`;
    }

    updatePreTripPaymentControls();
  }

  function renderItemPeopleControls(item = null) {
    const people = state.trip?.travellerProfiles || [];
    const legacyAll = !item?.attendeeIds?.length && /\ball\b/i.test(item?.participants || "");
    const defaultAll = !item;
    const attendeeSet = new Set(
      item?.attendeeIds?.length
        ? item.attendeeIds
        : (legacyAll || defaultAll ? people.map((person) => person.id) : [])
    );
    const payerSet = new Set(item?.payerIds || []);

    el("itemAttendeeOptions").innerHTML = people.length
      ? people.map((person) => `
          <label class="person-check">
            <input type="checkbox" value="${escapeHtml(person.id)}" data-item-attendee ${attendeeSet.has(person.id) ? "checked" : ""}>
            <span><strong>${escapeHtml(person.name)}</strong><small>${person.type === "child" ? "Child" : "Adult"}</small></span>
          </label>
        `).join("")
      : "";

    el("itemAttendeeHelp").classList.toggle("hidden", people.length > 0);

    const adults = adultTravellers();
    el("itemIndividualPayer").innerHTML = adults.length
      ? `<option value="">Choose adult</option>` + adults.map((person) =>
          `<option value="${escapeHtml(person.id)}" ${payerSet.has(person.id) ? "selected" : ""}>${escapeHtml(person.name)}</option>`
        ).join("")
      : `<option value="">No adults added</option>`;

    el("itemSplitPayerOptions").innerHTML = adults.length
      ? adults.map((person) => `
          <label class="person-check">
            <input type="checkbox" value="${escapeHtml(person.id)}" data-item-split-payer ${payerSet.has(person.id) ? "checked" : ""}>
            <span><strong>${escapeHtml(person.name)}</strong><small>Adult</small></span>
          </label>
        `).join("")
      : `<p class="muted small">Add adult travellers in Settings first.</p>`;

    const mode = item?.paymentMode || "none";
    document.querySelectorAll('input[name="itemPaymentMode"]').forEach((radio) => {
      radio.checked = radio.value === mode;
    });

    document.querySelectorAll('[data-item-split-payer]').forEach((input) => {
      input.addEventListener("change", updateItemPaymentControls);
    });

    updateItemPaymentControls();
  }

  function updateItemPaymentControls() {
    const mode = document.querySelector('input[name="itemPaymentMode"]:checked')?.value || "none";
    const total = el("itemCostTotal").value === "" ? null : Number(el("itemCostTotal").value);
    const currency = el("itemCostCurrency").value || "AUD";

    el("itemIndividualPayerWrap").classList.toggle("hidden", mode !== "individual");
    el("itemSplitPayersWrap").classList.toggle("hidden", mode !== "split");

    if (total === null || !Number.isFinite(total) || total <= 0) {
      el("itemPaymentHelp").textContent = "Enter a total event cost above before assigning who pays.";
      el("itemSplitPreview").innerHTML = "";
      return;
    }

    if (mode === "none") {
      el("itemPaymentHelp").textContent = "The event cost is tracked, but not assigned to a traveller.";
      el("itemSplitPreview").innerHTML = "";
      return;
    }

    if (mode === "individual") {
      const payer = travellerById(el("itemIndividualPayer").value);
      el("itemPaymentHelp").textContent = payer
        ? `${payer.name} is responsible for ${money(total, currency)}.`
        : "Choose the adult responsible for the full cost.";
      el("itemSplitPreview").innerHTML = "";
      return;
    }

    const payerIds = [...document.querySelectorAll("[data-item-split-payer]:checked")].map((input) => input.value);
    if (payerIds.length >= 2) {
      const share = total / payerIds.length;
      el("itemSplitPreview").innerHTML =
        `<strong>${escapeHtml(money(share, currency))} each</strong><span>${payerIds.length} adults splitting ${escapeHtml(money(total, currency))}</span>`;
      el("itemPaymentHelp").textContent = "";
    } else {
      el("itemSplitPreview").innerHTML = "";
      el("itemPaymentHelp").textContent = "Choose at least two adults to split this cost.";
    }
  }

  function renderTravellerSettings() {
    if (!state.trip || !el("travellerList")) return;
    const people = state.trip.travellerProfiles || [];
    const adults = people.filter((person) => person.type === "adult").length;
    const children = people.filter((person) => person.type === "child").length;

    el("travellersSettingsSummary").textContent = people.length
      ? `${people.length} traveller${people.length === 1 ? "" : "s"} • ${adults} adult${adults === 1 ? "" : "s"} • ${children} ${children === 1 ? "child" : "children"}`
      : "No named travellers yet";

    el("travellerList").innerHTML = people.length
      ? people.map((person) => `
          <article class="tool-card">
            <div class="tool-card-top">
              <div>
                <h3>${escapeHtml(person.name)}</h3>
                <div class="tool-card-meta">${person.type === "child" ? "Child • can attend events • never a payer" : "Adult • can attend events and be assigned costs"}</div>
              </div>
            </div>
            <div class="tool-card-actions">
              <button class="tool-link-btn edit-traveller" type="button" data-id="${escapeHtml(person.id)}">Edit</button>
            </div>
          </article>
        `).join("")
      : `<p class="expense-empty">Add the people travelling on this trip.</p>`;

    el("travellerList").querySelectorAll(".edit-traveller").forEach((button) => {
      button.addEventListener("click", () => openTravellerDialog(button.dataset.id));
    });
  }

  function openTravellerDialog(id = "") {
    const person = id ? state.trip?.travellerProfiles.find((x) => x.id === id) : null;
    el("travellerId").value = person?.id || "";
    el("travellerDialogTitle").textContent = person ? "Edit traveller" : "Add traveller";
    el("travellerName").value = person?.name || "";
    el("travellerType").value = person?.type || "adult";
    el("travellerError").textContent = "";
    el("deleteTravellerBtn").classList.toggle("hidden", !person);
    showModalSafe(el("travellerDialog"));
  }

  function openItineraryItemDialog(id = "", prefill = null) {
    if (!state.trip) return;
    const item = id ? state.trip.itinerary.find((x) => x.id === id) : null;

    el("itineraryItemId").value = item?.id || "";
    el("itemDialogTitle").textContent = item ? "Edit item" : "Add item";
    el("itemDate").value = item?.date || prefill?.date || selectedItineraryDate;
    el("itemType").value = item?.type || prefill?.type || "Activity";
    el("itemTitle").value = item?.title || prefill?.title || "";
    el("itemStartTime").value = item?.startTime || "";
    el("itemEndTime").value = item?.endTime || "";
    el("itemEndDate").value = item?.endDate || "";
    el("itemStartTimeZone").value = item?.startTimeZone || "";
    el("itemEndTimeZone").value = item?.endTimeZone || "";
    el("itemDurationText").value = item?.durationText || "";
    el("itemLocation").value = item?.location || prefill?.location || "";
    el("itemStatus").value = item?.status || "Planned";
    el("itemBookingRef").value = item?.bookingRef || "";
    el("itemCostTotal").value = Number.isFinite(Number(item?.costTotal)) ? item.costTotal : "";
    el("itemAdultCost").value = Number.isFinite(Number(item?.adultCost)) ? item.adultCost : "";
    el("itemChildCost").value = Number.isFinite(Number(item?.childCost)) ? item.childCost : "";
    el("itemNotes").value = item?.notes || prefill?.notes || "";
    el("itemError").textContent = "";
    el("deleteItemBtn").classList.toggle("hidden", !item);

    const currencies = new Set(["AUD"]);
    (state.trip.budget?.destinations || []).forEach((d) => currencies.add(d.currency));
    el("itemCostCurrency").innerHTML = [...currencies].map((code) => `<option value="${code}">${code}</option>`).join("");

    const itemDate = el("itemDate").value;
    const startingCurrency = item?.costCurrency || preferredCurrencyForDate(itemDate) || "AUD";
    el("itemCostCurrency").value = currencies.has(startingCurrency) ? startingCurrency : "AUD";

    const startingRate = item?.fxRate ?? planningRateFor(el("itemCostCurrency").value, itemDate);
    el("itemFxRate").value = startingRate ? String(startingRate) : "";
    updateItemFxPreview(false);
    renderItemPeopleControls(item);

    const dialog = el("itineraryItemDialog");
    showModalSafe(dialog);
  }

  function closeItineraryItemDialog() {
    pendingPlaceToScheduleId = "";
    closeModalSafe(el("itineraryItemDialog"));
  }

  function openDayDialog() {
    const meta = state.trip?.dayMeta?.[selectedItineraryDate] || {};
    el("dayDate").value = selectedItineraryDate;
    el("dayHeadline").value = meta.headline || "";
    el("dayLocation").value = meta.location || "";
    el("dayOvernight").value = meta.overnight || "";
    el("dayNotes").value = meta.notes || "";
    showModalSafe(el("dayDialog"));
  }

  el("homeOpenItineraryBtn").addEventListener("click", () => {
    selectedItineraryDate = defaultSelectedDate();
    itineraryViewMode = "day";
    activateMode("itinerary");
    renderItinerary();
  });

  el("homeOpenRemindersBtn").addEventListener("click", () => {
    activateMode("more");
    el("remindersPanel").open = true;
    setTimeout(() => el("remindersPanel").scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  });

  el("homeAddNoteBtn").addEventListener("click", () => {
    selectedItineraryDate = todayISO();
    openDayNoteDialog();
  });

  el("addDocumentBtn").addEventListener("click", () => openDocumentDialog());
  el("closeDocumentDialogBtn").addEventListener("click", () => closeModalSafe(el("documentDialog")));

  el("documentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = el("documentId").value;
    const title = el("documentTitle").value.trim();
    if (!title) {
      el("documentError").textContent = "Enter a document title.";
      return;
    }

    const existing = id ? state.trip.documents.find((x) => x.id === id) : null;
    const file = el("documentAttachment").files?.[0] || null;
    let attachmentId = existing?.attachmentId || "";
    let attachmentName = existing?.attachmentName || "";
    let attachmentType = existing?.attachmentType || "";

    if (file) {
      attachmentId = attachmentId || uid("file");
      try {
        await saveVaultAttachment(attachmentId, file);
        attachmentName = file.name;
        attachmentType = file.type || "";
      } catch (error) {
        el("documentError").textContent = `Could not store the local file: ${error.message}`;
        return;
      }
    }

    const doc = normalizeDocument({
      id: existing?.id || uid("doc"),
      title,
      category: el("documentCategory").value,
      linkedItineraryId: el("documentLinkedItinerary").value,
      bookingRef: el("documentBookingRef").value.trim(),
      confirmation: el("documentConfirmation").value.trim(),
      phone: el("documentPhone").value.trim(),
      website: el("documentWebsite").value.trim(),
      notes: el("documentNotes").value.trim(),
      attachmentId,
      attachmentName,
      attachmentType,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    if (existing) state.trip.documents = state.trip.documents.map((x) => x.id === id ? doc : x);
    else state.trip.documents.push(doc);

    saveState();
    closeModalSafe(el("documentDialog"));
    renderDocuments();
  });

  el("deleteDocumentBtn").addEventListener("click", async () => {
    const id = el("documentId").value;
    const doc = state.trip?.documents.find((x) => x.id === id);
    if (!doc || !window.confirm(`Delete "${doc.title}"?`)) return;
    if (doc.attachmentId) await deleteVaultAttachment(doc.attachmentId);
    state.trip.documents = state.trip.documents.filter((x) => x.id !== id);
    saveState();
    closeModalSafe(el("documentDialog"));
    renderDocuments();
  });

  el("addTravelInfoBtn").addEventListener("click", () => openTravelInfoDialog());
  el("closeTravelInfoDialogBtn").addEventListener("click", () => closeModalSafe(el("travelInfoDialog")));

  el("travelInfoForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = el("travelInfoId").value;
    const name = el("travelInfoName").value.trim();
    if (!name) {
      el("travelInfoError").textContent = "Enter a name.";
      return;
    }
    const existing = id ? state.trip.travelInfo.find((x) => x.id === id) : null;
    const info = normalizeTravelInfo({
      id: existing?.id || uid("info"),
      type: el("travelInfoType").value,
      name,
      reference: el("travelInfoReference").value.trim(),
      phone: el("travelInfoPhone").value.trim(),
      email: el("travelInfoEmail").value.trim(),
      website: el("travelInfoWebsite").value.trim(),
      notes: el("travelInfoNotes").value.trim(),
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });
    if (existing) state.trip.travelInfo = state.trip.travelInfo.map((x) => x.id === id ? info : x);
    else state.trip.travelInfo.push(info);
    saveState();
    closeModalSafe(el("travelInfoDialog"));
    renderTravelInfo();
  });

  el("deleteTravelInfoBtn").addEventListener("click", () => {
    const id = el("travelInfoId").value;
    const info = state.trip?.travelInfo.find((x) => x.id === id);
    if (!info || !window.confirm(`Delete "${info.name}"?`)) return;
    state.trip.travelInfo = state.trip.travelInfo.filter((x) => x.id !== id);
    saveState();
    closeModalSafe(el("travelInfoDialog"));
    renderTravelInfo();
  });

  el("addPlaceBtn").addEventListener("click", () => openPlaceDialog());
  el("closePlaceDialogBtn").addEventListener("click", () => closeModalSafe(el("placeDialog")));

  el("placeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = el("placeId").value;
    const title = el("placeTitle").value.trim();
    if (!title) {
      el("placeError").textContent = "Enter a place name.";
      return;
    }
    const existing = id ? state.trip.places.find((x) => x.id === id) : null;
    const nextLocation = el("placeLocation").value.trim();
    const sameMappedLocation = Boolean(
      existing &&
      String(existing.location || "").trim() === nextLocation &&
      Number.isFinite(Number(existing.latitude)) &&
      Number.isFinite(Number(existing.longitude))
    );

    const place = normalizePlace({
      id: existing?.id || uid("place"),
      title,
      category: el("placeCategory").value,
      status: el("placeStatus").value,
      location: nextLocation,
      latitude: sameMappedLocation ? existing.latitude : null,
      longitude: sameMappedLocation ? existing.longitude : null,
      geocodeLabel: sameMappedLocation ? existing.geocodeLabel : "",
      geocodedAt: sameMappedLocation ? existing.geocodedAt : null,
      website: el("placeWebsite").value.trim(),
      notes: el("placeNotes").value.trim(),
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });
    if (existing) state.trip.places = state.trip.places.map((x) => x.id === id ? place : x);
    else state.trip.places.push(place);
    saveState();
    closeModalSafe(el("placeDialog"));
    renderPlaces();
    if (place.location && !sameMappedLocation) {
      window.TripMap?.queueGeocode?.("place", place.id);
    }
  });

  el("deletePlaceBtn").addEventListener("click", () => {
    const id = el("placeId").value;
    const place = state.trip?.places.find((x) => x.id === id);
    if (!place || !window.confirm(`Delete "${place.title}"?`)) return;
    state.trip.places = state.trip.places.filter((x) => x.id !== id);
    saveState();
    closeModalSafe(el("placeDialog"));
    renderPlaces();
  });

  el("addTimelineNoteBtn").addEventListener("click", () => openTimelineNoteDialog());
  el("closeTimelineNoteDialogBtn").addEventListener("click", () => closeModalSafe(el("timelineNoteDialog")));

  el("timelineNoteForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const id = el("timelineNoteId").value;
    const date = el("timelineNoteDate").value;
    const textValue = el("timelineNoteText").value.trim();

    if (!date || dayNumber(date) < dayNumber(state.trip.startDate) || dayNumber(date) > dayNumber(state.trip.endDate)) {
      el("timelineNoteError").textContent = "Choose a date within the trip.";
      return;
    }

    if (!textValue) {
      el("timelineNoteError").textContent = "Enter a note.";
      return;
    }

    const existing = id ? (state.trip.timelineNotes || []).find((x) => x.id === id) : null;
    const note = normalizeTimelineNote({
      id: existing?.id || uid("timeline-note"),
      date,
      time: el("timelineNoteTime").value,
      title: el("timelineNoteTitle").value.trim(),
      text: textValue,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    if (existing) state.trip.timelineNotes = state.trip.timelineNotes.map((x) => x.id === id ? note : x);
    else state.trip.timelineNotes.push(note);

    selectedItineraryDate = date;
    saveState();
    closeModalSafe(el("timelineNoteDialog"));
    renderItinerary();
  });

  el("deleteTimelineNoteBtn").addEventListener("click", () => {
    const id = el("timelineNoteId").value;
    const note = (state.trip?.timelineNotes || []).find((x) => x.id === id);
    if (!note || !window.confirm("Delete this timeline note?")) return;

    state.trip.timelineNotes = state.trip.timelineNotes.filter((x) => x.id !== id);
    saveState();
    closeModalSafe(el("timelineNoteDialog"));
    renderItinerary();
  });

  el("addDayNoteBtn").addEventListener("click", () => openDayNoteDialog());
  el("closeDayNoteDialogBtn").addEventListener("click", () => closeModalSafe(el("dayNoteDialog")));

  el("dayNoteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = el("dayNoteId").value;
    const textValue = el("dayNoteText").value.trim();
    if (!textValue) {
      el("dayNoteError").textContent = "Enter a note.";
      return;
    }

    if (!state.trip.dayNotes[selectedItineraryDate]) state.trip.dayNotes[selectedItineraryDate] = [];
    const notes = state.trip.dayNotes[selectedItineraryDate];
    const existing = id ? notes.find((x) => x.id === id) : null;
    const note = normalizeDayNote({
      id: existing?.id || uid("note"),
      title: el("dayNoteTitle").value.trim(),
      text: textValue,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    if (existing) state.trip.dayNotes[selectedItineraryDate] = notes.map((x) => x.id === id ? note : x);
    else state.trip.dayNotes[selectedItineraryDate].push(note);

    saveState();
    closeModalSafe(el("dayNoteDialog"));
    renderDayJournal();
    renderHome();
  });

  el("deleteDayNoteBtn").addEventListener("click", () => {
    const id = el("dayNoteId").value;
    const notes = state.trip?.dayNotes?.[selectedItineraryDate] || [];
    const note = notes.find((x) => x.id === id);
    if (!note || !window.confirm("Delete this day note?")) return;
    state.trip.dayNotes[selectedItineraryDate] = notes.filter((x) => x.id !== id);
    saveState();
    closeModalSafe(el("dayNoteDialog"));
    renderDayJournal();
    renderHome();
  });

  el("addReminderBtn").addEventListener("click", () => openReminderDialog());
  el("closeReminderDialogBtn").addEventListener("click", () => closeModalSafe(el("reminderDialog")));

  el("reminderForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = el("reminderId").value;
    const title = el("reminderTitle").value.trim();
    const dueAt = el("reminderDueAt").value;

    if (!title || !dueAt || !Number.isFinite(dateTimeMs(dueAt))) {
      el("reminderError").textContent = "Enter a reminder and valid date/time.";
      return;
    }

    const existing = id ? state.trip.reminders.find((x) => x.id === id) : null;
    const reminder = normalizeReminder({
      id: existing?.id || uid("rem"),
      title,
      dueAt,
      notes: el("reminderNotes").value.trim(),
      status: existing?.status || "Active",
      linkedKind: el("reminderLinkedKind").value,
      linkedId: el("reminderLinkedId").value,
      notifiedAt: existing?.dueAt === dueAt && existing?.title === title ? existing?.notifiedAt : null,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    if (existing) state.trip.reminders = state.trip.reminders.map((x) => x.id === id ? reminder : x);
    else state.trip.reminders.push(reminder);

    saveState();
    closeModalSafe(el("reminderDialog"));
    renderReminders();
    renderHome();
    checkRemindersAndNotify();
  });

  el("deleteReminderBtn").addEventListener("click", () => {
    const id = el("reminderId").value;
    const reminder = state.trip?.reminders.find((x) => x.id === id);
    if (!reminder || !window.confirm(`Delete "${reminder.title}"?`)) return;
    state.trip.reminders = state.trip.reminders.filter((x) => x.id !== id);
    saveState();
    closeModalSafe(el("reminderDialog"));
    renderReminders();
    renderHome();
    updateReminderBadge();
    scheduleReminderCheck();
  });

  el("enableNotificationsBtn").addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    try {
      const permission = await Notification.requestPermission();
      renderNotificationStatus();
      if (permission === "granted") await checkRemindersAndNotify();
    } catch {
      el("notificationStatusText").textContent = "Could not request notification permission on this device.";
    }
  });

  el("addTravellerBtn").addEventListener("click", () => openTravellerDialog());
  el("closeTravellerDialogBtn").addEventListener("click", () => closeModalSafe(el("travellerDialog")));

  el("travellerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = el("travellerId").value;
    const name = el("travellerName").value.trim();
    const type = el("travellerType").value === "child" ? "child" : "adult";

    if (!name) {
      el("travellerError").textContent = "Enter a traveller name.";
      return;
    }

    const existing = id ? state.trip.travellerProfiles.find((person) => person.id === id) : null;
    const person = normalizeTravellerProfile({
      id: existing?.id || uid("person"),
      name,
      type,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    if (existing) {
      state.trip.travellerProfiles = state.trip.travellerProfiles.map((x) => x.id === id ? person : x);

      // If an adult is changed to a child, they must immediately stop being a payer.
      if (type === "child") {
        state.trip.itinerary = state.trip.itinerary.map((item) => {
          const payerIds = (item.payerIds || []).filter((payerId) => payerId !== id);
          let paymentMode = item.paymentMode || "none";
          if (paymentMode === "individual" && payerIds.length === 0) paymentMode = "none";
          if (paymentMode === "split" && payerIds.length < 2) paymentMode = "none";
          return { ...item, payerIds, paymentMode };
        });

        state.trip.preTripTasks = state.trip.preTripTasks.map((task) => {
          const payerIds = (task.payerIds || []).filter((payerId) => payerId !== id);
          let paymentMode = task.paymentMode || "none";
          if (paymentMode === "individual" && payerIds.length === 0) paymentMode = "none";
          if (paymentMode === "split" && payerIds.length < 2) paymentMode = "none";
          return { ...task, payerIds, paymentMode };
        });
      }
    } else {
      state.trip.travellerProfiles.push(person);
    }

    syncTravellerCounts();
    saveState();
    closeModalSafe(el("travellerDialog"));
    renderTravellerSettings();
    renderItinerary();
    el("travellerSettingsMessage").textContent = "Travellers saved.";
  });

  el("deleteTravellerBtn").addEventListener("click", () => {
    const id = el("travellerId").value;
    const person = state.trip?.travellerProfiles.find((x) => x.id === id);
    if (!person || !window.confirm(`Delete "${person.name}" from this trip?`)) return;

    state.trip.travellerProfiles = state.trip.travellerProfiles.filter((x) => x.id !== id);
    state.trip.itinerary = state.trip.itinerary.map((item) => {
      const attendeeIds = (item.attendeeIds || []).filter((personId) => personId !== id);
      const payerIds = (item.payerIds || []).filter((personId) => personId !== id);
      let paymentMode = item.paymentMode || "none";
      if (paymentMode === "individual" && payerIds.length === 0) paymentMode = "none";
      if (paymentMode === "split" && payerIds.length < 2) paymentMode = "none";
      return { ...item, attendeeIds, payerIds, paymentMode };
    });

    state.trip.preTripTasks = state.trip.preTripTasks.map((task) => {
      const payerIds = (task.payerIds || []).filter((personId) => personId !== id);
      let paymentMode = task.paymentMode || "none";
      if (paymentMode === "individual" && payerIds.length === 0) paymentMode = "none";
      if (paymentMode === "split" && payerIds.length < 2) paymentMode = "none";
      return { ...task, payerIds, paymentMode };
    });

    syncTravellerCounts();
    saveState();
    closeModalSafe(el("travellerDialog"));
    renderTravellerSettings();
    renderItinerary();
    el("travellerSettingsMessage").textContent = "Traveller removed.";
  });

  el("settingsBtn").addEventListener("click", () => activateMode("settings"));
  el("settingsCloseBtn").addEventListener("click", () => activateMode(lastNonSettingsMode || uiSettings.startScreen));

  el("settingsAppearance").addEventListener("change", () => {
    uiSettings.appearance = ["system", "light", "dark"].includes(el("settingsAppearance").value)
      ? el("settingsAppearance").value
      : "system";
    saveUiSettings();
    applyAppearance();
  });

  el("settingsStartScreen").addEventListener("change", () => {
    uiSettings.startScreen = el("settingsStartScreen").value;
    saveUiSettings();
  });

  el("settingsItineraryView").addEventListener("change", () => {
    uiSettings.itineraryDefaultView = el("settingsItineraryView").value === "full" ? "full" : "day";
    itineraryViewMode = uiSettings.itineraryDefaultView;
    saveUiSettings();
  });

  el("settingsHomeNextCount").addEventListener("change", () => {
    const value = Number(el("settingsHomeNextCount").value);
    uiSettings.homeNextCount = [1, 2, 3, 5].includes(value) ? value : 3;
    saveUiSettings();
    renderHome();
  });

  document.querySelectorAll("[data-home-widget]").forEach((input) => {
    input.addEventListener("change", () => {
      uiSettings.homeWidgets[input.dataset.homeWidget] = input.checked;
      saveUiSettings();
      renderHome();
    });
  });

  document.querySelectorAll("[data-summary-widget]").forEach((input) => {
    input.addEventListener("change", () => {
      uiSettings.summaryWidgets[input.dataset.summaryWidget] = input.checked;
      saveUiSettings();
      applySummaryWidgetVisibility();
    });
  });

  el("resetLayoutBtn").addEventListener("click", resetUiSettings);

  el("settingsOpenRemindersBtn").addEventListener("click", () => {
    activateMode("more");
    el("remindersPanel").open = true;
    setTimeout(() => el("remindersPanel").scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  });

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

    const day1HardLimit = el("day1HardLimit").value === "" ? null : Number(el("day1HardLimit").value);
    if (day1HardLimit !== null && (!Number.isFinite(day1HardLimit) || day1HardLimit < 0 || day1HardLimit > Number(el("totalBudget").value))) {
      el("setupError").textContent = "Day 1 hard limit must be between A$0 and the total trip budget.";
      return;
    }

    const trip = emptyTrip();
    trip.name = el("tripName").value.trim();
    trip.startDate = el("startDate").value;
    trip.endDate = el("endDate").value;
    trip.travellers = {
      adults: Math.max(0, Number(el("adultCount").value || 0)),
      children: Math.max(0, Number(el("childCount").value || 0))
    };
    ensureTravellerProfiles(trip);
    trip.budget = {
      configured: true,
      totalBudget: Number(el("totalBudget").value),
      day1HardLimit,
      destinations
    };

    state = { version: APP_VERSION, trip, expenses: [] };
    setupVisible = false;
    selectedItineraryDate = trip.startDate;
    settingsDraftDestinations = [];
    saveState();
    render();
    activateMode(uiSettings.startScreen);
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

  el("closeDirectionsDialogBtn").addEventListener("click", () => {
    closeModalSafe(el("directionsDialog"));
  });

  el("openAppleMapsBtn").addEventListener("click", () => {
    if (directionsTarget) openExternalMap(appleMapsUrl(directionsTarget));
  });

  el("openGoogleMapsBtn").addEventListener("click", () => {
    if (directionsTarget) openExternalMap(googleMapsUrl(directionsTarget));
  });

  el("openWazeBtn").addEventListener("click", () => {
    if (directionsTarget) openExternalMap(wazeUrl(directionsTarget));
  });

  el("copyDirectionsDestinationBtn").addEventListener("click", async () => {
    if (!directionsTarget) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(directionsTarget);
      } else {
        const area = document.createElement("textarea");
        area.value = directionsTarget;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      el("directionsMessage").textContent = "Location copied.";
    } catch {
      el("directionsMessage").textContent = "Could not copy automatically. Press and hold the destination above to copy it.";
    }
  });


  document.querySelectorAll('input[name="itemPaymentMode"]').forEach((radio) => {
    radio.addEventListener("change", updateItemPaymentControls);
  });
  el("itemIndividualPayer").addEventListener("change", updateItemPaymentControls);
  el("itemCostTotal").addEventListener("input", () => updateItemFxPreview(false));
  el("itemAdultCost").addEventListener("input", () => updateItemFxPreview(false));
  el("itemChildCost").addEventListener("input", () => updateItemFxPreview(false));
  el("itemCostCurrency").addEventListener("change", () => updateItemFxPreview(true));
  el("itemDate").addEventListener("change", () => updateItemFxPreview(true));
  el("itemFxRate").addEventListener("input", () => updateItemFxPreview(false));
  el("itemStartTimeZone").addEventListener("change", () => {
    if (!el("itemEndTimeZone").value.trim()) {
      el("itemEndTimeZone").value = el("itemStartTimeZone").value.trim();
    }
  });
  el("itemDate").addEventListener("change", () => {
    if (el("itemEndDate").value && dayNumber(el("itemEndDate").value) < dayNumber(el("itemDate").value)) {
      el("itemEndDate").value = "";
    }
  });

  document.querySelectorAll('input[name="preTripPaymentMode"]').forEach((radio) => {
    radio.addEventListener("change", updatePreTripPaymentControls);
  });
  el("preTripIndividualPayer").addEventListener("change", updatePreTripPaymentControls);
  el("preTripCost").addEventListener("input", () => updatePreTripFxPreview(false));
  el("preTripCostCurrency").addEventListener("change", () => updatePreTripFxPreview(true));
  el("preTripFxRate").addEventListener("input", () => updatePreTripFxPreview(false));

  el("addPreTripTaskBtn").addEventListener("click", () => openPreTripTaskDialog());
  el("closePreTripDialogBtn").addEventListener("click", () => closeModalSafe(el("preTripTaskDialog")));

  el("preTripTaskForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const id = el("preTripTaskId").value;
    const title = el("preTripTitle").value.trim();
    if (!title) {
      el("preTripTaskError").textContent = "Enter a task name.";
      return;
    }

    const paymentMode = document.querySelector('input[name="preTripPaymentMode"]:checked')?.value || "none";
    const taskCost = el("preTripCost").value === "" ? null : Number(el("preTripCost").value);
    const costCurrency = el("preTripCostCurrency").value || "AUD";
    const fxRate = costCurrency === "AUD" ? 1 : Number(el("preTripFxRate").value);

    if (taskCost !== null && Number.isFinite(taskCost) && costCurrency !== "AUD" && (!Number.isFinite(fxRate) || fxRate <= 0)) {
      el("preTripTaskError").textContent = `Enter a valid ${costCurrency} planning exchange rate.`;
      return;
    }

    const capturedAudCost = taskCost === null
      ? null
      : audFromLocalCost(taskCost, costCurrency, "", fxRate);

    if (taskCost !== null && Number.isFinite(taskCost) && taskCost > 0 && paymentMode === "individual" && !el("preTripIndividualPayer").value) {
      el("preTripTaskError").textContent = "Choose the adult responsible for this cost.";
      return;
    }

    if (taskCost !== null && Number.isFinite(taskCost) && taskCost > 0 && paymentMode === "split") {
      const selectedSplitPayers = document.querySelectorAll("[data-pretrip-split-payer]:checked").length;
      if (selectedSplitPayers < 2) {
        el("preTripTaskError").textContent = "Choose at least two adults to split this cost.";
        return;
      }
    }

    const existing = id ? state.trip.preTripTasks.find((x) => x.id === id) : null;
    const task = normalizePreTripTask({
      id: existing?.id || uid("pre"),
      title,
      dueDate: el("preTripDueDate").value,
      category: el("preTripCategory").value,
      status: el("preTripStatus").value,
      costTotal: taskCost,
      costCurrency,
      costAud: capturedAudCost,
      fxRate: taskCost === null ? null : fxRate,
      fxRateCapturedAt: taskCost === null ? "" : new Date().toISOString(),
      paymentMode,
      payerIds: paymentMode === "individual"
        ? (el("preTripIndividualPayer").value ? [el("preTripIndividualPayer").value] : [])
        : paymentMode === "split"
          ? [...document.querySelectorAll("[data-pretrip-split-payer]:checked")].map((input) => input.value)
          : [],
      notes: el("preTripNotes").value.trim(),
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    if (existing) {
      state.trip.preTripTasks = state.trip.preTripTasks.map((x) => x.id === id ? task : x);
    } else {
      state.trip.preTripTasks.push(task);
    }

    saveState();
    closeModalSafe(el("preTripTaskDialog"));
    renderPreTrip();
    renderSummary();
  });

  el("deletePreTripTaskBtn").addEventListener("click", () => {
    const id = el("preTripTaskId").value;
    const task = state.trip?.preTripTasks.find((x) => x.id === id);
    if (!task) return;
    if (!window.confirm(`Delete "${task.title}"?`)) return;

    state.trip.preTripTasks = state.trip.preTripTasks.filter((x) => x.id !== id);
    saveState();
    closeModalSafe(el("preTripTaskDialog"));
    renderPreTrip();
    renderSummary();
  });

  el("preTripImportInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importPreTripUpdate(file);
    event.target.value = "";
  });

  el("addItineraryItemBtn").addEventListener("click", () => openItineraryItemDialog());
  el("closeItemDialogBtn").addEventListener("click", closeItineraryItemDialog);
  el("editDayBtn").addEventListener("click", openDayDialog);
  el("closeDayDialogBtn").addEventListener("click", () => closeModalSafe(el("dayDialog")));

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

    const endDate = el("itemEndDate").value;
    const startTimeZone = el("itemStartTimeZone").value.trim();
    const endTimeZone = el("itemEndTimeZone").value.trim();

    if (endDate && dayNumber(endDate) < dayNumber(date)) {
      el("itemError").textContent = "Arrival / end date cannot be before the start date.";
      return;
    }

    if (startTimeZone && !validTimeZone(startTimeZone)) {
      el("itemError").textContent = "Start time zone is not valid. Use a zone such as Australia/Brisbane or Asia/Tokyo.";
      return;
    }

    if (endTimeZone && !validTimeZone(endTimeZone)) {
      el("itemError").textContent = "End time zone is not valid. Use a zone such as Asia/Shanghai or Asia/Tokyo.";
      return;
    }

    if ((startTimeZone && !endTimeZone) || (!startTimeZone && endTimeZone)) {
      el("itemError").textContent = "For timezone-aware timing, enter both the start and end time zones.";
      return;
    }

    const paymentMode = document.querySelector('input[name="itemPaymentMode"]:checked')?.value || "none";
    const eventCost = el("itemCostTotal").value === "" ? null : Number(el("itemCostTotal").value);
    const localEffectiveCost = itemFormLocalCost();
    const costCurrency = el("itemCostCurrency").value || "AUD";
    const fxRate = costCurrency === "AUD" ? 1 : Number(el("itemFxRate").value);

    if (localEffectiveCost !== null && Number.isFinite(localEffectiveCost) && costCurrency !== "AUD" && (!Number.isFinite(fxRate) || fxRate <= 0)) {
      el("itemError").textContent = `Enter a valid ${costCurrency} planning exchange rate.`;
      return;
    }

    const capturedAudCost = localEffectiveCost === null
      ? null
      : audFromLocalCost(localEffectiveCost, costCurrency, date, fxRate);

    if (eventCost !== null && Number.isFinite(eventCost) && eventCost > 0 && paymentMode === "individual" && !el("itemIndividualPayer").value) {
      el("itemError").textContent = "Choose the adult responsible for this cost.";
      return;
    }

    if (eventCost !== null && Number.isFinite(eventCost) && eventCost > 0 && paymentMode === "split") {
      const selectedSplitPayers = document.querySelectorAll("[data-item-split-payer]:checked").length;
      if (selectedSplitPayers < 2) {
        el("itemError").textContent = "Choose at least two adults to split this cost.";
        return;
      }
    }

    const existing = id ? state.trip.itinerary.find((x) => x.id === id) : null;
    const nextLocation = el("itemLocation").value.trim();
    const sameMappedLocation = Boolean(
      existing &&
      String(existing.location || "").trim() === nextLocation &&
      Number.isFinite(Number(existing.latitude)) &&
      Number.isFinite(Number(existing.longitude))
    );

    const item = normalizeItineraryItem({
      id: existing?.id || uid("itin"),
      date,
      type: el("itemType").value,
      title,
      startTime: el("itemStartTime").value,
      endTime: el("itemEndTime").value,
      endDate,
      startTimeZone,
      endTimeZone,
      durationText: el("itemDurationText").value.trim(),
      location: nextLocation,
      latitude: sameMappedLocation ? existing.latitude : null,
      longitude: sameMappedLocation ? existing.longitude : null,
      geocodeLabel: sameMappedLocation ? existing.geocodeLabel : "",
      geocodedAt: sameMappedLocation ? existing.geocodedAt : null,
      status: el("itemStatus").value,
      bookingRef: el("itemBookingRef").value.trim(),
      costTotal: el("itemCostTotal").value === "" ? null : Number(el("itemCostTotal").value),
      adultCost: el("itemAdultCost").value === "" ? null : Number(el("itemAdultCost").value),
      childCost: el("itemChildCost").value === "" ? null : Number(el("itemChildCost").value),
      costCurrency,
      costAud: capturedAudCost,
      fxRate: localEffectiveCost === null ? null : fxRate,
      fxRateCapturedAt: localEffectiveCost === null ? "" : new Date().toISOString(),
      attendeeIds: [...document.querySelectorAll("[data-item-attendee]:checked")].map((input) => input.value),
      paymentMode,
      payerIds: paymentMode === "individual"
        ? (el("itemIndividualPayer").value ? [el("itemIndividualPayer").value] : [])
        : paymentMode === "split"
          ? [...document.querySelectorAll("[data-item-split-payer]:checked")].map((input) => input.value)
          : [],
      participants: "",
      notes: el("itemNotes").value.trim(),
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    if (existing) state.trip.itinerary = state.trip.itinerary.map((x) => x.id === id ? item : x);
    else state.trip.itinerary.push(item);

    if (!existing && pendingPlaceToScheduleId) {
      const place = state.trip.places.find((x) => x.id === pendingPlaceToScheduleId);
      if (place) {
        place.status = "Scheduled";
        place.updatedAt = Date.now();
      }
      pendingPlaceToScheduleId = "";
    }

    selectedItineraryDate = date;
    saveState();
    closeItineraryItemDialog();
    renderItinerary();
    renderSummary();
    if (item.location && !sameMappedLocation) {
      window.TripMap?.queueGeocode?.("itinerary", item.id);
    }
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
    renderSummary();
  });

  el("dayForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.trip.dayMeta[selectedItineraryDate] = {
      headline: el("dayHeadline").value.trim(),
      location: el("dayLocation").value.trim(),
      overnight: el("dayOvernight").value.trim(),
      notes: el("dayNotes").value.trim(),
      updatedAt: Date.now()
    };
    saveState();
    closeModalSafe(el("dayDialog"));
    renderItinerary();
    renderSummary();
  });

  el("shareItineraryLinkBtn").addEventListener("click", () => shareTripLink(false, el("quickExportMessage")));
  el("shareFullTripLinkBtn").addEventListener("click", () => shareTripLink(true, el("quickExportMessage")));
  el("quickExportBtn").addEventListener("click", () => exportTrip(el("quickExportMessage")));
  el("exportBtn").addEventListener("click", () => exportTrip(el("backupMessage")));

  el("importInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file && window.confirm("Import this trip file? If it is an update to the same trip, your budget, exchange rates and expense history on this device will be kept.")) {
      await importTripFile(file, el("backupMessage"));
    }
    event.target.value = "";
  });

  el("importLinkBtn").addEventListener("click", async () => {
    const value = el("importLinkInput").value.trim();
    const imported = await importTripFromPastedLink(value, el("importLinkMessage"));
    if (imported) el("importLinkInput").value = "";
  });

  el("configureBudgetForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const total = Number(el("configureBudgetTotal").value);
    const day1HardLimit = el("configureDay1HardLimit").value === "" ? null : Number(el("configureDay1HardLimit").value);

    if (!Number.isFinite(total) || total <= 0) {
      el("configureBudgetError").textContent = "Enter a budget greater than A$0.";
      return;
    }

    if (day1HardLimit !== null && (!Number.isFinite(day1HardLimit) || day1HardLimit < 0 || day1HardLimit > total)) {
      el("configureBudgetError").textContent = "Day 1 hard limit must be between A$0 and the total trip budget.";
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
    state.trip.budget.day1HardLimit = day1HardLimit;
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
    const nextDay1HardLimit = el("settingsDay1HardLimit").value === "" ? null : Number(el("settingsDay1HardLimit").value);
    const destinations = cloneDestinations(settingsDraftDestinations);

    const error = validateTripCreate(nextName, nextStart, nextEnd, nextBudget, destinations);
    el("settingsError").textContent = error;
    if (error) return;

    if (nextDay1HardLimit !== null && (!Number.isFinite(nextDay1HardLimit) || nextDay1HardLimit < 0 || nextDay1HardLimit > nextBudget)) {
      el("settingsError").textContent = "Day 1 hard limit must be between A$0 and the total trip budget.";
      return;
    }

    const destinationIds = new Set(destinations.map((d) => d.id));
    if (state.expenses.some((x) => x.destinationId && !destinationIds.has(x.destinationId))) {
      el("settingsError").textContent = "You cannot remove a destination that already has expenses. Reassign or delete those expenses first.";
      return;
    }

    state.trip.name = nextName;
    state.trip.startDate = nextStart;
    state.trip.endDate = nextEnd;
    state.trip.updatedAt = Date.now();
    state.trip.budget.totalBudget = nextBudget;
    state.trip.budget.day1HardLimit = nextDay1HardLimit;
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
    if (typeof el("confirmDialog").showModal === "function") showModalSafe(el("confirmDialog"));
    else if (window.confirm("Erase this trip from this device?")) resetAll();
  });

  el("confirmDialog").addEventListener("close", () => {
    if (el("confirmDialog").returnValue === "confirm") resetAll();
  });

  function resetAll() {
    window.FamilySync?.disconnect?.({ forget: true, silent: true });
    clearVaultAttachments();
    state = blankState();
    localStorage.removeItem(STORAGE_KEY);
    setupDraftDestinations = [];
    settingsDraftDestinations = [];
    selectedItineraryDate = "";
    setupVisible = false;
    render();
    activateMode("itinerary");
  }


  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("close", syncModalLock);
    dialog.addEventListener("cancel", () => {
      setTimeout(syncModalLock, 0);
    });
  });

  function refreshCurrentTripDayIfNeeded() {
    const currentCalendarDate = todayISO();
    if (currentCalendarDate === lastObservedCalendarDate) return;

    lastObservedCalendarDate = currentCalendarDate;
    if (!state.trip) return;

    const currentN = dayNumber(currentCalendarDate);
    const startN = dayNumber(state.trip.startDate);
    const endN = dayNumber(state.trip.endDate);

    if (currentN >= startN && currentN <= endN) {
      selectedItineraryDate = currentCalendarDate;
      itineraryViewMode = "day";
      renderItinerary();
    }
  }



  function mapRecordQuery(location, date = "") {
    let target = directionsDestination({ location });
    const dayLocation = date ? String(state.trip?.dayMeta?.[date]?.location || "").trim() : "";

    if (dayLocation && target && !target.toLowerCase().includes(dayLocation.toLowerCase())) {
      target = `${target}, ${dayLocation}`;
    }
    return target;
  }

  function mapLocationRecords() {
    if (!state.trip) return [];

    const itineraryRecords = (state.trip.itinerary || [])
      .filter((item) => String(item.location || "").trim())
      .map((item) => ({
        kind: "itinerary",
        id: item.id,
        title: item.title,
        type: item.type || "Other",
        category: item.type || "Other",
        status: item.status || "",
        date: item.date || "",
        time: item.startTime || "",
        location: item.location || "",
        query: mapRecordQuery(item.location, item.date),
        latitude: Number.isFinite(Number(item.latitude)) ? Number(item.latitude) : null,
        longitude: Number.isFinite(Number(item.longitude)) ? Number(item.longitude) : null,
        geocodeLabel: item.geocodeLabel || "",
        isHotel: String(item.type || "").toLowerCase() === "accommodation",
        isWishlist: false
      }));

    const placeRecords = (state.trip.places || [])
      .filter((place) => String(place.location || "").trim())
      .map((place) => ({
        kind: "place",
        id: place.id,
        title: place.title,
        type: "Place",
        category: place.category || "Other",
        status: place.status || "",
        date: "",
        time: "",
        location: place.location || "",
        query: mapRecordQuery(place.location),
        latitude: Number.isFinite(Number(place.latitude)) ? Number(place.latitude) : null,
        longitude: Number.isFinite(Number(place.longitude)) ? Number(place.longitude) : null,
        geocodeLabel: place.geocodeLabel || "",
        isHotel: String(place.category || "").toLowerCase() === "hotel",
        isWishlist: String(place.status || "").toLowerCase() === "wishlist"
      }));

    return [...itineraryRecords, ...placeRecords];
  }

  function updateMapCoordinates(kind, id, latitude, longitude, label = "") {
    if (!state.trip) return false;

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    let item = null;
    if (kind === "itinerary") item = state.trip.itinerary.find((x) => x.id === id);
    if (kind === "place") item = state.trip.places.find((x) => x.id === id);
    if (!item) return false;

    item.latitude = lat;
    item.longitude = lng;
    item.geocodeLabel = String(label || "");
    item.geocodedAt = Date.now();
    item.updatedAt = Date.now();

    saveState();
    window.TripMap?.dataChanged?.();
    return true;
  }

  function clearMapCoordinates(kind, id) {
    if (!state.trip) return false;
    let item = null;
    if (kind === "itinerary") item = state.trip.itinerary.find((x) => x.id === id);
    if (kind === "place") item = state.trip.places.find((x) => x.id === id);
    if (!item) return false;

    item.latitude = null;
    item.longitude = null;
    item.geocodeLabel = "";
    item.geocodedAt = null;
    item.updatedAt = Date.now();
    saveState();
    window.TripMap?.dataChanged?.();
    return true;
  }

  function openMapRecord(kind, id) {
    if (kind === "itinerary") {
      const item = state.trip?.itinerary.find((x) => x.id === id);
      if (!item) return;
      selectedItineraryDate = item.date || defaultSelectedDate();
      itineraryViewMode = "day";
      activateMode("itinerary");
      renderItinerary();
      setTimeout(() => {
        document.querySelector(`[data-itinerary-id="${CSS.escape(id)}"]`)?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }, 120);
      return;
    }

    if (kind === "place") {
      activateMode("more");
      if (el("placesPanel")) el("placesPanel").open = true;
      setTimeout(() => openPlaceDialog(id), 80);
    }
  }

  function directionsForMapRecord(kind, id) {
    let item = null;
    if (kind === "itinerary") item = state.trip?.itinerary.find((x) => x.id === id);
    if (kind === "place") item = state.trip?.places.find((x) => x.id === id);
    if (!item?.location) return;
    openDirectionsChooser(directionsDestination(item), item.title || "");
  }

  window.TravelPlannerMapBridge = {
    getRecords: mapLocationRecords,
    updateCoordinates: updateMapCoordinates,
    clearCoordinates: clearMapCoordinates,
    openRecord: openMapRecord,
    directions: directionsForMapRecord,
    tripName: () => state.trip?.name || "Trip"
  };

  function familySharedState() {
    if (!state.trip) return null;

    const documents = (state.trip.documents || []).map((doc) => ({
      ...doc,
      attachmentId: ""
    }));

    return {
      schema: 1,
      core: {
        id: state.trip.id,
        name: state.trip.name,
        startDate: state.trip.startDate,
        endDate: state.trip.endDate,
        updatedAt: Number(state.trip.updatedAt || Date.now())
      },
      bootstrapDestinations: JSON.parse(JSON.stringify(state.trip.budget?.destinations || [])),
      travellerProfiles: JSON.parse(JSON.stringify(state.trip.travellerProfiles || [])),
      itinerary: JSON.parse(JSON.stringify(state.trip.itinerary || [])),
      preTripTasks: JSON.parse(JSON.stringify(state.trip.preTripTasks || [])),
      documents: JSON.parse(JSON.stringify(documents)),
      travelInfo: JSON.parse(JSON.stringify(state.trip.travelInfo || [])),
      places: JSON.parse(JSON.stringify(state.trip.places || [])),
      reminders: JSON.parse(JSON.stringify(state.trip.reminders || [])),
      timelineNotes: JSON.parse(JSON.stringify(state.trip.timelineNotes || [])),
      dayMeta: JSON.parse(JSON.stringify(state.trip.dayMeta || {}))
    };
  }

  function familyApplySharedState(shared) {
    if (!shared?.core?.id) return false;

    const currentTrip = state.trip;
    const sameTrip = Boolean(currentTrip?.id && currentTrip.id === shared.core.id);
    const preservedBudget = sameTrip && currentTrip?.budget
      ? JSON.parse(JSON.stringify(currentTrip.budget))
      : null;
    const preservedExpenses = sameTrip
      ? JSON.parse(JSON.stringify(state.expenses || []))
      : [];
    const existingDocuments = new Map(
      (sameTrip ? currentTrip.documents || [] : []).map((doc) => [doc.id, doc])
    );
    const preservedDayNotes = sameTrip
      ? JSON.parse(JSON.stringify(currentTrip.dayNotes || {}))
      : {};

    if (!sameTrip) {
      state = blankState();
      state.trip = emptyTrip();
      state.expenses = [];
    }

    state.trip.id = String(shared.core.id);
    state.trip.name = String(shared.core.name || "Shared trip");
    state.trip.startDate = String(shared.core.startDate || "");
    state.trip.endDate = String(shared.core.endDate || "");
    state.trip.updatedAt = Number(shared.core.updatedAt || Date.now());

    state.trip.travellerProfiles = Array.isArray(shared.travellerProfiles)
      ? shared.travellerProfiles.map(normalizeTravellerProfile)
      : [];
    syncTravellerCounts();

    state.trip.itinerary = Array.isArray(shared.itinerary)
      ? shared.itinerary.map(normalizeItineraryItem)
      : [];
    state.trip.preTripTasks = Array.isArray(shared.preTripTasks)
      ? shared.preTripTasks.map(normalizePreTripTask)
      : [];

    state.trip.documents = Array.isArray(shared.documents)
      ? shared.documents.map((raw) => {
          const incoming = normalizeDocument(raw);
          const local = existingDocuments.get(incoming.id);
          if (!local) return incoming;
          return {
            ...incoming,
            attachmentId: local.attachmentId || "",
            attachmentName: local.attachmentName || incoming.attachmentName || "",
            attachmentType: local.attachmentType || incoming.attachmentType || ""
          };
        })
      : [];

    state.trip.travelInfo = Array.isArray(shared.travelInfo)
      ? shared.travelInfo.map(normalizeTravelInfo)
      : [];
    state.trip.places = Array.isArray(shared.places)
      ? shared.places.map(normalizePlace)
      : [];
    state.trip.reminders = Array.isArray(shared.reminders)
      ? shared.reminders.map(normalizeReminder)
      : [];
    state.trip.timelineNotes = Array.isArray(shared.timelineNotes)
      ? shared.timelineNotes.map(normalizeTimelineNote)
      : [];
    state.trip.dayMeta = shared.dayMeta && typeof shared.dayMeta === "object"
      ? JSON.parse(JSON.stringify(shared.dayMeta))
      : {};

    // Journal notes remain device-local in v23.
    state.trip.dayNotes = preservedDayNotes;

    if (preservedBudget) {
      state.trip.budget = preservedBudget;
      state.expenses = preservedExpenses;
    } else {
      state.trip.budget = {
        configured: false,
        totalBudget: null,
        day1HardLimit: null,
        destinations: Array.isArray(shared.bootstrapDestinations)
          ? shared.bootstrapDestinations.map(normalizeDestination)
          : []
      };
      state.expenses = [];
    }

    saveState({ skipFamilySync: true });
    selectedItineraryDate = defaultSelectedDate();
    settingsDraftDestinations = [];
    render();
    return true;
  }

  window.TravelPlannerSyncBridge = {
    hasTrip: () => Boolean(state.trip),
    getTripId: () => state.trip?.id || "",
    getTripName: () => state.trip?.name || "",
    getSharedState: familySharedState,
    applySharedState: familyApplySharedState,
    render: () => render()
  };

  const onSystemThemeChange = () => {
    if (uiSettings.appearance === "system") applyAppearance();
  };

  if (typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", onSystemThemeChange);
  } else if (typeof systemThemeQuery.addListener === "function") {
    systemThemeQuery.addListener(onSystemThemeChange);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshCurrentTripDayIfNeeded();
      checkRemindersAndNotify();
    }
  });
  window.addEventListener("focus", () => {
    refreshCurrentTripDayIfNeeded();
    checkRemindersAndNotify();
  });

  function updateConnection() {
    const badge = el("connectionBadge");
    const online = navigator.onLine;
    badge.textContent = online ? "Online" : "Offline • local data";
    badge.classList.toggle("online", online);
    badge.classList.toggle("offline", !online);
  }

  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
        registration.update().catch(() => {});
      } catch {}
    });
  }

  applyAppearance();
  updateConnection();
  render();
  if (state.trip) activateMode(uiSettings.startScreen);
  importSharedLinkFromHash();
  checkRemindersAndNotify();
})();
