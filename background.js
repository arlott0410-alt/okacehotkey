// ===================== background.js =====================
const BASE = "https://key-short.nm9123454158.com/api";
const RETRIES = 2;
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 ชั่วโมง

const cache = {
  siteMap: { ts: 0, data: null },
  snippetsBySite: new Map(),
};

const pending = new Map();

// ===================== API Helper =====================
async function fetchJSON(path, opts = {}, tries = RETRIES) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout ?? 20000);

  try {
    const headers = { ...(opts.headers || {}) };
    // Avoid CORS preflight on GET/HEAD by not forcing Content-Type.
    if (opts.body && !("Content-Type" in headers) && !("content-type" in headers)) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(`${BASE}${path}`, {
      headers,
      signal: controller.signal,
      cache: "no-store",
      ...opts,
    });

    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (e) {
    if (tries > 0) {
      await new Promise(r => setTimeout(r, 300));
      return fetchJSON(path, opts, tries - 1);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// ===================== DEDUPE =====================
function dedupe(key, fn) {
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    try {
      return await fn();
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, p);
  return p;
}

// ===================== Normalizer =====================
function normalizeSiteMap(raw) {
  const map = {};
  if (raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data)) Object.assign(map, raw.data);
  else if (Array.isArray(raw)) raw.forEach(s => s?._id && s?.name && (map[s._id] = s.name));
  else if (raw && typeof raw === "object") Object.assign(map, raw);
  return map;
}

// ===================== Cache Helper =====================
async function getCached(key, fetchFn, duration = CACHE_DURATION) {
  const now = Date.now();
  if (key === "SITE_MAP" && cache.siteMap.data && now - cache.siteMap.ts < duration) return cache.siteMap.data;
  if (key.startsWith("SNIPPETS_")) {
    const site = key.slice(10);
    const mem = cache.snippetsBySite.get(site);
    if (mem && now - mem.ts < duration) return mem.data;
  }

  const stored = await chrome.storage.local.get(key);
  if (stored[key]?.ts && now - stored[key].ts < duration) {
    const data = stored[key].data;
    if (key === "SITE_MAP") cache.siteMap = { ts: now, data };
    else cache.snippetsBySite.set(key.slice(10), { ts: now, data });
    return data;
  }

  const data = await fetchFn();
  await chrome.storage.local.set({ [key]: { ts: now, data } });
  if (key === "SITE_MAP") cache.siteMap = { ts: now, data };
  else cache.snippetsBySite.set(key.slice(10), { ts: now, data });
  return data;
}

// ===================== Invalidate Cache =====================
async function invalidateCache(site) {
  const keys = ["SITE_MAP"];
  if (site) keys.push(`SNIPPETS_${site}`);
  await chrome.storage.local.remove(keys);
  cache.siteMap = { ts: 0, data: null };
  if (site) cache.snippetsBySite.delete(site);
  if (!site) pending.clear();
  else pending.delete(`SNIPPETS_${site}`);
}

// ===================== API Calls =====================
async function getSiteMap() { return getCached("SITE_MAP", async () => normalizeSiteMap(await fetchJSON("/site-map"))); }
async function getSnippets(site) {
  if (!site) throw new Error("Missing site");
  return getCached(`SNIPPETS_${site}`, () => fetchJSON(`/extension?site=${encodeURIComponent(site)}`));
}

// ===================== Current Site Helper =====================
async function ensureCurrentSite() {
  const { currentSite } = await chrome.storage.local.get("currentSite");
  if (currentSite) return currentSite;

  try {
    const map = await getSiteMap();
    const ids = Object.keys(map || {});
    if (!ids.length) return null;
    const siteId = ids[0];
    await chrome.storage.local.set({ currentSite: siteId });
    return siteId;
  } catch (e) {
    return null;
  }
}

// ===================== Content Script Injector =====================
async function ensureContentScript(tabId) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  } catch (e) {
    // Ignore if already injected or not allowed
  }
}

// ===================== CRUD =====================
async function addSnippet(snippet) {
  const data = await fetchJSON("/extension", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snippet),
  });
  if (snippet.site) await invalidateCache(snippet.site);
  return data;
}

async function deleteSnippet(id) {
  await fetchJSON(`/extension/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ===================== Broadcast =====================
async function broadcast(type, payload) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type, payload }).catch(() => {}))
  );
}

// ===================== Auto-set current site =====================
async function applyCurrentSiteToTab(tabId) {
  if (!tabId) return;

  try {
    const currentSite = await ensureCurrentSite();
    if (currentSite) {
      await ensureContentScript(tabId);
      await chrome.tabs.sendMessage(tabId, {
        type: "SET_CURRENT_SITE",
        site: currentSite,
      }).catch(() => {});
    }
  } catch (e) {}
}

// เมื่อ tab ถูก activate
chrome.tabs.onActivated.addListener((activeInfo) => {
  applyCurrentSiteToTab(activeInfo.tabId);
});

// เมื่อ tab โหลดเสร็จ
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  ensureContentScript(tabId);
  applyCurrentSiteToTab(tabId);
});

// เมื่อ extension ติดตั้ง/อัปเดต
chrome.runtime.onInstalled.addListener(async () => {
  await ensureCurrentSite();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) applyCurrentSiteToTab(tab.id);
});

// เมื่อ Chrome เริ่มใหม่
chrome.runtime.onStartup.addListener(async () => {
  await ensureCurrentSite();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) applyCurrentSiteToTab(tab.id);
});

// เมื่อ currentSite ถูกเปลี่ยนจาก popup
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.currentSite) {
    const newSite = changes.currentSite.newValue;
    console.log("[BACKGROUND] currentSite changed to:", newSite);
    
    if (!newSite) return;

    const tabs = await chrome.tabs.query({});
    console.log("[BACKGROUND] Broadcasting SET_CURRENT_SITE to", tabs.length, "tabs");
    
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: "SET_CURRENT_SITE",
          site: newSite,
        }).then(() => {
          console.log("[BACKGROUND] Sent SET_CURRENT_SITE to tab:", tab.id);
        }).catch((err) => {
          console.warn("[BACKGROUND] Failed to send to tab:", tab.id, err.message);
        });
      }
    }
  }
});

// ===================== Message Router =====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "GET_SITE_MAP":
          sendResponse({ ok: true, data: await getSiteMap() });
          break;

        case "GET_SNIPPETS":
          sendResponse({ ok: true, data: await getSnippets(msg.site) });
          break;

        case "GET_CURRENT_SITE": {
          const { currentSite } = await chrome.storage.local.get("currentSite");
          sendResponse({ ok: true, data: { site: currentSite } });
          break;
        }

        case "ADD_SNIPPET": {
          const res = await addSnippet(msg.snippet);
          await broadcast("SNIPPETS_UPDATED", { site: msg.snippet?.site });
          await chrome.storage.local.set({ snippetsUpdatedAt: Date.now() });
          sendResponse({ ok: true, data: res });
          break;
        }

        case "DELETE_SNIPPET": {
          await deleteSnippet(msg.id);
          if (msg.site) await invalidateCache(msg.site);
          await broadcast("SNIPPETS_UPDATED", { site: msg.site });
          await chrome.storage.local.set({ snippetsUpdatedAt: Date.now() });
          sendResponse({ ok: true });
          break;
        }

        case "REFRESH_CACHE": {
          await chrome.storage.local.clear();
          cache.siteMap = { ts: 0, data: null };
          cache.snippetsBySite.clear();
          pending.clear();
          await chrome.storage.local.set({ snippetsUpdatedAt: Date.now() });
          sendResponse({ ok: true });
          break;
        }

        default:
          sendResponse({ ok: false, error: "Unknown type" });
      }
    } catch (err) {
      console.error("[BACKGROUND ERROR]", err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();

  return true;
});
