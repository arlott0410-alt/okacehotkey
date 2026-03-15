// dom-utils.js
export function isSnippetEditorField(el) {
  return !!(el && el.tagName === "INPUT" && el.id === "admin_input");
}

export const INLINE_EDITABLE = new Set(["INPUT", "TEXTAREA"]);

export function isEditableElement(el) {
  if (!el || !(el instanceof Element)) return false;
  return INLINE_EDITABLE.has(el.tagName) || !!el.isContentEditable || el.tagName === "TEXTAREA-EX";
}

export function getFocusedInput(e) {
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

export function insertTextAtCursorImmediate(el, content, backspaceCount = 0) {
  if (!el) return;

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
