(() => {
  "use strict";

  const STORAGE_KEY = "tripBudgetApp.v1";
  const APP_VERSION = 2;

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
  const setupPanel = el("setupPanel");
  const appPanel = el("appPanel");

  let state = loadState();
  let setupDraftDestinations = [];
  let settingsDraftDestinations = [];

  function blankState() {
    return { version: APP_VERSION, trip: null, expenses: [] };
  }

  function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function migrateState(parsed) {
    if (!parsed || typeof parsed !== "object") return blankState();

    if (Number(parsed.version) >= 2 && parsed.trip) {
      const trip = parsed.trip;
      return {
        version: APP_VERSION,
        trip: {
          name: String(trip.name || "Trip"),
          startDate: String(trip.startDate || ""),
          endDate: String(trip.endDate || ""),
          totalBudget: Number(trip.totalBudget || 0),
          destinations: Array.isArray(trip.destinations) ? trip.destinations.map(normalizeDestination) : []
        },
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses.map(normalizeExpense).filter(Boolean) : []
      };
    }

    if (parsed.trip) {
      const oldTrip = parsed.trip;
      const destinations = [
        normalizeDestination({
          id: "legacy-china",
          name: "China",
          currency: "CNY",
          rate: Number(oldTrip.cnyRate || 5),
          startDate: oldTrip.startDate,
          endDate: oldTrip.endDate
        }),
        normalizeDestination({
          id: "legacy-japan",
          name: "Japan",
          currency: "JPY",
          rate: Number(oldTrip.jpyRate || 110),
          startDate: oldTrip.startDate,
          endDate: oldTrip.endDate
        })
      ];

      const migratedExpenses = (Array.isArray(parsed.expenses) ? parsed.expenses : []).map((item) => {
        const destination = destinations.find((d) => d.name === item.country) || destinations[0];
        return normalizeExpense({
          ...item,
          destinationId: destination?.id || "",
          destinationName: item.country || destination?.name || "Trip",
          rateUsed: item.rateUsed || (
            item.currency === "JPY" ? Number(oldTrip.jpyRate || 110) :
            item.currency === "CNY" ? Number(oldTrip.cnyRate || 5) : 1
          )
        });
      }).filter(Boolean);

      return {
        version: APP_VERSION,
        trip: {
          name: String(oldTrip.name || "Trip"),
          startDate: String(oldTrip.startDate || ""),
          endDate: String(oldTrip.endDate || ""),
          totalBudget: Number(oldTrip.totalBudget || 0),
          destinations
        },
        expenses: migratedExpenses
      };
    }

    return blankState();
  }

  function normalizeDestination(item) {
    return {
      id: String(item?.id || uid("dest")),
      name: String(item?.name || "Destination"),
      currency: String(item?.currency || "AUD").toUpperCase(),
      rate: Number(item?.rate || 1),
      startDate: String(item?.startDate || ""),
      endDate: String(item?.endDate || "")
    };
  }

  function normalizeExpense(item) {
    const amount = Number(item?.amount);
    const audAmount = Number(item?.audAmount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
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
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
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

  function localAmount(value, currency) {
    const n = Number(value);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: ["JPY", "KRW", "VND", "IDR"].includes(currency) ? 0 : 2
      }).format(Number.isFinite(n) ? n : 0);
    } catch {
      return `${currency} ${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
    }
  }

  function destinationById(id) {
    return state.trip?.destinations?.find((d) => d.id === id) || null;
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
    if (!trip) return null;

    const today = todayISO();
    const startN = dayNumber(trip.startDate);
    const endN = dayNumber(trip.endDate);
    const todayN = dayNumber(today);
    const totalDays = daysInclusive(trip.startDate, trip.endDate);
    const spent = totalSpent();
    const remaining = Number(trip.totalBudget) - spent;
    const futureDays = futureDaysAfterToday(trip, today);

    let status = "during";
    let dayIndex = 0;
    let elapsedDays = 0;

    if (todayN < startN) {
      status = "before";
    } else if (todayN > endN) {
      status = "after";
      dayIndex = totalDays;
      elapsedDays = totalDays;
    } else {
      dayIndex = todayN - startN + 1;
      elapsedDays = dayIndex;
    }

    const availablePerFutureDay = futureDays > 0 ? remaining / futureDays : 0;
    const originalDaily = totalDays > 0 ? Number(trip.totalBudget) / totalDays : 0;
    const expectedSpent = originalDaily * elapsedDays;
    const pace = expectedSpent - spent;

    return {
      today,
      totalDays,
      spent,
      remaining,
      status,
      dayIndex,
      elapsedDays,
      futureDays,
      availablePerFutureDay,
      originalDaily,
      expectedSpent,
      pace,
      spentToday: totalSpent(expensesOn(today))
    };
  }

  function makeDestinationDraft(startDate = "", endDate = "", name = "", currency = "AUD", rate = 1) {
    return {
      id: uid("dest"),
      name,
      currency,
      rate,
      startDate,
      endDate
    };
  }

  function currencyOptions(selected) {
    return COMMON_CURRENCIES.map(([code, label]) =>
      `<option value="${code}" ${code === selected ? "selected" : ""}>${escapeHtml(label)}</option>`
    ).join("");
  }

  function destinationRowMarkup(item, mode, index) {
    const rateDisabled = item.currency === "AUD" ? "disabled" : "";
    const rateValue = item.currency === "AUD" ? "1" : (Number(item.rate) || "");
    const rateLabel = item.currency === "AUD" ? "AUD per A$1" : `${item.currency} per A$1`;

    return `
      <div class="destination-row" data-mode="${mode}" data-index="${index}">
        <div class="destination-row-top">
          <label>
            Destination / country
            <input class="dest-name" type="text" maxlength="50" value="${escapeHtml(item.name)}" placeholder="Japan" required>
          </label>
          <label>
            Currency
            <select class="dest-currency">${currencyOptions(item.currency)}</select>
          </label>
        </div>
        <div class="destination-row-bottom">
          <label>
            From
            <input class="dest-start" type="date" value="${escapeHtml(item.startDate)}" required>
          </label>
          <label>
            To
            <input class="dest-end" type="date" value="${escapeHtml(item.endDate)}" required>
          </label>
          <label>
            <span class="dest-rate-label">${escapeHtml(rateLabel)}</span>
            <input class="dest-rate" type="number" min="0.000001" step="0.000001" inputmode="decimal" value="${escapeHtml(rateValue)}" ${rateDisabled} required>
          </label>
        </div>
        <button class="remove-destination" type="button">Remove destination</button>
      </div>`;
  }

  function renderDestinationDrafts(mode) {
    const list = mode === "setup" ? setupDraftDestinations : settingsDraftDestinations;
    const container = mode === "setup" ? el("setupDestinations") : el("settingsDestinations");
    container.innerHTML = list.map((item, index) => destinationRowMarkup(item, mode, index)).join("");
    container.querySelectorAll(".destination-row").forEach((row) => bindDestinationRow(row));
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

    row.querySelector(".remove-destination").addEventListener("click", () => {
      sync();
      if (list.length <= 1) {
        alert("A trip needs at least one destination/currency period.");
        return;
      }
      list.splice(index, 1);
      renderDestinationDrafts(mode);
    });
  }

  function validateDestinations(destinations, tripStart, tripEnd) {
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
      if (d.currency !== "AUD" && (!Number.isFinite(Number(d.rate)) || Number(d.rate) <= 0)) {
        return `${d.name}: enter a valid exchange rate.`;
      }
    }
    return "";
  }

  function validateTrip(name, startDate, endDate, totalBudget, destinations) {
    if (!name.trim()) return "Enter a trip name.";
    if (!startDate || !endDate) return "Enter both trip dates.";
    if (dayNumber(endDate) < dayNumber(startDate)) return "End date must be on or after the start date.";
    if (!Number.isFinite(totalBudget) || totalBudget <= 0) return "Enter a budget greater than A$0.";
    if (daysInclusive(startDate, endDate) > 400) return "Trip dates must be within 400 days.";
    return validateDestinations(destinations, startDate, endDate);
  }

  function cloneDestinations(list) {
    return list.map((d) => normalizeDestination({ ...d }));
  }

  function setVisibility() {
    const hasTrip = Boolean(state.trip);
    setupPanel.classList.toggle("hidden", hasTrip);
    appPanel.classList.toggle("hidden", !hasTrip);

    if (!hasTrip && setupDraftDestinations.length === 0) {
      setupDraftDestinations = [makeDestinationDraft("", "", "", "AUD", 1)];
      renderDestinationDrafts("setup");
    }
  }

  function renderHeader() {
    if (!state.trip) {
      el("headerTripName").textContent = "Trip Budget";
      el("headerTripDates").textContent = "Set up your trip to begin.";
      return;
    }
    el("headerTripName").textContent = state.trip.name;
    el("headerTripDates").textContent = `${formatDate(state.trip.startDate)} – ${formatDate(state.trip.endDate)}`;
  }

  function renderDashboard() {
    if (!state.trip) return;
    const stats = tripStats();
    const budget = Number(state.trip.totalBudget);

    el("remainingBudget").textContent = aud(stats.remaining);
    el("remainingBudget").classList.toggle("bad", stats.remaining < 0);
    el("daysRemaining").textContent =
      stats.futureDays === 1 ? "1 future day" : `${stats.futureDays} future days`;

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

    const statusBox = el("tripStatus");
    if (stats.status === "before") {
      const until = dayNumber(state.trip.startDate) - dayNumber(stats.today);
      statusBox.textContent = `Your trip starts in ${until} day${until === 1 ? "" : "s"}. Before the trip, the available/day figure is spread across all trip days.`;
    } else if (stats.status === "after") {
      statusBox.textContent = `This trip ended on ${formatDate(state.trip.endDate)}. Your history remains available.`;
    } else if (stats.futureDays === 0) {
      statusBox.textContent = `Today is the final day of the trip. Remaining budget is shown above; there are no future days to redistribute it across.`;
    } else {
      statusBox.textContent = `Today is day ${stats.dayIndex} of ${stats.totalDays}. Future daily allowance excludes today and updates immediately as you spend.`;
    }
  }

  function setExpenseDestinationOptions(selectedId = "") {
    const select = el("expenseDestination");
    if (!state.trip) return;
    const destinations = state.trip.destinations || [];
    select.innerHTML = destinations.map((d) =>
      `<option value="${escapeHtml(d.id)}" ${d.id === selectedId ? "selected" : ""}>${escapeHtml(d.name)}</option>`
    ).join("");
    if (!selectedId && destinations.length) select.value = destinations[0].id;
    updateExpenseCurrencyOptions();
  }

  function matchingDestinationsForDate(dateStr) {
    if (!state.trip || !dateStr) return [];
    const n = dayNumber(dateStr);
    return state.trip.destinations.filter((d) => n >= dayNumber(d.startDate) && n <= dayNumber(d.endDate));
  }

  function autoDestinationForDate() {
    const date = el("expenseDate").value;
    const matches = matchingDestinationsForDate(date);
    if (matches.length === 1) {
      el("expenseDestination").value = matches[0].id;
    } else if (matches.length > 1) {
      const current = matches.find((d) => d.id === el("expenseDestination").value);
      if (!current) el("expenseDestination").value = matches[0].id;
    }
    updateExpenseCurrencyOptions();
  }

  function updateExpenseCurrencyOptions(preferred = "") {
    if (!state.trip) return;
    const destination = destinationById(el("expenseDestination").value);
    const localCurrency = destination?.currency || "AUD";
    const options = localCurrency === "AUD"
      ? [["AUD", "AUD $"]]
      : [["AUD", "AUD $"], [localCurrency, `${localCurrency} local`]];

    const select = el("expenseCurrency");
    const current = preferred || select.value;
    select.innerHTML = options.map(([code, label]) =>
      `<option value="${code}">${escapeHtml(label)}</option>`
    ).join("");
    select.value = options.some(([code]) => code === current) ? current : localCurrency;
    updateConversionPreview();
  }

  function setDefaultExpenseDate() {
    if (!state.trip || el("editingExpenseId").value) return;
    const today = todayISO();
    const start = state.trip.startDate;
    const end = state.trip.endDate;

    if (dayNumber(today) < dayNumber(start)) el("expenseDate").value = start;
    else if (dayNumber(today) > dayNumber(end)) el("expenseDate").value = end;
    else el("expenseDate").value = today;

    autoDestinationForDate();
  }

  function updateConversionPreview() {
    if (!state.trip) return;
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
      const rate = rateFor(destination, currency);
      el("conversionPreview").textContent =
        `${localAmount(amount, currency)} ≈ ${aud(converted)} at ${rate} ${currency} per A$1.`;
    }
  }

  function expenseMarkup(item) {
    const title = item.note?.trim() || item.category;
    const destinationName = item.destinationName || destinationById(item.destinationId)?.name || "Trip";
    const meta = `${formatDate(item.date, { weekday: true })} • ${item.category} • ${destinationName}`;
    const showConverted = item.currency !== "AUD";

    return `
      <article class="expense-item" data-expense-id="${escapeHtml(item.id)}">
        <div class="expense-main">
          <div class="expense-title"><strong>${escapeHtml(title)}</strong></div>
          <div class="expense-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="expense-amount">
          <strong>${escapeHtml(aud(item.audAmount))}</strong>
          ${showConverted ? `<span>${escapeHtml(localAmount(item.amount, item.currency))}</span>` : ""}
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
    if (!state.trip) return;
    const select = el("historyFilter");
    const current = select.value || "all";
    select.innerHTML = `<option value="all">All destinations</option>` +
      state.trip.destinations.map((d) =>
        `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`
      ).join("");
    select.value = [...select.options].some((o) => o.value === current) ? current : "all";
  }

  function renderExpenses() {
    if (!state.trip) return;

    const sorted = sortedExpenses();
    el("recentExpenses").innerHTML = sorted.length
      ? sorted.slice(0, 5).map(expenseMarkup).join("")
      : `<p class="expense-empty">No expenses yet. Your first entry will appear here.</p>`;

    const filter = el("historyFilter").value;
    const filtered = filter === "all" ? sorted : sorted.filter((x) => x.destinationId === filter);
    el("historyExpenses").innerHTML = filtered.length
      ? filtered.map(expenseMarkup).join("")
      : `<p class="expense-empty">No expenses match this filter.</p>`;

    const filteredTotal = totalSpent(filtered);
    const count = filtered.length;
    el("historySummary").innerHTML = `
      <span class="summary-chip">${count} entr${count === 1 ? "y" : "ies"}</span>
      <span class="summary-chip">${escapeHtml(aud(filteredTotal))} total</span>`;
  }

  function dayBudgetRows() {
    if (!state.trip) return [];

    const trip = state.trip;
    const totalDays = daysInclusive(trip.startDate, trip.endDate);
    const today = todayISO();
    const todayN = dayNumber(today);
    const startN = dayNumber(trip.startDate);
    const endN = dayNumber(trip.endDate);
    let remainingBudget = Number(trip.totalBudget);
    let currentFutureAllocation = null;
    const rows = [];

    for (let i = 0; i < totalDays; i++) {
      const date = addDays(trip.startDate, i);
      const dateN = dayNumber(date);
      const remainingDaysAtStart = totalDays - i;
      const spent = totalSpent(expensesOn(date));
      let allocation;

      if (todayN < startN) {
        // Before the trip, every day begins with the original even allocation.
        allocation = totalDays > 0 ? Number(trip.totalBudget) / totalDays : 0;
      } else if (todayN > endN || dateN <= todayN) {
        // Past days and today use the rolling allocation that existed at the
        // start of that day, based on actual spend on prior days.
        allocation = remainingDaysAtStart > 0 ? remainingBudget / remainingDaysAtStart : 0;
      } else {
        // Future days all show the CURRENT redistributed allowance rather than
        // pretending that intervening future days will spend $0.
        if (currentFutureAllocation === null) {
          const futureDays = endN - todayN;
          currentFutureAllocation = futureDays > 0 ? remainingBudget / futureDays : 0;
        }
        allocation = currentFutureAllocation;
      }

      const variance = allocation - spent;
      const matches = matchingDestinationsForDate(date);

      rows.push({
        day: i + 1,
        date,
        allocation,
        spent,
        variance,
        destinations: matches.map((d) => d.name)
      });

      // Only actual days up to and including today roll the live budget forward.
      // Once we reach future days, their displayed $0 spend must not artificially
      // increase later future-day allocations.
      if (todayN > endN || dateN <= todayN) {
        remainingBudget -= spent;
      }
    }

    return rows;
  }

  function renderDailyHistory() {
    if (!state.trip) return;
    const today = todayISO();
    const todayN = dayNumber(today);
    const rows = dayBudgetRows();

    el("dailyHistory").innerHTML = rows.map((row) => {
      const rowN = dayNumber(row.date);
      const isToday = row.date === today;
      const isFuture = rowN > todayN;
      const destinations = row.destinations.length ? row.destinations.join(" / ") : "—";
      const varianceClass = row.variance >= 0 ? "good" : "bad";
      const varianceText = `${row.variance >= 0 ? "+" : "−"}${aud(Math.abs(row.variance))}`;

      return `
        <article class="day-row ${isToday ? "today-row" : ""} ${isFuture ? "future-row" : ""}">
          <div class="day-name">
            <strong>Day ${row.day}${isToday ? " • Today" : ""}</strong>
            <span>${escapeHtml(formatDate(row.date, { weekday: true }))} • ${escapeHtml(destinations)}</span>
          </div>
          <div class="day-cell">
            <span>Allocation</span>
            <strong>${escapeHtml(aud(row.allocation))}</strong>
          </div>
          <div class="day-cell">
            <span>Spent</span>
            <strong>${escapeHtml(aud(row.spent))}</strong>
          </div>
          <div class="day-cell day-variance ${varianceClass}">
            <span>Variance</span>
            <strong>${escapeHtml(varianceText)}</strong>
          </div>
        </article>`;
    }).join("");
  }

  function renderSettings() {
    if (!state.trip) return;
    el("settingsTripName").value = state.trip.name;
    el("settingsStartDate").value = state.trip.startDate;
    el("settingsEndDate").value = state.trip.endDate;
    el("settingsBudget").value = state.trip.totalBudget;

    if (settingsDraftDestinations.length === 0) {
      settingsDraftDestinations = cloneDestinations(state.trip.destinations || []);
      renderDestinationDrafts("settings");
    }
  }

  function render() {
    setVisibility();
    renderHeader();
    if (!state.trip) return;

    renderDashboard();
    renderHistoryFilter();
    renderExpenses();
    renderDailyHistory();
    renderSettings();

    const selected = el("expenseDestination").value;
    setExpenseDestinationOptions(selected);
    setDefaultExpenseDate();
    updateConversionPreview();
  }

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

  el("setupForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const trip = {
      name: el("tripName").value.trim(),
      startDate: el("startDate").value,
      endDate: el("endDate").value,
      totalBudget: Number(el("totalBudget").value),
      destinations: cloneDestinations(setupDraftDestinations)
    };

    const error = validateTrip(trip.name, trip.startDate, trip.endDate, trip.totalBudget, trip.destinations);
    el("setupError").textContent = error;
    if (error) return;

    state.trip = trip;
    state.expenses = [];
    settingsDraftDestinations = [];
    saveState();
    render();
  });

  el("expenseDate").addEventListener("change", autoDestinationForDate);
  el("expenseDestination").addEventListener("change", () => updateExpenseCurrencyOptions());
  ["expenseAmount", "expenseCurrency"].forEach((id) => {
    el(id).addEventListener("input", updateConversionPreview);
    el(id).addEventListener("change", updateConversionPreview);
  });

  el("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.trip) return;

    const id = el("editingExpenseId").value;
    const amount = Number(el("expenseAmount").value);
    const currency = el("expenseCurrency").value;
    const date = el("expenseDate").value;
    const destination = destinationById(el("expenseDestination").value);
    const category = el("expenseCategory").value;
    const note = el("expenseNote").value.trim();

    let error = "";
    if (!date) error = "Choose an expense date.";
    else if (dayNumber(date) < dayNumber(state.trip.startDate) || dayNumber(date) > dayNumber(state.trip.endDate)) {
      error = "Expense date must be within the trip dates.";
    } else if (!destination) error = "Choose a destination.";
    else if (!Number.isFinite(amount) || amount <= 0) error = "Enter an amount greater than zero.";
    else if (!["AUD", destination.currency].includes(currency)) error = "Choose a valid currency for this destination.";

    el("expenseError").textContent = error;
    if (error) return;

    const existing = id ? state.expenses.find((x) => x.id === id) : null;
    const rateUsed = rateFor(destination, currency);
    const item = {
      id: existing?.id || uid("exp"),
      date,
      amount,
      currency,
      audAmount: amountToAud(amount, currency, destination),
      rateUsed,
      destinationId: destination.id,
      destinationName: destination.name,
      category,
      note,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    if (existing) {
      state.expenses = state.expenses.map((x) => x.id === id ? item : x);
    } else {
      state.expenses.push(item);
    }

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

    activateTab("today");
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

  el("settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.trip) return;

    const nextTrip = {
      name: el("settingsTripName").value.trim(),
      startDate: el("settingsStartDate").value,
      endDate: el("settingsEndDate").value,
      totalBudget: Number(el("settingsBudget").value),
      destinations: cloneDestinations(settingsDraftDestinations)
    };

    const error = validateTrip(
      nextTrip.name,
      nextTrip.startDate,
      nextTrip.endDate,
      nextTrip.totalBudget,
      nextTrip.destinations
    );

    el("settingsError").textContent = error;
    if (error) return;

    const destinationIds = new Set(nextTrip.destinations.map((d) => d.id));
    const orphaned = state.expenses.filter((x) => x.destinationId && !destinationIds.has(x.destinationId));
    if (orphaned.length) {
      el("settingsError").textContent =
        `You cannot remove a destination that already has expenses. Reassign or delete those expenses first.`;
      return;
    }

    state.trip = nextTrip;

    // Keep historic AUD values and rates unchanged. Only refresh destination names.
    state.expenses = state.expenses.map((item) => {
      const destination = nextTrip.destinations.find((d) => d.id === item.destinationId);
      return {
        ...item,
        destinationName: destination?.name || item.destinationName,
        updatedAt: Date.now()
      };
    });

    saveState();
    settingsDraftDestinations = cloneDestinations(state.trip.destinations);
    render();
    el("backupMessage").textContent = "Settings saved.";
  });

  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === name);
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  el("viewAllBtn").addEventListener("click", () => activateTab("history"));
  el("historyFilter").addEventListener("change", renderExpenses);

  async function exportBackup() {
    const backup = {
      app: "Trip Budget",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      data: state
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const safeName = (state.trip?.name || "trip-budget")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const filename = `${safeName || "trip-budget"}-backup-${todayISO()}.json`;
    const file = new File([blob], filename, { type: "application/json" });

    try {
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Trip Budget backup",
          text: "Trip Budget local backup",
          files: [file]
        });
        el("backupMessage").textContent = "Backup ready to save or share.";
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
    el("backupMessage").textContent = "Backup downloaded.";
  }

  el("exportBtn").addEventListener("click", exportBackup);

  el("importInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const importedRaw = backup?.data || backup;
      const imported = migrateState(importedRaw);

      if (!imported.trip || !Array.isArray(imported.expenses)) {
        throw new Error("Not a valid Trip Budget backup.");
      }

      const validation = validateTrip(
        imported.trip.name,
        imported.trip.startDate,
        imported.trip.endDate,
        Number(imported.trip.totalBudget),
        imported.trip.destinations
      );
      if (validation) throw new Error(validation);

      state = imported;
      settingsDraftDestinations = [];
      saveState();
      render();
      activateTab("today");
      el("backupMessage").textContent = "Backup restored successfully.";
    } catch (error) {
      el("backupMessage").textContent = `Could not import backup: ${error.message}`;
    } finally {
      event.target.value = "";
    }
  });

  el("resetBtn").addEventListener("click", () => {
    const dialog = el("confirmDialog");
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else if (window.confirm("Erase this trip and all expenses?")) {
      resetAll();
    }
  });

  el("confirmDialog").addEventListener("close", () => {
    if (el("confirmDialog").returnValue === "confirm") resetAll();
  });

  function resetAll() {
    state = blankState();
    localStorage.removeItem(STORAGE_KEY);
    setupDraftDestinations = [makeDestinationDraft("", "", "", "AUD", 1)];
    settingsDraftDestinations = [];
    clearExpenseForm();
    renderDestinationDrafts("setup");
    render();
    activateTab("today");
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
