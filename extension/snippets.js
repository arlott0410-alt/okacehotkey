// snippets.js – ดึง shortcuts จาก Supabase ผ่าน background (cache ใน chrome.storage)
export let cachedSnippets = [];
export let snippetsLoaded = false;
export let snippetsLoading = false;

export async function getSnippets() {
  if (!chrome.runtime?.id) return [];

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_SHORTCUTS" }, (res) => {
      if (chrome.runtime.lastError) return resolve([]);
      if (!res?.ok) return resolve([]);
      const list = Array.isArray(res.data) ? res.data : [];
      resolve(list);
    });
  });
}

export async function loadSnippets(force = false) {
  if (!force && snippetsLoaded) return cachedSnippets;
  if (snippetsLoading) return cachedSnippets;

  snippetsLoading = true;
  try {
    const list = await getSnippets();
    cachedSnippets = list;
    snippetsLoaded = true;
  } catch (err) {
    console.warn("[snippets] loadSnippets error:", err);
  } finally {
    snippetsLoading = false;
  }
  return cachedSnippets;
}

export function invalidateCache() {
  cachedSnippets = [];
  snippetsLoaded = false;
}

export function initStorageWiring() {
  chrome.runtime.sendMessage({ type: "GET_SHORTCUTS", forceRefresh: true }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.ok && Array.isArray(res.data)) {
      cachedSnippets = res.data;
      snippetsLoaded = true;
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SHORTCUTS_UPDATED") {
      invalidateCache();
      loadSnippets(true).catch(() => {});
    }
  });
}
