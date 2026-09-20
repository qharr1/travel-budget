(() => {
  "use strict";

  const STORAGE_KEY = "tripBudgetApp.v1";
  const APP_VERSION = 1;

  const el = (id) => document.getElementById(id);
  const setupPanel = el("setupPanel");
  const appPanel = el("appPanel");

  let state = loadState();

  function blankState() {
    return {
      version: APP_VERSION,
      trip: null,
      expenses: []
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return blankState();
      return {
        version: APP_VERSION,
        trip: parsed.trip || null,
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : []
      };
    } catch {
      return blankState();
    }
  }

  function saveState() {
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
    if (!Number.isFinite(n)) return "0";
    if (currency === "JPY") {
      return new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0
      }).format(n);
    }
    if (currency === "CNY") {
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "CNY",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n);
    }
    return aud(n);
  }

  function amountToAud(amount, currency, trip = state.trip) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    if (currency === "AUD") return n;
    if (currency === "JPY") return n / Number(trip?.jpyRate || 1);
    if (currency === "CNY") return n / Number(trip?.cnyRate || 1);
    return n;
  }

  function totalSpent(expenses = state.expenses) {
    return expenses.reduce((sum, item) => sum + Number(item.audAmount || 0), 0);
  }

  function expensesOn(dateStr) {
    return state.expenses.filter((item) => item.date === dateStr);
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

    let status = "during";
    let dayIndex = 0;
    let daysRemaining = 0;
    let elapsedDays = 0;

    if (todayN < startN) {
      status = "before";
      daysRemaining = totalDays;
      elapsedDays = 0;
    } else if (todayN > endN) {
      status = "after";
      dayIndex = totalDays;
      elapsedDays = totalDays;
      daysRemaining = 0;
    } else {
      dayIndex = todayN - startN + 1;
      elapsedDays = dayIndex;
      daysRemaining = endN - todayN + 1;
    }

    const dailyAllowance = daysRemaining > 0 ? remaining / daysRemaining : 0;
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
      daysRemaining,
      dailyAllowance,
      originalDaily,
      expectedSpent,
      pace,
      spentToday: totalSpent(expensesOn(today))
    };
  }

  function setVisibility() {
    const hasTrip = Boolean(state.trip);
    setupPanel.classList.toggle("hidden", hasTrip);
    appPanel.classList.toggle("hidden", !hasTrip);
  }

  function renderHeader() {
    if (!state.trip) {
      el("headerTripName").textContent = "Trip Budget";
      el("headerTripDates").textContent = "Set up your trip to begin.";
      return;
    }
    el("headerTripName").textContent = state.trip.name;
    el("headerTripDates").textContent =
      `${formatDate(state.trip.startDate)} – ${formatDate(state.trip.endDate)}`;
  }

  function renderDashboard() {
    if (!state.trip) return;
    const stats = tripStats();
    const budget = Number(state.trip.totalBudget);

    el("remainingBudget").textContent = aud(stats.remaining);
    el("remainingBudget").classList.toggle("bad", stats.remaining < 0);
    el("daysRemaining").textContent =
      stats.daysRemaining === 1 ? "1 day remaining" : `${stats.daysRemaining} days remaining`;
    el("tripDay").textContent =
      stats.status === "before" ? `Trip starts ${formatDate(state.trip.startDate, { year: false })}` :
      stats.status === "after" ? `Trip finished • ${stats.totalDays} days` :
      `Trip day ${stats.dayIndex} of ${stats.totalDays}`;

    el("dailyAllowance").textContent = aud(stats.dailyAllowance);
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
    if (spentPct > 100) {
      el("budgetProgress").style.background = "#b91c1c";
    } else {
      el("budgetProgress").style.background = "";
    }
    el("progressUsed").textContent = `${Math.max(0, spentPct).toFixed(0)}% used`;
    el("progressRemaining").textContent =
      stats.remaining >= 0 ? `${Math.max(0, 100 - spentPct).toFixed(0)}% left` : `${aud(Math.abs(stats.remaining))} over`;

    const statusBox = el("tripStatus");
    if (stats.status === "before") {
      const until = dayNumber(state.trip.startDate) - dayNumber(stats.today);
      statusBox.textContent = `Your trip starts in ${until} day${until === 1 ? "" : "s"}. Expenses can still be entered now.`;
    } else if (stats.status === "after") {
      statusBox.textContent = `This trip ended on ${formatDate(state.trip.endDate)}. Your history remains available.`;
    } else {
      statusBox.textContent = `Today is day ${stats.dayIndex} of ${stats.totalDays}. Your daily allowance updates immediately when you add spending.`;
    }
  }

  function expenseMarkup(item) {
    const title = item.note?.trim() || item.category;
    const meta = `${formatDate(item.date, { weekday: true })} • ${item.category} • ${item.country}`;
    const showConverted = item.currency !== "AUD";
    return `
      <article class="expense-item" data-expense-id="${escapeHtml(item.id)}">
        <div class="expense-main">
          <div class="expense-title">
            <strong>${escapeHtml(title)}</strong>
          </div>
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

  function renderExpenses() {
    if (!state.trip) return;

    const sorted = sortedExpenses();
    el("recentExpenses").innerHTML = sorted.length
      ? sorted.slice(0, 5).map(expenseMarkup).join("")
      : `<p class="expense-empty">No expenses yet. Your first entry will appear here.</p>`;

    const filter = el("historyFilter").value;
    const filtered = filter === "all" ? sorted : sorted.filter((x) => x.country === filter);
    el("historyExpenses").innerHTML = filtered.length
      ? filtered.map(expenseMarkup).join("")
      : `<p class="expense-empty">No expenses match this filter.</p>`;

    const filteredTotal = totalSpent(filtered);
    const count = filtered.length;
    el("historySummary").innerHTML = `
      <span class="summary-chip">${count} entr${count === 1 ? "y" : "ies"}</span>
      <span class="summary-chip">${escapeHtml(aud(filteredTotal))} total</span>`;
  }

  function renderSettings() {
    if (!state.trip) return;
    el("settingsTripName").value = state.trip.name;
    el("settingsStartDate").value = state.trip.startDate;
    el("settingsEndDate").value = state.trip.endDate;
    el("settingsBudget").value = state.trip.totalBudget;
    el("settingsJpyRate").value = state.trip.jpyRate;
    el("settingsCnyRate").value = state.trip.cnyRate;
  }

  function render() {
    setVisibility();
    renderHeader();
    if (!state.trip) return;
    renderDashboard();
    renderExpenses();
    renderSettings();
    updateConversionPreview();
    setDefaultExpenseDate();
  }

  function validateTrip(name, startDate, endDate, totalBudget, jpyRate, cnyRate) {
    if (!name.trim()) return "Enter a trip name.";
    if (!startDate || !endDate) return "Enter both trip dates.";
    if (dayNumber(endDate) < dayNumber(startDate)) return "End date must be on or after the start date.";
    if (!Number.isFinite(totalBudget) || totalBudget <= 0) return "Enter a budget greater than A$0.";
    if (!Number.isFinite(jpyRate) || jpyRate <= 0) return "Enter a valid JPY exchange rate.";
    if (!Number.isFinite(cnyRate) || cnyRate <= 0) return "Enter a valid CNY exchange rate.";
    if (daysInclusive(startDate, endDate) > 400) return "Trip dates must be within 400 days.";
    return "";
  }

  el("setupForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const trip = {
      name: el("tripName").value.trim(),
      startDate: el("startDate").value,
      endDate: el("endDate").value,
      totalBudget: Number(el("totalBudget").value),
      jpyRate: Number(el("jpyRate").value),
      cnyRate: Number(el("cnyRate").value)
    };
    const error = validateTrip(trip.name, trip.startDate, trip.endDate, trip.totalBudget, trip.jpyRate, trip.cnyRate);
    el("setupError").textContent = error;
    if (error) return;

    state.trip = trip;
    state.expenses = [];
    saveState();
    render();
  });

  function setDefaultExpenseDate() {
    if (!state.trip || el("editingExpenseId").value) return;
    const today = todayISO();
    const start = state.trip.startDate;
    const end = state.trip.endDate;
    if (dayNumber(today) < dayNumber(start)) el("expenseDate").value = start;
    else if (dayNumber(today) > dayNumber(end)) el("expenseDate").value = end;
    else el("expenseDate").value = today;
  }

  function updateConversionPreview() {
    if (!state.trip) return;
    const amount = Number(el("expenseAmount").value);
    const currency = el("expenseCurrency").value;
    if (!Number.isFinite(amount) || amount <= 0) {
      el("conversionPreview").textContent = "";
      return;
    }
    const converted = amountToAud(amount, currency);
    if (currency === "AUD") {
      el("conversionPreview").textContent = `${aud(converted)} will be deducted from the trip budget.`;
    } else {
      const rate = currency === "JPY" ? state.trip.jpyRate : state.trip.cnyRate;
      el("conversionPreview").textContent =
        `${localAmount(amount, currency)} ≈ ${aud(converted)} at ${rate} ${currency} per A$1.`;
    }
  }

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
    const category = el("expenseCategory").value;
    const country = el("expenseCountry").value;
    const note = el("expenseNote").value.trim();

    let error = "";
    if (!date) error = "Choose an expense date.";
    else if (!Number.isFinite(amount) || amount <= 0) error = "Enter an amount greater than zero.";
    else if (!["AUD", "JPY", "CNY"].includes(currency)) error = "Choose a valid currency.";

    el("expenseError").textContent = error;
    if (error) return;

    const existing = id ? state.expenses.find((x) => x.id === id) : null;
    const item = {
      id: existing?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date,
      amount,
      currency,
      audAmount: amountToAud(amount, currency),
      rateUsed: currency === "JPY" ? Number(state.trip.jpyRate) : currency === "CNY" ? Number(state.trip.cnyRate) : 1,
      category,
      country,
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
    updateConversionPreview();
    setDefaultExpenseDate();
  }

  function editExpense(id) {
    const item = state.expenses.find((x) => x.id === id);
    if (!item) return;
    activateTab("today");
    el("editingExpenseId").value = item.id;
    el("expenseDate").value = item.date;
    el("expenseCurrency").value = item.currency;
    el("expenseAmount").value = item.amount;
    el("expenseCategory").value = item.category;
    el("expenseCountry").value = item.country;
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
      jpyRate: Number(el("settingsJpyRate").value),
      cnyRate: Number(el("settingsCnyRate").value)
    };

    const error = validateTrip(
      nextTrip.name,
      nextTrip.startDate,
      nextTrip.endDate,
      nextTrip.totalBudget,
      nextTrip.jpyRate,
      nextTrip.cnyRate
    );
    el("settingsError").textContent = error;
    if (error) return;

    state.trip = nextTrip;
    saveState();
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
      const imported = backup?.data;
      if (!imported?.trip || !Array.isArray(imported.expenses)) {
        throw new Error("Not a valid Trip Budget backup.");
      }

      const t = imported.trip;
      const validation = validateTrip(
        String(t.name || ""),
        String(t.startDate || ""),
        String(t.endDate || ""),
        Number(t.totalBudget),
        Number(t.jpyRate),
        Number(t.cnyRate)
      );
      if (validation) throw new Error(validation);

      state = {
        version: APP_VERSION,
        trip: {
          name: String(t.name),
          startDate: String(t.startDate),
          endDate: String(t.endDate),
          totalBudget: Number(t.totalBudget),
          jpyRate: Number(t.jpyRate),
          cnyRate: Number(t.cnyRate)
        },
        expenses: imported.expenses.map((item) => {
          const currency = ["AUD", "JPY", "CNY"].includes(item.currency) ? item.currency : "AUD";
          return {
            id: String(item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
            date: String(item.date || todayISO()),
            amount: Number(item.amount || 0),
            currency,
            audAmount: Number.isFinite(Number(item.audAmount))
              ? Number(item.audAmount)
              : amountToAud(Number(item.amount || 0), currency, t),
            rateUsed: Number.isFinite(Number(item.rateUsed))
              ? Number(item.rateUsed)
              : (currency === "JPY" ? Number(t.jpyRate) : currency === "CNY" ? Number(t.cnyRate) : 1),
            category: String(item.category || "Other"),
            country: String(item.country || "Other"),
            note: String(item.note || ""),
            createdAt: Number(item.createdAt || Date.now()),
            updatedAt: Date.now()
          };
        }).filter((item) => Number.isFinite(item.amount) && item.amount > 0)
      };

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
    clearExpenseForm();
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
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // App still works online if service worker registration is unavailable.
      });
    });
  }

  updateConnection();
  render();
})();
