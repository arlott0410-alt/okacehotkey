// =================== content.js ===================
let currentSite = null;
let cachedSnippets = [];
let isProcessing = false;

let snippetsLoaded = false;   // โหลดสำเร็จแล้วหรือยัง
let snippetsLoading = false;  // กำลังโหลดอยู่ไหม

// ------- Confetti effect -------
let confettiStyleInjected = false;

function showConfetti(targetEl) {
  if (!document.body) return;

  if (!confettiStyleInjected) {
    const style = document.createElement("style");
    style.textContent = `
      .qp-confetti-piece {
        position: fixed;
        top: 0;
        transform-origin: left top;
        will-change: transform, opacity;
        pointer-events: none;
        --qp-x-move: 0px;
      }
      @keyframes qp-confetti-fall {
        0% {
          transform: translate3d(0, -100vh, 0) rotateZ(0deg);
          opacity: 0;
        }
        15% { opacity: 1; }
        100% {
          transform: translate3d(var(--qp-x-move), 110vh, 0) rotateZ(720deg);
          opacity: 0;
        }
      }
    `;
    document.documentElement.appendChild(style);
    confettiStyleInjected = true;
  }

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "999999";
  document.body.appendChild(container);

  const colors = ["#ff4b4b", "#ffb400", "#4caf50", "#03a9f4", "#e91e63"];
  const pieces = 80; // ปรับจำนวนเศษกระดาษได้

  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement("span");
    const size = 6 + Math.random() * 8;

    piece.className = "qp-confetti-piece";
    piece.style.width = size + "px";
    piece.style.height = size * 0.4 + "px";
    piece.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];

    // กระจายเต็มความกว้างด้านบน
    piece.style.left = Math.random() * 100 + "%";

    // ขยับเอียงซ้าย-ขวาระหว่างร่วง (ใช้ CSS var)
    const xMove = (Math.random() - 0.5) * 220; // ระยะแกว่งซ้ายขวา
    piece.style.setProperty("--qp-x-move", xMove + "px");

    piece.style.opacity = "0";

    // ให้ตกช้า ๆ (3 - 4.2 วินาที)
    const duration = 3 + Math.random() * 1.2;
    piece.style.animation =
      `qp-confetti-fall ${duration}s ease-out forwards`;
    piece.style.animationDelay = Math.random() * 0.25 + "s";

    container.appendChild(piece);
  }

  setTimeout(() => {
    container.remove();
  }, 5000); // อยู่บนจอนานขึ้นหน่อย
}

// ------- Storage wiring -------
chrome.storage.local.get(["currentSite"], (r) => {
  if (r.currentSite) {
    currentSite = r.currentSite;
    cachedSnippets = [];
    snippetsLoaded = false;
    loadSnippets();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.currentSite) {
    currentSite = changes.currentSite.newValue;
    cachedSnippets = [];
    snippetsLoaded = false;
    loadSnippets();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  // ตั้งค่า site จาก popup/background
  if (msg?.type === "SET_CURRENT_SITE" && msg.site) {
    console.log("[CONTENT] SET_CURRENT_SITE", msg.site);
    currentSite = msg.site;
    cachedSnippets = [];
    snippetsLoaded = false;
    loadSnippets();
  }

  // มีการเพิ่ม/ลบ snippets จากที่อื่น
  if (msg?.type === "SNIPPETS_UPDATED") {
    const siteFromPayload = msg.payload?.site || null;
    if (!siteFromPayload || siteFromPayload === currentSite) {
      cachedSnippets = [];
      snippetsLoaded = false;
      loadSnippets(true); // บังคับโหลดใหม่ 1 ครั้ง
    }
  }
});

// ----------------- Snippets fetch/cache -----------------
async function getSnippets() {
  if (!currentSite) return [];

  // ถ้า extension ถูก reload / disable context จะหาย
  if (!chrome.runtime || !chrome.runtime.id) {
    console.warn("[QP] runtime id missing, skip getSnippets");
    return [];
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "GET_SNIPPETS", site: currentSite },
        (res) => {
          // กัน error context invalid / background ตาย
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

// โหลด snippets จาก background
// จะยิงไปหา background แค่เมื่อยังไม่เคยโหลด หรือถูกสั่ง force ให้โหลดใหม่
async function loadSnippets(force = false) {
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

// ----------------- Helpers -----------------
function isSnippetEditorField(el) {
  return !!(el && el.tagName === "INPUT" && el.id === "admin_input");
}

const INLINE_EDITABLE = new Set(["INPUT", "TEXTAREA"]);

function getFocusedInput(e) {
  const path = (e && e.composedPath) ? e.composedPath() : [];
  for (const el of path) {
    if (!el || !(el instanceof Element)) continue;
    if (INLINE_EDITABLE.has(el.tagName)) return el;
    if (el.isContentEditable) return el;
    if (el.tagName === "TEXTAREA-EX") return el;
  }
  const a = document.activeElement;
  if (
    a &&
    (INLINE_EDITABLE.has(a.tagName) ||
      a.isContentEditable ||
      a.tagName === "TEXTAREA-EX")
  )
    return a;
  return null;
}

// INPUT/TEXTAREA
function insertIntoInputLike(el, content, backspaceCount = 0) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const val = el.value ?? "";
  const newStart = Math.max(0, start - backspaceCount);
  el.value = val.slice(0, newStart) + content + val.slice(end);
  const pos = newStart + content.length;
  el.selectionStart = el.selectionEnd = pos;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// contenteditable
function insertIntoContentEditable(el, content, backspaceCount = 0) {
  if (document.activeElement !== el) el.focus();
  for (let i = 0; i < backspaceCount; i++)
    document.execCommand("delete", false);
  const ok = document.execCommand("insertText", false, content);
  if (!ok) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(content);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: content })
  );
}

// <textarea-ex> ใน shadowRoot
function insertIntoTextareaEx(el, content, backspaceCount = 0) {
  const shadow = el.shadowRoot;
  if (!shadow) return;
  const real = shadow.querySelector("textarea");
  if (!real) return;
  const start = real.selectionStart ?? 0;
  const end = real.selectionEnd ?? 0;
  const val = real.value ?? "";
  const newStart = Math.max(0, start - backspaceCount);
  real.value = val.slice(0, newStart) + content + val.slice(end);
  const pos = newStart + content.length;
  real.selectionStart = real.selectionEnd = pos;
  real.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  real.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

// ✅ ฟังก์ชันนี้ “เวอร์ชันถูกต้องครบทุกกรณี”
function insertTextAtCursorImmediate(el, content, backspaceCount = 0) {
  if (!el) return;

  // ✅ handle <textarea-ex> with shadow DOM
  if (el.tagName === "TEXTAREA-EX") {
    const shadow = el.shadowRoot;
    if (shadow) {
      const realInput = shadow.querySelector("textarea");
      if (realInput) {
        realInput.value = content;
        realInput.dispatchEvent(
          new Event("input", { bubbles: true, composed: true })
        );
        realInput.dispatchEvent(
          new Event("change", { bubbles: true, composed: true })
        );
      }
    }
    return;
  }

  // ✅ handle contentEditable
  if (el.isContentEditable) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (backspaceCount > 0) {
      range.setStart(
        range.startContainer,
        Math.max(0, range.startOffset - backspaceCount)
      );
      range.deleteContents();
    }
    const node = document.createTextNode(content);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, composed: true })
    );
    return;
  }

  // ✅ handle <textarea> / <input>
  if (el.value !== undefined) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const val = el.value ?? "";
    const newStart = Math.max(0, start - backspaceCount);
    el.value = val.slice(0, newStart) + content + val.slice(end);
    const pos = newStart + content.length;
    el.selectionStart = el.selectionEnd = pos;
    el.dispatchEvent(
      new Event("input", { bubbles: true, composed: true })
    );
    el.dispatchEvent(
      new Event("change", { bubbles: true, composed: true })
    );
  }
}

// ----------------- Handlers -----------------
async function handleKeyDown(e) {
  if (isProcessing) return;
  const el = getFocusedInput(e);
  if (!el || isSnippetEditorField(el)) return;

  // ✅ ถ้ายังไม่เคยโหลดเลย ให้สั่งโหลดแบบ async แล้วจบ handler ไปก่อน
  if (!snippetsLoaded) {
    if (!snippetsLoading) {
      loadSnippets().catch(() => {});
    }
    return;
  }

  const snippets = cachedSnippets;
  if (!snippets.length) return;

  const parts = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  if (e.metaKey) parts.push("meta");
  const key = (e.key || "").toLowerCase();
  if (!["control", "shift", "alt", "meta"].includes(key)) parts.push(key);

  const combo = parts.join("+");
  const match = snippets.find(
    (s) => s.shortcut?.toLowerCase() === combo
  );
  if (!match) return;

  e.preventDefault();
  e.stopPropagation();
  isProcessing = true;
  insertTextAtCursorImmediate(el, match.content);
  showConfetti(el);        // <<< effect ตอนกดคีย์ลัด
  isProcessing = false;
}

async function handleInput(e) {
  if (isProcessing) return;
  if (e.inputType?.startsWith?.("delete")) return;

  const el = getFocusedInput(e);
  if (!el || isSnippetEditorField(el)) return;

  // ✅ ใช้ cache เหมือนกัน
  if (!snippetsLoaded) {
    if (!snippetsLoading) {
      loadSnippets().catch(() => {});
    }
    return;
  }

  const snippets = cachedSnippets;
  if (!snippets.length) return;

  const val = el.isContentEditable
    ? el.innerText ?? el.textContent ?? ""
    : el.value ?? "";
  if (!val) return;

  let match = null;
  const lower = val.toLowerCase();
  for (const s of snippets) {
    const trigger = (s.shortcut || "").toLowerCase();
    if (!trigger) continue;
    if (lower.endsWith(trigger)) {
      const startPos = lower.length - trigger.length;
      const prevChar = lower[startPos - 1] ?? " ";
      if (startPos === 0 || /\s/.test(prevChar)) {
        match = s;
        break;
      }
    }
  }

  if (match) {
    isProcessing = true;
    insertTextAtCursorImmediate(
      el,
      match.content,
      match.shortcut.length
    );
    showConfetti(el);      // <<< effect ตอนใช้ trigger แบบพิมพ์คำย่อ
    isProcessing = false;
  }
}

// ----------------- Bootstrap -----------------
function run() {
  if (window.quickTextPasteLoaded) return;
  window.quickTextPasteLoaded = true;

  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("input", handleInput, true);

  // โหลด snippets ใหม่เมื่อ SPA เปลี่ยน route (แต่มี guard snippetsLoaded อยู่แล้ว)
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
