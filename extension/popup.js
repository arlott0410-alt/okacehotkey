(function () {
  const listEl = document.getElementById("shortcutList");
  const openOptions = document.getElementById("openOptions");

  openOptions.addEventListener("click", function (e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  function showLoading() {
    listEl.innerHTML = '<div class="loading">กำลังโหลด...</div>';
  }

  function renderShortcuts(shortcuts) {
    listEl.innerHTML = "";
    if (!shortcuts || shortcuts.length === 0) return;

    shortcuts.forEach(function (s) {
      const text = s.action_text || s.content || "";
      const label = s.shortcut_key || s.command_name || "—";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shortcut-item";
      btn.innerHTML = '<span class="label">' + escapeHtml(label) + "</span>" +
        (text ? '<div class="preview">' + escapeHtml(text.slice(0, 40)) + (text.length > 40 ? "…" : "") + "</div>" : "");
      btn.addEventListener("click", function () {
        insertTextAndClose(text);
      });
      listEl.appendChild(btn);
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function insertTextAndClose(text) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        window.close();
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "INSERT_TEXT", text: text }, function () {
        if (chrome.runtime.lastError) {
          // หน้าไม่มี content script (เช่น chrome://) ไม่ต้องทำอะไร
        }
        window.close();
      });
    });
  }

  showLoading();
  chrome.runtime.sendMessage({ type: "GET_SHORTCUTS" }, function (res) {
    if (res && res.ok && Array.isArray(res.data)) {
      renderShortcuts(res.data);
    } else {
      listEl.innerHTML = "";
    }
  });
})();
