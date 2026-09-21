const FAMILY_SYNC_KEY = "travelPlanner.familySync.v1";
const FAMILY_SYNC_ONBOARDING_KEY = "travelPlanner.familySync.onboarding.v1";
const SNAPSHOT_PREFIX = "travelPlanner.familySync.snapshot.v1.";
const FIREBASE_SDK_VERSION = "12.19.0";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA0Ju_zuaXn6537_1BRKCaj3X6frCxrEZg",
  authDomain: "travel-planner-sync.firebaseapp.com",
  databaseURL: "https://travel-planner-sync-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "travel-planner-sync",
  storageBucket: "travel-planner-sync.firebasestorage.app",
  messagingSenderId: "725050184353",
  appId: "1:725050184353:web:cef8dd2b121324889596e0"
};

const COLLECTIONS = [
  "travellerProfiles",
  "itinerary",
  "preTripTasks",
  "documents",
  "travelInfo",
  "places",
  "reminders",
  "timelineNotes",
  "dayMeta"
];

let bridge = null;
let firebase = null;
let authUser = null;
let cloudUnsubscribe = null;
let connectionUnsubscribe = null;
let pushTimer = null;
let connecting = false;
let applyingRemote = false;
let status = "offline";

function $(id) {
  return document.getElementById(id);
}

function readConfig() {
  try {
    const raw = localStorage.getItem(FAMILY_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      enabled: Boolean(parsed.enabled),
      syncId: String(parsed.syncId || ""),
      createdAt: Number(parsed.createdAt || 0),
      lastSyncAt: Number(parsed.lastSyncAt || 0)
    };
  } catch {
    return { enabled: false, syncId: "", createdAt: 0, lastSyncAt: 0 };
  }
}

function writeConfig(next) {
  localStorage.setItem(FAMILY_SYNC_KEY, JSON.stringify(next));
}

function snapshotKey(syncId) {
  return `${SNAPSHOT_PREFIX}${syncId}`;
}

function readLastSnapshot(syncId) {
  try {
    const raw = localStorage.getItem(snapshotKey(syncId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLastSnapshot(syncId, shared) {
  try {
    localStorage.setItem(snapshotKey(syncId), JSON.stringify(shared));
  } catch {}
}

function nowLabel(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(Number(ms)));
}

function randomSyncId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function inviteLink(syncId) {
  return `${location.origin}${location.pathname}#familysync=${syncId}`;
}

function extractSyncId(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("Paste a Family Sync invitation link first.");

  const marker = "familysync=";
  const index = text.indexOf(marker);
  let id = index >= 0 ? text.slice(index + marker.length) : text;
  id = id.split(/\s/)[0].trim().replace(/[)>.,]+$/g, "");
  if (id.startsWith("#")) id = id.slice(1);
  if (id.startsWith("familysync=")) id = id.slice("familysync=".length);

  if (!/^[A-Za-z0-9_-]{30,100}$/.test(id)) {
    throw new Error("This does not look like a valid Family Sync invitation.");
  }
  return id;
}

function arrayToMap(value) {
  if (!Array.isArray(value)) return {};
  const map = {};
  for (const item of value) {
    if (!item?.id) continue;
    map[String(item.id)] = JSON.parse(JSON.stringify(item));
  }
  return map;
}

function dayMetaToMap(value) {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value));
}

function bridgeStateToCloud(shared) {
  if (!shared?.core?.id) return null;
  const out = {
    schema: 1,
    core: JSON.parse(JSON.stringify(shared.core)),
    bootstrapDestinations: JSON.parse(JSON.stringify(shared.bootstrapDestinations || []))
  };
  for (const name of COLLECTIONS) {
    out[name] = name === "dayMeta"
      ? dayMetaToMap(shared[name])
      : arrayToMap(shared[name]);
  }
  return out;
}

function cloudToBridgeState(cloud) {
  if (!cloud?.core?.id) return null;
  const out = {
    schema: 1,
    core: JSON.parse(JSON.stringify(cloud.core)),
    bootstrapDestinations: JSON.parse(JSON.stringify(cloud.bootstrapDestinations || []))
  };
  for (const name of COLLECTIONS) {
    const map = cloud[name] && typeof cloud[name] === "object" ? cloud[name] : {};
    out[name] = name === "dayMeta"
      ? JSON.parse(JSON.stringify(map))
      : Object.values(map);
  }
  return out;
}

function updatedAtOf(item) {
  const n = Number(item?.updatedAt || 0);
  return Number.isFinite(n) ? n : 0;
}

function detectLocalTombstones(previous, local, existingTombstones) {
  const result = JSON.parse(JSON.stringify(existingTombstones || {}));
  const stamp = Date.now();

  for (const name of COLLECTIONS) {
    const before = previous?.[name] && typeof previous[name] === "object" ? previous[name] : {};
    const after = local?.[name] && typeof local[name] === "object" ? local[name] : {};
    result[name] = result[name] && typeof result[name] === "object" ? result[name] : {};

    for (const id of Object.keys(before)) {
      if (!(id in after)) {
        result[name][id] = Math.max(Number(result[name][id] || 0), stamp);
      }
    }
  }

  return result;
}

function mergeCollection(cloudMap, localMap, tombstones) {
  const merged = {};
  const mergedTombstones = { ...(tombstones || {}) };
  const ids = new Set([
    ...Object.keys(cloudMap || {}),
    ...Object.keys(localMap || {}),
    ...Object.keys(tombstones || {})
  ]);

  for (const id of ids) {
    const cloudItem = cloudMap?.[id] || null;
    const localItem = localMap?.[id] || null;
    const deletedAt = Number(tombstones?.[id] || 0);
    const cloudUpdated = updatedAtOf(cloudItem);
    const localUpdated = updatedAtOf(localItem);
    const newestItemTime = Math.max(cloudUpdated, localUpdated);

    if (deletedAt > 0 && deletedAt >= newestItemTime) {
      continue;
    }

    const chosen = localUpdated >= cloudUpdated ? localItem : cloudItem;
    if (chosen) merged[id] = JSON.parse(JSON.stringify(chosen));

    if (newestItemTime > deletedAt && mergedTombstones[id]) {
      delete mergedTombstones[id];
    }
  }

  return { merged, tombstones: mergedTombstones };
}

function mergeCloudAndLocal(current, local, previousLocal) {
  const cloud = current && typeof current === "object" ? current : {};
  const existingTombstones = cloud.tombstones && typeof cloud.tombstones === "object"
    ? cloud.tombstones
    : {};
  const tombstones = detectLocalTombstones(previousLocal, local, existingTombstones);

  const merged = {
    schema: 1,
    core: null,
    bootstrapDestinations: Array.isArray(cloud.bootstrapDestinations) && cloud.bootstrapDestinations.length
      ? cloud.bootstrapDestinations
      : (local.bootstrapDestinations || []),
    tombstones: {}
  };

  const cloudCoreTime = updatedAtOf(cloud.core);
  const localCoreTime = updatedAtOf(local.core);
  merged.core = localCoreTime >= cloudCoreTime
    ? JSON.parse(JSON.stringify(local.core))
    : JSON.parse(JSON.stringify(cloud.core || local.core));

  for (const name of COLLECTIONS) {
    const cloudMap = cloud[name] && typeof cloud[name] === "object" ? cloud[name] : {};
    const localMap = local[name] && typeof local[name] === "object" ? local[name] : {};
    const result = mergeCollection(cloudMap, localMap, tombstones[name] || {});
    merged[name] = result.merged;
    merged.tombstones[name] = result.tombstones;
  }

  merged.updatedAt = Date.now();
  merged.updatedBy = authUser?.uid || "";
  return merged;
}

async function waitForBridge() {
  for (let i = 0; i < 100; i++) {
    if (window.TravelPlannerSyncBridge) {
      bridge = window.TravelPlannerSyncBridge;
      return bridge;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Travel Planner did not finish loading.");
}

async function loadFirebase() {
  if (firebase) return firebase;
  if (!navigator.onLine) throw new Error("You are offline. Family Sync will reconnect when internet is available.");

  const appUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
  const authUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`;
  const dbUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`;

  const [appMod, authMod, dbMod] = await Promise.all([
    import(appUrl),
    import(authUrl),
    import(dbUrl)
  ]);

  const app = appMod.initializeApp(FIREBASE_CONFIG);
  const auth = authMod.getAuth(app);
  const db = dbMod.getDatabase(app, FIREBASE_CONFIG.databaseURL);

  firebase = { appMod, authMod, dbMod, app, auth, db };
  return firebase;
}

async function ensureAuth() {
  const fb = await loadFirebase();
  if (fb.auth.currentUser) {
    authUser = fb.auth.currentUser;
    return authUser;
  }

  try {
    const credential = await fb.authMod.signInAnonymously(fb.auth);
    authUser = credential.user;
    return authUser;
  } catch (error) {
    if (String(error?.code || "").includes("operation-not-allowed")) {
      throw new Error("Anonymous Firebase sign-in is not enabled yet.");
    }
    throw error;
  }
}

function familyRef(syncId) {
  return firebase.dbMod.ref(firebase.db, `familyTrips/${syncId}`);
}

function setStatus(next, message = "") {
  status = next;
  const cfg = readConfig();

  const enabled = cfg.enabled && cfg.syncId;
  $("familySyncDisconnected")?.classList.toggle("hidden", Boolean(enabled));
  $("familySyncConnected")?.classList.toggle("hidden", !enabled);

  const title = $("familySyncStatusTitle");
  const text = $("familySyncStatusText");
  const dot = $("familySyncDot");
  const connection = $("familySyncConnectionLabel");
  const summary = $("familySyncSummary");

  if (dot) {
    dot.classList.remove("online", "offline", "syncing");
    dot.classList.add(next === "online" ? "online" : next === "syncing" ? "syncing" : "offline");
  }

  if (!enabled) {
    if (title) title.textContent = "Not connected";
    if (text) text.textContent = "Create a private family sync or join one using an invite link.";
    if (connection) connection.textContent = "Not connected";
    if (summary) summary.textContent = "Keep the itinerary updated across family devices";
  } else if (next === "online") {
    if (title) title.textContent = "Family Sync is on";
    if (text) text.textContent = "Changes to shared trip-planning data update automatically across connected devices.";
    if (connection) connection.textContent = "Live";
    if (summary) summary.textContent = "Connected • automatic updates on";
  } else if (next === "syncing") {
    if (title) title.textContent = "Syncing…";
    if (text) text.textContent = message || "Sending and receiving the latest trip changes.";
    if (connection) connection.textContent = "Syncing";
    if (summary) summary.textContent = "Connected • syncing";
  } else {
    if (title) title.textContent = "Family Sync waiting";
    if (text) text.textContent = message || "Your local trip still works. Sync will resume when internet is available.";
    if (connection) connection.textContent = "Offline";
    if (summary) summary.textContent = "Connected • waiting for internet";
  }

  if ($("familySyncLastSync")) $("familySyncLastSync").textContent = nowLabel(cfg.lastSyncAt);
  if ($("familySyncInviteLink") && enabled) $("familySyncInviteLink").value = inviteLink(cfg.syncId);
}

function setMessage(message) {
  if ($("familySyncMessage")) $("familySyncMessage").textContent = message || "";
}

function markSynced(shared) {
  const cfg = readConfig();
  if (!cfg.enabled || !cfg.syncId) return;
  cfg.lastSyncAt = Date.now();
  writeConfig(cfg);
  writeLastSnapshot(cfg.syncId, shared);
  setStatus("online");
}

async function pushLocalSnapshot() {
  const cfg = readConfig();
  if (!cfg.enabled || !cfg.syncId || applyingRemote || !bridge?.hasTrip?.()) return false;
  if (!navigator.onLine) {
    setStatus("offline");
    return false;
  }

  await ensureAuth();
  const localBridge = bridge.getSharedState();
  const local = bridgeStateToCloud(localBridge);
  if (!local) return false;

  const previous = readLastSnapshot(cfg.syncId);
  setStatus("syncing", "Merging your latest changes with the family copy…");

  const result = await firebase.dbMod.runTransaction(
    familyRef(cfg.syncId),
    (current) => mergeCloudAndLocal(current, local, previous),
    { applyLocally: false }
  );

  if (!result.committed) throw new Error("The family sync update was not committed.");

  const cloud = result.snapshot.val();
  const bridgePayload = cloudToBridgeState(cloud);
  if (bridgePayload) {
    applyingRemote = true;
    try {
      bridge.applySharedState(bridgePayload);
    } finally {
      applyingRemote = false;
    }
  }

  markSynced(cloud);
  return true;
}

function startCloudListener(syncId) {
  if (cloudUnsubscribe) cloudUnsubscribe();
  if (connectionUnsubscribe) connectionUnsubscribe();

  const ref = familyRef(syncId);
  cloudUnsubscribe = firebase.dbMod.onValue(
    ref,
    (snapshot) => {
      const cloud = snapshot.val();
      if (!cloud?.core?.id) return;
      const bridgePayload = cloudToBridgeState(cloud);
      if (!bridgePayload) return;

      applyingRemote = true;
      try {
        bridge.applySharedState(bridgePayload);
      } finally {
        applyingRemote = false;
      }

      markSynced(cloud);
    },
    (error) => {
      setStatus("offline", `Sync error: ${error.message}`);
    }
  );

  const connectedRef = firebase.dbMod.ref(firebase.db, ".info/connected");
  connectionUnsubscribe = firebase.dbMod.onValue(connectedRef, (snapshot) => {
    if (snapshot.val() === true) {
      setStatus("online");
    } else {
      setStatus("offline");
    }
  });
}

async function connectExisting() {
  const cfg = readConfig();
  if (!cfg.enabled || !cfg.syncId || connecting) {
    setStatus(cfg.enabled ? status : "offline");
    return;
  }
  if (!navigator.onLine) {
    setStatus("offline");
    return;
  }

  connecting = true;
  try {
    setStatus("syncing", "Connecting to the family trip…");
    await ensureAuth();
    await pushLocalSnapshot();
    startCloudListener(cfg.syncId);
    setStatus("online");
  } catch (error) {
    setStatus("offline", error.message);
    setMessage(error.message);
  } finally {
    connecting = false;
  }
}

async function createFamilySync() {
  if (!bridge?.hasTrip?.()) {
    setMessage("Create or import a trip before turning on Family Sync.");
    return;
  }

  const syncId = randomSyncId();
  const cfg = {
    enabled: true,
    syncId,
    createdAt: Date.now(),
    lastSyncAt: 0
  };
  writeConfig(cfg);
  setMessage("");
  setStatus("syncing", "Creating your private family copy…");

  try {
    await ensureAuth();
    await pushLocalSnapshot();
    startCloudListener(syncId);
    resetOnboardingDismissal();
    setStatus("online");
    setMessage("Family Sync created. Share the private invitation link with your wife.");
  } catch (error) {
    setStatus("offline", error.message);
    setMessage(`Could not create Family Sync: ${error.message}`);
  }
}

async function joinFamilySync(value) {
  let syncId;
  try {
    syncId = extractSyncId(value);
  } catch (error) {
    setMessage(error.message);
    return false;
  }

  setStatus("syncing", "Opening the shared family trip…");
  try {
    await ensureAuth();
    const ref = familyRef(syncId);
    const snapshot = await firebase.dbMod.get(ref);
    const cloud = snapshot.val();

    if (!cloud?.core?.id) throw new Error("No shared trip was found for this invitation.");

    const localTripId = bridge?.getTripId?.() || "";
    if (localTripId && localTripId !== cloud.core.id) {
      const ok = window.confirm(
        `Join ${cloud.core.name || "this shared trip"} and replace the different trip currently on this device? ` +
        `The spending budget and expenses for the old trip will not be carried across.`
      );
      if (!ok) {
        setMessage("Join cancelled.");
        setStatus("offline");
        return false;
      }
    }

    await disconnect({ forget: true, silent: true });

    const cfg = {
      enabled: true,
      syncId,
      createdAt: Date.now(),
      lastSyncAt: 0
    };
    writeConfig(cfg);

    const bridgePayload = cloudToBridgeState(cloud);
    applyingRemote = true;
    try {
      bridge.applySharedState(bridgePayload);
    } finally {
      applyingRemote = false;
    }

    resetOnboardingDismissal();
    markSynced(cloud);
    startCloudListener(syncId);
    setStatus("online");
    setMessage(`Joined ${cloud.core.name || "the shared trip"}. Automatic updates are on.`);
    return true;
  } catch (error) {
    setStatus("offline", error.message);
    setMessage(`Could not join Family Sync: ${error.message}`);
    return false;
  }
}

async function disconnect(options = {}) {
  if (cloudUnsubscribe) {
    cloudUnsubscribe();
    cloudUnsubscribe = null;
  }
  if (connectionUnsubscribe) {
    connectionUnsubscribe();
    connectionUnsubscribe = null;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  const cfg = readConfig();
  if (options.forget !== false) {
    localStorage.removeItem(FAMILY_SYNC_KEY);
    if (cfg.syncId) localStorage.removeItem(snapshotKey(cfg.syncId));
  }

  if (!options.silent) setMessage("Family Sync disconnected on this device.");
  setStatus("offline");
}

function localChanged() {
  const cfg = readConfig();
  if (!cfg.enabled || !cfg.syncId || applyingRemote) return;

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    try {
      await pushLocalSnapshot();
    } catch (error) {
      setStatus("offline", error.message);
      setMessage(`Family Sync is waiting: ${error.message}`);
    }
  }, 900);
}

async function syncNow() {
  try {
    setMessage("");
    await pushLocalSnapshot();
    setMessage("Family trip is up to date.");
  } catch (error) {
    setMessage(`Could not sync now: ${error.message}`);
  }
}

async function copyInvite() {
  const cfg = readConfig();
  if (!cfg.enabled || !cfg.syncId) return;
  const link = inviteLink(cfg.syncId);
  try {
    await navigator.clipboard.writeText(link);
    setMessage("Family Sync invitation copied.");
  } catch {
    window.prompt("Copy this Family Sync invitation:", link);
  }
}

async function shareInvite() {
  const cfg = readConfig();
  if (!cfg.enabled || !cfg.syncId) return;
  const link = inviteLink(cfg.syncId);
  const tripName = bridge?.getTripName?.() || "our trip";

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${tripName} — Family Sync`,
        text: "Open this private link once to join our Travel Planner Family Sync.",
        url: link
      });
      setMessage("Family Sync invitation shared.");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  await copyInvite();
}


function isInstalledPwa() {
  const standaloneMedia = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = window.navigator.standalone === true;
  return Boolean(standaloneMedia || iosStandalone);
}

function onboardingWasDismissed() {
  try {
    return localStorage.getItem(FAMILY_SYNC_ONBOARDING_KEY) === "dismissed";
  } catch {
    return false;
  }
}

function dismissOnboarding() {
  try {
    localStorage.setItem(FAMILY_SYNC_ONBOARDING_KEY, "dismissed");
  } catch {}
  const dialog = $("familySyncOnboardingDialog");
  if (dialog?.open) dialog.close();
}

function resetOnboardingDismissal() {
  try {
    localStorage.removeItem(FAMILY_SYNC_ONBOARDING_KEY);
  } catch {}
}

function setOnboardingMessage(message) {
  if ($("familySyncOnboardingMessage")) {
    $("familySyncOnboardingMessage").textContent = message || "";
  }
}

function showInstalledOnboardingIfNeeded() {
  const cfg = readConfig();
  if (!isInstalledPwa()) return;
  if (cfg.enabled && cfg.syncId) return;
  if (onboardingWasDismissed()) return;

  const dialog = $("familySyncOnboardingDialog");
  if (!dialog || dialog.open) return;

  setOnboardingMessage("");
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

async function pasteOnboardingInvite() {
  setOnboardingMessage("");
  try {
    if (!navigator.clipboard?.readText) {
      throw new Error("Clipboard paste is not available here. Press and hold in the box and choose Paste.");
    }
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      throw new Error("Your clipboard is empty.");
    }
    $("familySyncOnboardingInput").value = text.trim();
    setOnboardingMessage("Invitation pasted. Tap Join family sync.");
  } catch (error) {
    setOnboardingMessage(error.message || "Could not read the clipboard. Paste the invitation manually.");
  }
}

async function joinFromOnboarding() {
  const value = $("familySyncOnboardingInput")?.value || "";
  setOnboardingMessage("Connecting…");

  const joined = await joinFamilySync(value);
  if (joined) {
    resetOnboardingDismissal();
    const dialog = $("familySyncOnboardingDialog");
    if (dialog?.open) dialog.close();
    setMessage("Family Sync connected on this Home Screen app.");
  } else {
    const settingsMessage = $("familySyncMessage")?.textContent || "";
    setOnboardingMessage(settingsMessage || "Could not join Family Sync.");
  }
}

function bindUi() {
  $("familySyncCreateBtn")?.addEventListener("click", createFamilySync);
  $("familySyncJoinBtn")?.addEventListener("click", async () => {
    const joined = await joinFamilySync($("familySyncJoinInput")?.value || "");
    if (joined && $("familySyncJoinInput")) $("familySyncJoinInput").value = "";
  });
  $("familySyncCopyBtn")?.addEventListener("click", copyInvite);
  $("familySyncShareBtn")?.addEventListener("click", shareInvite);
  $("familySyncNowBtn")?.addEventListener("click", syncNow);
  $("familySyncDisconnectBtn")?.addEventListener("click", async () => {
    if (window.confirm("Disconnect Family Sync on this device? The local trip will remain here.")) {
      await disconnect({ forget: true });
      resetOnboardingDismissal();
    }
  });

  $("familySyncOnboardingPasteBtn")?.addEventListener("click", pasteOnboardingInvite);
  $("familySyncOnboardingJoinBtn")?.addEventListener("click", joinFromOnboarding);
  $("familySyncOnboardingLaterBtn")?.addEventListener("click", () => {
    dismissOnboarding();
  });
}

async function handleInviteHash() {
  const hash = location.hash || "";
  if (!hash.startsWith("#familysync=")) return;

  history.replaceState(null, "", `${location.pathname}${location.search}`);

  let syncId;
  try {
    syncId = extractSyncId(hash);
  } catch (error) {
    setMessage(error.message);
    return;
  }

  const ok = window.confirm("Join this private Travel Planner Family Sync on this device?");
  if (!ok) return;

  await joinFamilySync(syncId);
}

async function init() {
  try {
    await waitForBridge();
    bindUi();
    setStatus("offline");
    await handleInviteHash();

    setTimeout(() => {
      showInstalledOnboardingIfNeeded();
    }, 350);

    const cfg = readConfig();
    if (cfg.enabled && cfg.syncId) {
      if (navigator.onLine) connectExisting();
      else setStatus("offline");
    }

    window.addEventListener("online", () => connectExisting());
    window.addEventListener("offline", () => setStatus("offline"));
  } catch (error) {
    setMessage(`Family Sync could not start: ${error.message}`);
  }
}

window.FamilySync = {
  localChanged,
  syncNow,
  disconnect,
  renderStatus: () => setStatus(status),
  showOnboarding: showInstalledOnboardingIfNeeded
};

init();
