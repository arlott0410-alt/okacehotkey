// ===================== background.js (Supabase) =====================
const CACHE_KEY_SHORTCUTS = "shortcuts_cache";
const CACHE_KEY_FOLDERS = "folders_cache";
const CACHE_KEY_TS = "shortcuts_cache_ts";
const STORAGE_KEY_ENABLED_FOLDERS = "enabled_folder_ids";
const CACHE_DURATION_MS = 1000 * 60 * 5; // 5 นาที

// ค่าคงที่ Supabase – แก้ตรงนี้แล้วติดตั้ง extension ใช้ได้เลย (ไม่ต้องตั้งค่าใน UI)
const DEFAULT_SUPABASE_URL = "https://hpplggscegpmderckcnm.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcGxnZ3NjZWdwbWRlcmNrY25tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTgzNTUsImV4cCI6MjA4OTEzNDM1NX0.YLIQvmzvsAXo3plgPXcvTA6DoebqFxCWmFjRCdMg_zU"; // ใส่ anon key จริงของโปรเจกต์ Supabase

let inMemoryShortcuts = null;
let inMemoryFolders = null;
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

// ===================== Load folders from Supabase =====================
async function loadFoldersFromSupabase(forceRefresh = false) {
  const { url, anonKey, session } = await getConfig();
  if (!url || !anonKey) return [];

  const now = Date.now();
  if (!forceRefresh && inMemoryFolders && now - lastFetchTs < CACHE_DURATION_MS) {
    return inMemoryFolders;
  }

  try {
    const rows = await supabaseFetch(url, anonKey, session, "/folders?select=id,name,sort_order&order=sort_order.asc,name.asc", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const list = Array.isArray(rows) ? rows : [];
    inMemoryFolders = list;
    return list;
  } catch (e) {
    console.warn("[BG] loadFoldersFromSupabase error:", e.message);
    return inMemoryFolders || [];
  }
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
    const rows = await supabaseFetch(url, anonKey, session, "/shortcuts?select=id,command_name,shortcut_key,action_text,is_global,folder_id", {
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

// ===================== Get shortcuts (cache-first, filter by enabled folders) =====================
async function getShortcuts(forceRefresh = false) {
  const raw = await loadShortcutsFromSupabase(forceRefresh);
  const { [STORAGE_KEY_ENABLED_FOLDERS]: enabledIds } = await chrome.storage.local.get(STORAGE_KEY_ENABLED_FOLDERS);
  // null/undefined = ใช้ทุกโฟลเดอร์; array = ใช้เฉพาะโฟลเดอร์ที่เปิด + คีย์ลัดที่ไม่มีโฟลเดอร์ (folder_id null)
  const enabledSet = Array.isArray(enabledIds) ? new Set(enabledIds) : null;
  const list = raw.filter((s) => {
    if (s.folder_id == null) return true; // ไม่มีโฟลเดอร์ = ใช้เสมอ
    if (enabledSet === null) return true; // ไม่ได้ตั้งค่า = ใช้ทั้งหมด
    return enabledSet.has(s.folder_id);
  });
  return list.map((s) => ({
    id: s.id,
    command_name: s.command_name,
    shortcut: s.shortcut_key || "",
    shortcut_key: s.shortcut_key,
    content: s.action_text || "",
    action_text: s.action_text,
    is_global: !!s.is_global,
    folder_id: s.folder_id || null,
  }));
}

// ===================== Hydrate from storage on startup =====================
async function hydrateFromStorage() {
  const o = await chrome.storage.local.get([CACHE_KEY_SHORTCUTS, CACHE_KEY_TS, CACHE_KEY_FOLDERS]);
  if (Array.isArray(o[CACHE_KEY_SHORTCUTS])) {
    inMemoryShortcuts = o[CACHE_KEY_SHORTCUTS];
    lastFetchTs = o[CACHE_KEY_TS] || 0;
  }
  if (Array.isArray(o[CACHE_KEY_FOLDERS])) inMemoryFolders = o[CACHE_KEY_FOLDERS];
}

// ===================== Broadcast shortcuts updated =====================
async function broadcastShortcutsUpdated() {
  inMemoryShortcuts = null;
  inMemoryFolders = null;
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
          await loadFoldersFromSupabase(true);
          await broadcastShortcutsUpdated();
          sendResponse({ ok: true });
          break;
        }
        case "GET_FOLDERS": {
          const list = await loadFoldersFromSupabase(!!msg.forceRefresh);
          sendResponse({ ok: true, data: list });
          break;
        }
        case "SET_ENABLED_FOLDERS": {
          if (msg.ids == null) {
            await chrome.storage.local.remove(STORAGE_KEY_ENABLED_FOLDERS);
          } else if (Array.isArray(msg.ids)) {
            await chrome.storage.local.set({ [STORAGE_KEY_ENABLED_FOLDERS]: msg.ids });
          }
          inMemoryShortcuts = null;
          await broadcastShortcutsUpdated();
          sendResponse({ ok: true });
          break;
        }
        case "GET_ENABLED_FOLDERS": {
          const o = await chrome.storage.local.get(STORAGE_KEY_ENABLED_FOLDERS);
          const ids = Array.isArray(o[STORAGE_KEY_ENABLED_FOLDERS]) ? o[STORAGE_KEY_ENABLED_FOLDERS] : null;
          sendResponse({ ok: true, data: ids });
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
