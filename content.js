// content.js (main) – ใช้ dynamic import แทน import ตรง ๆ
(async () => {
  // โหลดไฟล์ย่อยแบบ runtime
  const { initStorageWiring, loadSnippets } =
    await import(chrome.runtime.getURL("snippets.js"));
  const { handleKeyDown, handleInput } =
    await import(chrome.runtime.getURL("handlers.js"));

  initStorageWiring();

  function run() {
    if (window.quickTextPasteLoaded) return;
    window.quickTextPasteLoaded = true;

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("input", handleInput, true);

    (function patchHistory() {
      const fire = () => { loadSnippets().catch(() => {}); };
      const OP = history.pushState, OR = history.replaceState;
      history.pushState = function () {
        const r = OP.apply(this, arguments);
        window.dispatchEvent(new Event("qp:route"));
        return r;
      };
      history.replaceState = function () {
        const r = OR.apply(this, arguments);
        window.dispatchEvent(new Event("qp:route"));
        return r;
      };
      window.addEventListener("popstate", () =>
        window.dispatchEvent(new Event("qp:route"))
      );
      window.addEventListener("qp:route", fire, { passive: true });
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
