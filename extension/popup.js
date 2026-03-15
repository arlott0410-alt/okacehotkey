(function () {
  const listEl = document.getElementById("shortcutList");
  const openOptions = document.getElementById("openOptions");

  openOptions.addEventListener("click", function (e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  function showLoading() {
    listEl.innerHTML = '<div class="loading">กำลังโหลด...</div>';
    var emptyMsg = document.getElementById("emptyMsg");
    if (emptyMsg) emptyMsg.classList.add("hidden");
  }

  function renderShortcuts(shortcuts) {
    const emptyMsg = document.getElementById("emptyMsg");
    listEl.innerHTML = "";
    if (!shortcuts || shortcuts.length === 0) {
      if (emptyMsg) emptyMsg.classList.remove("hidden");
      return;
    }
    if (emptyMsg) emptyMsg.classList.add("hidden");

    shortcuts.forEach(function (s) {
      const text = s.action_text || s.content || "";
      const shortcutKey = s.shortcut_key || "—";
      const commandName = s.command_name || shortcutKey;
      const preview = text ? text.slice(0, 80) + (text.length > 80 ? "…" : "") : "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shortcut-item";
      btn.innerHTML =
        '<div class="label-row">' +
          '<span class="shortcut-pill">' + escapeHtml(shortcutKey) + "</span>" +
          '<span class="command-name">' + escapeHtml(commandName) + "</span>" +
        "</div>" +
        (preview ? '<div class="preview">' + escapeHtml(preview) + "</div>" : "");
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
      var emptyMsg = document.getElementById("emptyMsg");
      if (emptyMsg) emptyMsg.classList.remove("hidden");
    }
  });
})();
