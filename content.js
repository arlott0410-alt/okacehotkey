// content.js – โหลด shortcuts จาก Supabase ผ่าน background, รับ INSERT_TEXT จาก command
(async () => {
  const { initStorageWiring, loadSnippets } = await import(chrome.runtime.getURL("snippets.js"));
  const { handleKeyDown, handleInput } = await import(chrome.runtime.getURL("handlers.js"));
  const { getFocusedInput, insertTextAtCursorImmediate } = await import(chrome.runtime.getURL("dom-utils.js"));

  initStorageWiring();

  function run() {
    if (window.__okaceHotkeyLoaded) return;
    window.__okaceHotkeyLoaded = true;

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("input", handleInput, true);

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "INSERT_TEXT" && msg.text != null) {
        const el = getFocusedInput(null);
        if (el) {
          insertTextAtCursorImmediate(el, String(msg.text));
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "No focus" });
        }
        return true;
      }
      if (msg?.type === "SHORTCUTS_UPDATED") {
        loadSnippets(true).catch(() => {});
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });

    const fire = () => loadSnippets().catch(() => {});
    const OP = history.pushState;
    const OR = history.replaceState;
    history.pushState = function (...args) {
      const r = OP.apply(this, args);
      window.dispatchEvent(new Event("qp:route"));
      return r;
    };
    history.replaceState = function (...args) {
      const r = OR.apply(this, args);
      window.dispatchEvent(new Event("qp:route"));
      return r;
    };
    window.addEventListener("popstate", () => window.dispatchEvent(new Event("qp:route")));
    window.addEventListener("qp:route", fire, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
