// ===================== background.js =====================
const BASE = "https://api-key-lat.thaideal.co/api";
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
  if (site) pending.delete(`SNIPPETS_${site}`);
  else pending.clear();
}

// ===================== API Calls =====================
async function getSiteMap() { return getCached("SITE_MAP", async () => normalizeSiteMap(await fetchJSON("/site-map"))); }
async function getSnippets(site) {
  if (!site) throw new Error("Missing site");
  return getCached(`SNIPPETS_${site}`, () => fetchJSON(`/extension?site=${encodeURIComponent(site)}`));
}

// ===================== CRUD =====================
async function addSnippet(snippet) {
  const data = await fetchJSON("/extension", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snippet) });
  if (snippet.site) await invalidateCache(snippet.site);
  return data;
}

async function deleteSnippet(id) {
  await fetchJSON(`/extension/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ===================== Broadcast =====================
async function broadcast(type, payload) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type, payload }).catch(() => {})));
}

// ===================== Auto-set current site for new/active tabs =====================
async function applyCurrentSiteToTab(tabId) {
  if (!tabId) return;

  try {
    const { currentSite } = await chrome.storage.local.get("currentSite");
    if (currentSite) {
      await chrome.tabs.sendMessage(tabId, {
        type: "SET_CURRENT_SITE",
        site: currentSite,
      });
    }
  } catch (e) {
    // Ignore if tab not ready
  }
}

// เมื่อ tab ถูก activate (สลับมา)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await applyCurrentSiteToTab(activeInfo.tabId);
});

// เมื่อ tab ถูก update (reload หรือ load เสร็จ)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    await applyCurrentSiteToTab(tabId);
  }
});

// เมื่อ extension ติดตั้ง/อัปเดต ให้ sync ไปทุก tab
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) await applyCurrentSiteToTab(tab.id);
  }
});

// เมื่อ storage เปลี่ยน (เช่น currentSite เปลี่ยนจาก popup) ให้ broadcast ไปทุก tab
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.currentSite) {
    const newSite = changes.currentSite.newValue;
    if (newSite) {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "SET_CURRENT_SITE",
            site: newSite,
          }).catch(() => {});
        }
      }
    }
  }
});

// ===================== Message Router =====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "GET_SITE_MAP": sendResponse({ ok: true, data: await getSiteMap() }); break;
        case "GET_SNIPPETS": sendResponse({ ok: true, data: await getSnippets(msg.site) }); break;
        case "ADD_SNIPPET": {
          const res = await addSnippet(msg.snippet);
          await broadcast("SNIPPETS_UPDATED", { site: msg.snippet?.site });
          await chrome.storage.local.set({ snippetsUpdatedAt: Date.now() });
          sendResponse({ ok: true, data: res }); break;
        }
        case "DELETE_SNIPPET": {
          await deleteSnippet(msg.id);
          if (msg.site) await invalidateCache(msg.site);
          await broadcast("SNIPPETS_UPDATED", { site: msg.site });
          await chrome.storage.local.set({ snippetsUpdatedAt: Date.now() });
          sendResponse({ ok: true }); break;
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
        default: sendResponse({ ok: false, error: "Unknown type" });
      }
    } catch (err) {
      console.error("[BACKGROUND ERROR]", err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});
