// handlers.js
import { showConfetti } from "./confetti.js";
import {
  cachedSnippets,
  snippetsLoaded,
  snippetsLoading,
  loadSnippets
} from "./snippets.js";
import {
  getFocusedInput,
  isSnippetEditorField,
  insertTextAtCursorImmediate
} from "./dom-utils.js";

let isProcessing = false;

export async function handleKeyDown(e) {
  if (isProcessing) return;
  const el = getFocusedInput(e);
  if (!el || isSnippetEditorField(el)) return;

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
  showConfetti(el);
  isProcessing = false;
}

export async function handleInput(e) {
  if (isProcessing) return;
  if (e.inputType?.startsWith?.("delete")) return;

  const el = getFocusedInput(e);
  if (!el || isSnippetEditorField(el)) return;

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
    showConfetti(el);
    isProcessing = false;
  }
}
