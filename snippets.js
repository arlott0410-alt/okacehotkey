// snippets.js
export let currentSite = null;
export let cachedSnippets = [];
export let snippetsLoaded = false;
export let snippetsLoading = false;

export function setCurrentSite(site) {
  currentSite = site;
  cachedSnippets = [];
  snippetsLoaded = false;
}

export async function getSnippets() {
  if (!currentSite) return [];

  if (!chrome.runtime || !chrome.runtime.id) {
    console.warn("[QP] runtime id missing, skip getSnippets");
    return [];
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "GET_SNIPPETS", site: currentSite },
        (res) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[QP] sendMessage error:",
              chrome.runtime.lastError.message
            );
            return resolve([]);
          }

          if (!res?.ok) return resolve([]);
          const list = Array.isArray(res.data?.snippets)
            ? res.data.snippets
            : [];
          resolve(list);
        }
      );
    } catch (err) {
      console.warn("[QP] sendMessage threw:", err);
      resolve([]);
    }
  });
}

export async function loadSnippets(force = false) {
  if (!currentSite) return [];

  if (!force) {
    if (snippetsLoaded) return cachedSnippets;
    if (snippetsLoading) return cachedSnippets;
  }

  snippetsLoading = true;
  try {
    const list = await getSnippets();
    cachedSnippets = list;
    snippetsLoaded = true;
  } catch (err) {
    console.warn("[QP] loadSnippets error:", err);
  } finally {
    snippetsLoading = false;
  }
  return cachedSnippets;
}

export function initStorageWiring() {
  console.log("[CONTENT] initStorageWiring called");
  
  // 🚀 ขอ currentSite จาก background ทันทีที่ content script เริ่มทำงาน
  chrome.runtime.sendMessage({ type: "GET_CURRENT_SITE" }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn("[CONTENT] GET_CURRENT_SITE error:", chrome.runtime.lastError);
      return;
    }
    
    if (res?.ok && res.data?.site) {
      console.log("[CONTENT] Got currentSite from background:", res.data.site);
      setCurrentSite(res.data.site);
      loadSnippets();
    }
  });

  chrome.storage.local.get(["currentSite"], (r) => {
    if (r.currentSite) {
      console.log("[CONTENT] Got currentSite from storage:", r.currentSite);
      setCurrentSite(r.currentSite);
      loadSnippets();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("[CONTENT] Message received:", msg);
    
    // Respond to PING to check if content script is loaded
    if (msg?.type === "PING") {
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "SET_CURRENT_SITE" && msg.site) {
      console.log("[CONTENT] SET_CURRENT_SITE received:", msg.site);
      setCurrentSite(msg.site);
      loadSnippets(true); // force reload to get new snippets
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === "SNIPPETS_UPDATED") {
      const siteFromPayload = msg.payload?.site || null;
      console.log("[CONTENT] SNIPPETS_UPDATED for site:", siteFromPayload);
      
      if (!siteFromPayload || siteFromPayload === currentSite) {
        cachedSnippets = [];
        snippetsLoaded = false;
        loadSnippets(true);
      }
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });
  
  // ฟังการเปลี่ยนแปลงใน storage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.currentSite) {
      const newSite = changes.currentSite.newValue;
      console.log("[CONTENT] Storage changed, new site:", newSite);
      
      if (newSite && newSite !== currentSite) {
        setCurrentSite(newSite);
        loadSnippets(true);
      }
    }
  });
}
