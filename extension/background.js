// ===================== background.js (Supabase) =====================
const CACHE_KEY_SHORTCUTS = "shortcuts_cache";
const CACHE_KEY_TS = "shortcuts_cache_ts";
const CACHE_DURATION_MS = 1000 * 60 * 5; // 5 นาที

// ค่าคงที่ Supabase – แก้ตรงนี้แล้วติดตั้ง extension ใช้ได้เลย (ไม่ต้องตั้งค่าใน UI)
const DEFAULT_SUPABASE_URL = "https://hppiggscegpmderckcnm.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = ""; // ใส่ anon key จริงของโปรเจกต์ Supabase

let inMemoryShortcuts = null;
let lastFetchTs = 0;

// ===================== Config =====================
async function getConfig() {
  const o = await chrome.storage.local.get(["supabase_url", "supabase_anon_key", "supabase_session"]);
  let url = (o.supabase_url || "").replace(/\/$/, "");
  let anonKey = o.supabase_anon_key || "";
  if (!url || !anonKey) {
    url = (DEFAULT_SUPABASE_URL || "").replace(/\/$/, "");
    anonKey = DEFAULT_SUPABASE_ANON_KEY || "";
    if (url && anonKey) await chrome.storage.local.set({ supabase_url: url, supabase_anon_key: anonKey });
  }
  const session = o.supabase_session || null;
  return { url, anonKey, session };
}

function getAuthHeader(session) {
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

// ===================== Supabase REST (fetch) =====================
async function supabaseFetch(url, anonKey, session, path, opts = {}) {
  const fullUrl = `${url}/rest/v1${path}`;
  const headers = {
    apikey: anonKey,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...getAuthHeader(session),
    ...(opts.headers || {}),
  };
  const res = await fetch(fullUrl, {
    ...opts,
    headers: { ...headers, ...opts.headers },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase ${res.status}: ${errText || res.statusText}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json();
}

// ===================== Load shortcuts from Supabase =====================
async function loadShortcutsFromSupabase(forceRefresh = false) {
  const { url, anonKey, session } = await getConfig();
  if (!url || !anonKey) {
    console.warn("[BG] Supabase not configured");
    return [];
  }

  const now = Date.now();
  if (!forceRefresh && inMemoryShortcuts && now - lastFetchTs < CACHE_DURATION_MS) {
    return inMemoryShortcuts;
  }

  try {
    const rows = await supabaseFetch(url, anonKey, session, "/shortcuts?select=id,command_name,shortcut_key,action_text,is_global", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const list = Array.isArray(rows) ? rows : [];
    inMemoryShortcuts = list;
    lastFetchTs = now;
    await chrome.storage.local.set({
      [CACHE_KEY_SHORTCUTS]: list,
      [CACHE_KEY_TS]: now,
    });
    return list;
  } catch (e) {
    console.warn("[BG] loadShortcutsFromSupabase error:", e.message);
    const cached = await chrome.storage.local.get([CACHE_KEY_SHORTCUTS]);
    const list = cached[CACHE_KEY_SHORTCUTS];
    if (Array.isArray(list)) {
      inMemoryShortcuts = list;
      return list;
    }
    return [];
  }
}

// ===================== Get shortcuts (cache-first) =====================
async function getShortcuts(forceRefresh = false) {
  const list = await loadShortcutsFromSupabase(forceRefresh);
  return list.map((s) => ({
    id: s.id,
    command_name: s.command_name,
    shortcut: s.shortcut_key || "",
    shortcut_key: s.shortcut_key,
    content: s.action_text || "",
    action_text: s.action_text,
    is_global: !!s.is_global,
  }));
}

// ===================== Hydrate from storage on startup =====================
async function hydrateFromStorage() {
  const o = await chrome.storage.local.get([CACHE_KEY_SHORTCUTS, CACHE_KEY_TS]);
  if (Array.isArray(o[CACHE_KEY_SHORTCUTS])) {
    inMemoryShortcuts = o[CACHE_KEY_SHORTCUTS];
    lastFetchTs = o[CACHE_KEY_TS] || 0;
  }
}

// ===================== Broadcast shortcuts updated =====================
async function broadcastShortcutsUpdated() {
  inMemoryShortcuts = null;
  lastFetchTs = 0;
  const tabs = await chrome.tabs.query({}).catch(() => []);
  for (const tab of tabs) {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "SHORTCUTS_UPDATED" }).catch(() => {});
  }
}

// ===================== Content script injector =====================
async function ensureContentScript(tabId) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  } catch (_) {}
}

// ===================== Install / Startup =====================
chrome.runtime.onInstalled.addListener(async () => {
  await hydrateFromStorage();
  const { url, anonKey } = await getConfig();
  if (url && anonKey) await loadShortcutsFromSupabase(true);
});

chrome.runtime.onStartup.addListener(async () => {
  await hydrateFromStorage();
  const { url, anonKey } = await getConfig();
  if (url && anonKey) await loadShortcutsFromSupabase(true);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") ensureContentScript(tabId);
});

// ===================== Chrome commands (keyboard shortcuts) =====================
chrome.commands.onCommand.addListener(async (commandName) => {
  const list = await getShortcuts(false);
  const row = list.find((s) => (s.command_name || "").toLowerCase() === String(commandName).toLowerCase());
  const text = row ? (row.action_text ?? row.content ?? "") : "";
  if (!text) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (tab?.id) {
    await ensureContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "INSERT_TEXT", text }).catch(() => {});
  }
});

// ===================== Message router =====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "GET_SHORTCUTS": {
          const list = await getShortcuts(!!msg.forceRefresh);
          sendResponse({ ok: true, data: list });
          break;
        }
        case "GET_ACTION_BY_COMMAND": {
          const list = await getShortcuts(false);
          const row = list.find((s) => (s.command_name || "").toLowerCase() === (msg.commandName || "").toLowerCase());
          sendResponse({ ok: true, data: row ? row.action_text : null });
          break;
        }
        case "GET_ACTION_BY_SHORTCUT_KEY": {
          const list = await getShortcuts(false);
          const key = (msg.shortcutKey || "").toLowerCase().trim();
          const row = list.find((s) => (s.shortcut_key || "").toLowerCase().trim() === key);
          sendResponse({ ok: true, data: row ? row.action_text : null });
          break;
        }
        case "REFRESH_SHORTCUTS": {
          await loadShortcutsFromSupabase(true);
          await broadcastShortcutsUpdated();
          sendResponse({ ok: true });
          break;
        }
        case "SAVE_CONFIG": {
          await chrome.storage.local.set({
            supabase_url: msg.supabase_url || "",
            supabase_anon_key: msg.supabase_anon_key || "",
          });
          if (msg.supabase_session != null) await chrome.storage.local.set({ supabase_session: msg.supabase_session });
          sendResponse({ ok: true });
          break;
        }
        case "GET_CONFIG": {
          const c = await getConfig();
          sendResponse({ ok: true, data: { url: c.url, anonKey: c.anonKey, hasSession: !!c.session } });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown type" });
      }
    } catch (err) {
      console.error("[BG]", err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});
