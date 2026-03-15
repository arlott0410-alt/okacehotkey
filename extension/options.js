// options.js – Text Blaze-style UI: sidebar (folders + snippets) + editor panel
const $ = (id) => document.getElementById(id);
const showMsg = (elId, text, isError) => {
  const el = $(elId);
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (text ? (isError ? "err" : "ok") : "hidden");
};

let config = { url: "", anonKey: "", session: null };
let folders = [];
let shortcuts = [];
let enabledFolderIds = null;
let editingId = null; // null | 'new' | uuid
let collapsedFolderIds = new Set();

async function loadStoredConfig() {
  const o = await chrome.storage.local.get(["supabase_url", "supabase_anon_key", "supabase_session"]);
  config = {
    url: (o.supabase_url || "").replace(/\/$/, ""),
    anonKey: o.supabase_anon_key || "",
    session: o.supabase_session || null,
  };
  if (!config.url || !config.anonKey) {
    const res = await new Promise((r) => chrome.runtime.sendMessage({ type: "GET_CONFIG" }, r));
    if (res?.ok && res.data) {
      config.url = res.data.url || "";
      config.anonKey = res.data.anonKey || "";
    }
  }
}

function headers(includeAuth = false) {
  const h = { apikey: config.anonKey, "Content-Type": "application/json", Prefer: "return=representation" };
  if (includeAuth && config.session?.access_token) h["Authorization"] = "Bearer " + config.session.access_token;
  return h;
}

async function authSignIn(email, password) {
  const res = await fetch(config.url + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || "เข้าสู่ระบบไม่สำเร็จ");
  return data;
}

async function authGetUser() {
  if (!config.session?.access_token) return null;
  const res = await fetch(config.url + "/auth/v1/user", {
    headers: { apikey: config.anonKey, Authorization: "Bearer " + config.session.access_token },
  });
  const data = await res.json();
  if (!res.ok) return null;
  return data;
}

async function authLogout() {
  if (!config.session?.access_token) return;
  await fetch(config.url + "/auth/v1/logout", {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json", Authorization: "Bearer " + config.session.access_token },
    body: JSON.stringify({ refresh_token: config.session.refresh_token || "" }),
  }).catch(() => {});
}

async function fetchFolders() {
  const res = await fetch(config.url + "/rest/v1/folders?select=id,name,sort_order&order=sort_order.asc,name.asc", {
    headers: headers(true),
  });
  if (!res.ok) {
    if (res.status === 404 || res.status === 406) return [];
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || res.statusText);
  }
  return res.json();
}

async function restFolders(method, body = null, id = null) {
  const url = id
    ? config.url + "/rest/v1/folders?id=eq." + encodeURIComponent(id)
    : config.url + "/rest/v1/folders";
  const opts = { method, headers: headers(true) };
  if (body && (method === "POST" || method === "PATCH")) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || res.statusText);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json();
}

async function restShortcuts(method, body = null, id = null) {
  const url = id
    ? config.url + "/rest/v1/shortcuts?id=eq." + encodeURIComponent(id)
    : config.url + "/rest/v1/shortcuts";
  const opts = { method, headers: headers(true) };
  if (body && (method === "POST" || method === "PATCH")) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || res.statusText);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json();
}

async function fetchShortcuts() {
  const res = await fetch(config.url + "/rest/v1/shortcuts?select=id,command_name,shortcut_key,action_text,is_global,folder_id,sort_order&order=sort_order.asc,command_name.asc", {
    headers: headers(true),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || res.statusText);
  }
  return res.json();
}

async function restoreSession() {
  const o = await chrome.storage.local.get(["supabase_session"]);
  config.session = o.supabase_session || null;
  if (!config.session?.access_token || !config.url) return null;
  const user = await authGetUser();
  return user;
}

async function login() {
  const email = ($("loginEmail")?.value || "").trim();
  const password = ($("loginPassword")?.value || "");
  if (!email || !password) {
    showMsg("authMsg", "กรุณาใส่ email และ password", true);
    return;
  }
  if (!config.url || !config.anonKey) {
    showMsg("authMsg", "ไม่พบการตั้งค่า Supabase", true);
    return;
  }
  showMsg("authMsg", "กำลังเข้าสู่ระบบ...", false);
  try {
    const data = await authSignIn(email, password);
    config.session = { access_token: data.access_token, refresh_token: data.refresh_token };
    await chrome.storage.local.set({ supabase_session: config.session });
    chrome.runtime.sendMessage({ type: "SAVE_CONFIG", supabase_session: config.session }).catch(() => {});
    showMsg("authMsg", "เข้าสู่ระบบแล้ว", false);
    updateAuthUI(data.user);
    await loadFolders();
    await loadShortcuts();
  } catch (e) {
    showMsg("authMsg", e.message || "เข้าสู่ระบบไม่สำเร็จ", true);
  }
}

async function logout() {
  await authLogout().catch(() => {});
  config.session = null;
  await chrome.storage.local.set({ supabase_session: null });
  chrome.runtime.sendMessage({ type: "SAVE_CONFIG", supabase_session: null }).catch(() => {});
  showMsg("authMsg", "", false);
  updateAuthUI(null);
  shortcuts = [];
  editingId = null;
  $("sidebarList").innerHTML = "";
  showEditorPanel(false);
}

function updateAuthUI(user) {
  const loginPage = $("loginPage");
  const dashboard = $("dashboard");
  const authWrap = $("authWrap");
  const loggedIn = $("loggedIn");
  const userEmail = $("userEmail");
  if (user) {
    if (loginPage) loginPage.classList.add("hidden");
    if (dashboard) dashboard.classList.remove("hidden");
    if (authWrap) authWrap.style.display = "";
    if (loggedIn) loggedIn.classList.remove("hidden");
    if (userEmail) userEmail.textContent = user.email || "";
  } else {
    if (loginPage) loginPage.classList.remove("hidden");
    if (dashboard) dashboard.classList.add("hidden");
    if (authWrap) authWrap.style.display = "none";
    if (loggedIn) loggedIn.classList.add("hidden");
    if (userEmail) userEmail.textContent = "";
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

async function loadEnabledFolders() {
  const res = await new Promise((r) => chrome.runtime.sendMessage({ type: "GET_ENABLED_FOLDERS" }, r));
  enabledFolderIds = res?.ok && res.data != null ? res.data : null;
}

async function setEnabledFolders(ids) {
  await new Promise((r) => chrome.runtime.sendMessage({ type: "SET_ENABLED_FOLDERS", ids: ids }, r));
  enabledFolderIds = ids;
}

function toggleFolderExpand(folderKey) {
  if (collapsedFolderIds.has(folderKey)) collapsedFolderIds.delete(folderKey);
  else collapsedFolderIds.add(folderKey);
  renderSidebar();
}

async function toggleFolderEnabled(folderId, e) {
  e.stopPropagation();
  const allIds = folders.map((f) => f.id);
  const current = enabledFolderIds === null ? allIds : [...enabledFolderIds];
  const has = current.includes(folderId);
  let next = has ? current.filter((id) => id !== folderId) : [...current, folderId].filter((id) => allIds.includes(id));
  if (next.length === allIds.length) next = null;
  await setEnabledFolders(next);
  enabledFolderIds = next;
  renderSidebar();
}

function renderSidebar() {
  const listEl = $("sidebarList");
  if (!listEl) return;

  const byFolder = {};
  folders.forEach((f) => { byFolder[f.id] = []; });
  shortcuts.forEach((s) => {
    const k = s.folder_id || "";
    if (!byFolder[k]) byFolder[k] = [];
    byFolder[k].push(s);
  });
  Object.keys(byFolder).forEach((k) => {
    byFolder[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  });

  const allIds = folders.map((f) => f.id);
  const effectiveEnabled = enabledFolderIds === null ? allIds : enabledFolderIds;

  listEl.innerHTML = "";

  function makeSnippetItem(row, folderKey) {
    const item = document.createElement("div");
    item.className = "snippet-item" + (editingId === row.id ? " active" : "");
    item.dataset.id = row.id;
    item.dataset.folderKey = folderKey;
    item.draggable = true;
    item.innerHTML =
      '<span class="drag-handle" title="ลากจัดเรียง">⋮⋮</span>' +
      `<span class="snippet-label">${escapeHtml(row.command_name || "")}</span>` +
      `<span class="shortcut-pill">${escapeHtml(row.shortcut_key || "")}</span>`;
    item.querySelector(".drag-handle").addEventListener("click", (e) => e.stopPropagation());
    item.addEventListener("click", (e) => { if (!e.target.classList.contains("drag-handle")) selectSnippet(row.id); });
    setupSnippetDrag(item, folderKey);
    return item;
  }

  folders.forEach((f) => {
    const expanded = !collapsedFolderIds.has(f.id);
    const on = effectiveEnabled.includes(f.id);
    const block = document.createElement("div");
    block.className = "folder-block" + (expanded ? " expanded" : " collapsed");

    const header = document.createElement("div");
    header.className = "folder-header";
    header.innerHTML =
      `<span class="folder-arrow">▼</span><span class="folder-name">${escapeHtml(f.name)}</span>` +
      `<div class="folder-actions">` +
      `<button type="button" class="folder-btn folder-edit" title="แก้ไขโฟลเดอร์">✏️</button>` +
      `<button type="button" class="folder-btn folder-delete" title="ลบโฟลเดอร์">🗑</button>` +
      `<div class="folder-switch ${on ? "on" : ""}" role="button" tabindex="0"></div>` +
      `</div>`;
    header.addEventListener("click", (e) => {
      if (!e.target.closest(".folder-switch") && !e.target.closest(".folder-actions")) toggleFolderExpand(f.id);
    });
    header.querySelector(".folder-switch").addEventListener("click", (e) => toggleFolderEnabled(f.id, e));
    header.querySelector(".folder-edit").addEventListener("click", (e) => { e.stopPropagation(); editFolder(f); });
    header.querySelector(".folder-delete").addEventListener("click", (e) => { e.stopPropagation(); deleteFolder(f); });
    block.appendChild(header);

    const shortcutsEl = document.createElement("div");
    shortcutsEl.className = "folder-shortcuts";
    (byFolder[f.id] || []).forEach((row) => shortcutsEl.appendChild(makeSnippetItem(row, f.id)));
    block.appendChild(shortcutsEl);
    listEl.appendChild(block);
  });
}

function setupSnippetDrag(item, folderKey) {
  item.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", item.dataset.id);
    e.dataTransfer.setData("application/folder-key", folderKey);
    e.dataTransfer.effectAllowed = "move";
    item.classList.add("dragging");
  });
  item.addEventListener("dragend", () => item.classList.remove("dragging"));
  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const id = e.dataTransfer.getData("text/plain");
    const fromKey = e.dataTransfer.getData("application/folder-key");
    if (fromKey !== folderKey || id === item.dataset.id) return;
    item.classList.add("drop-over");
  });
  item.addEventListener("dragleave", () => item.classList.remove("drop-over"));
  item.addEventListener("drop", (e) => {
    e.preventDefault();
    item.classList.remove("drop-over");
    const draggedId = e.dataTransfer.getData("text/plain");
    const fromKey = e.dataTransfer.getData("application/folder-key");
    if (fromKey !== folderKey || draggedId === item.dataset.id) return;
    const container = item.parentElement;
    const items = Array.from(container.querySelectorAll(".snippet-item"));
    const fromIdx = items.findIndex((el) => el.dataset.id === draggedId);
    const toIdx = items.findIndex((el) => el === item);
    if (fromIdx === -1 || toIdx === -1) return;
    const orderedIds = items.map((el) => el.dataset.id);
    const [moved] = orderedIds.splice(fromIdx, 1);
    orderedIds.splice(toIdx, 0, moved);
    updateShortcutOrder(folderKey || null, orderedIds);
  });
}

async function updateShortcutOrder(folderId, orderedIds) {
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await restShortcuts("PATCH", { sort_order: i, updated_at: new Date().toISOString() }, orderedIds[i]);
    }
    await loadShortcuts();
    chrome.runtime.sendMessage({ type: "REFRESH_SHORTCUTS" }).catch(() => {});
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "จัดเรียงไม่สำเร็จ", true);
  }
}

async function editFolder(f) {
  const name = prompt("ชื่อโฟลเดอร์", f.name || "");
  if (name == null || name.trim() === "") return;
  try {
    await restFolders("PATCH", { name: name.trim(), updated_at: new Date().toISOString() }, f.id);
    showMsg("shortcutListMsg", "แก้ไขโฟลเดอร์แล้ว", false);
    await loadFolders();
    chrome.runtime.sendMessage({ type: "REFRESH_SHORTCUTS" }).catch(() => {});
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "แก้ไขไม่สำเร็จ", true);
  }
}

async function deleteFolder(f) {
  const inFolder = shortcuts.filter((s) => s.folder_id === f.id).length;
  if (inFolder > 0) {
    showMsg("shortcutListMsg", "ไม่สามารถลบโฟลเดอร์ที่มีคำลัดได้ กรุณาย้ายหรือลบคำลัดในโฟลเดอร์ก่อน", true);
    return;
  }
  if (!confirm(`ลบโฟลเดอร์ "${f.name}"?`)) return;
  try {
    await restFolders("DELETE", null, f.id);
    showMsg("shortcutListMsg", "ลบโฟลเดอร์แล้ว", false);
    await loadFolders();
    await loadShortcuts();
    chrome.runtime.sendMessage({ type: "REFRESH_SHORTCUTS" }).catch(() => {});
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "ลบไม่สำเร็จ", true);
  }
}

async function loadFolders() {
  const selectEl = $("folderId");
  try {
    folders = await fetchFolders();
    await loadEnabledFolders();
  } catch (e) {
    folders = [];
  }

  if (selectEl) {
    selectEl.innerHTML = "";
    folders.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name;
      selectEl.appendChild(opt);
    });
    if (folders.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— สร้างโฟลเดอร์ก่อน —";
      opt.disabled = true;
      selectEl.appendChild(opt);
    }
  }
  renderSidebar();
}

async function addFolder() {
  const name = prompt("ชื่อโฟลเดอร์");
  if (!name || !name.trim()) return;
  try {
    await restFolders("POST", { name: name.trim(), sort_order: folders.length });
    showMsg("shortcutListMsg", "เพิ่มโฟลเดอร์แล้ว", false);
    await loadFolders();
    chrome.runtime.sendMessage({ type: "REFRESH_SHORTCUTS" }).catch(() => {});
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "เพิ่มโฟลเดอร์ไม่สำเร็จ", true);
  }
}

async function loadShortcuts() {
  showMsg("shortcutListMsg", "", false);
  try {
    shortcuts = await fetchShortcuts();
    shortcuts = Array.isArray(shortcuts) ? shortcuts : [];
  } catch (e) {
    shortcuts = [];
    showMsg("shortcutListMsg", e.message || "โหลดไม่สำเร็จ", true);
  }
  renderSidebar();
}

function showEditorPanel(show) {
  const panel = $("editorPanel");
  const empty = $("emptyState");
  if (show) {
    panel.classList.add("visible");
    if (empty) empty.style.display = "none";
  } else {
    panel.classList.remove("visible");
    if (empty) empty.style.display = "flex";
  }
}

function selectSnippet(id) {
  const row = shortcuts.find((s) => s.id === id);
  if (!row) return;
  editingId = id;
  $("editId").value = row.id || "";
  $("folderId").value = row.folder_id || "";
  $("commandName").value = row.command_name || "";
  $("shortcutKey").value = row.shortcut_key || "";
  $("actionText").value = row.action_text || "";
  $("btnDeleteShortcut").classList.remove("hidden");
  showEditorPanel(true);
  renderSidebar();
}

function startNewSnippet() {
  editingId = "new";
  $("editId").value = "";
  $("folderId").value = folders[0] ? folders[0].id : "";
  $("commandName").value = "";
  $("shortcutKey").value = "";
  $("actionText").value = "";
  $("btnDeleteShortcut").classList.add("hidden");
  showEditorPanel(true);
  renderSidebar();
  $("commandName").focus();
}

function cancelEdit() {
  editingId = null;
  $("editId").value = "";
  $("folderId").value = "";
  $("commandName").value = "";
  $("shortcutKey").value = "";
  $("actionText").value = "";
  showEditorPanel(false);
  showMsg("shortcutListMsg", "", false);
  renderSidebar();
}

async function saveShortcut() {
  const id = ($("editId")?.value || "").trim();
  const folder_id = ($("folderId")?.value || "").trim() || null;
  const command_name = ($("commandName")?.value || "").trim();
  const shortcut_key = ($("shortcutKey")?.value || "").trim();
  const action_text = ($("actionText")?.value || "").trim();
  if (!command_name || !shortcut_key) {
    showMsg("shortcutListMsg", "กรุณาใส่ Label และ Shortcut", true);
    return;
  }
  if (!folder_id) {
    showMsg("shortcutListMsg", "กรุณาเลือกโฟลเดอร์", true);
    return;
  }
  const body = { command_name, shortcut_key, action_text, is_global: true, folder_id };
  if (id) {
    body.updated_at = new Date().toISOString();
  } else {
    const inFolder = shortcuts.filter((s) => s.folder_id === folder_id);
    body.sort_order = inFolder.length > 0 ? Math.max(...inFolder.map((s) => s.sort_order ?? 0)) + 1 : 0;
  }
  try {
    if (id) {
      await restShortcuts("PATCH", body, id);
      showMsg("shortcutListMsg", "อัปเดตแล้ว", false);
    } else {
      await restShortcuts("POST", body);
      showMsg("shortcutListMsg", "เพิ่มแล้ว", false);
    }
    await loadShortcuts();
    chrome.runtime.sendMessage({ type: "REFRESH_SHORTCUTS" }).catch(() => {});
    if (id) selectSnippet(id);
    else {
      const newRow = shortcuts.find((s) => s.command_name === command_name && s.shortcut_key === shortcut_key);
      if (newRow) selectSnippet(newRow.id);
      else cancelEdit();
    }
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "บันทึกไม่สำเร็จ", true);
  }
}

async function deleteShortcut() {
  const id = ($("editId")?.value || "").trim();
  if (!id || !confirm("ลบ snippet นี้?")) return;
  try {
    await restShortcuts("DELETE", null, id);
    showMsg("shortcutListMsg", "ลบแล้ว", false);
    await loadShortcuts();
    chrome.runtime.sendMessage({ type: "REFRESH_SHORTCUTS" }).catch(() => {});
    cancelEdit();
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "ลบไม่สำเร็จ", true);
  }
}

async function init() {
  await loadStoredConfig();
  const user = await restoreSession();
  updateAuthUI(user);
  await loadFolders();
  if (user) await loadShortcuts();

  $("btnLogin")?.addEventListener("click", login);
  $("btnLogout")?.addEventListener("click", logout);
  $("btnNewSnippet")?.addEventListener("click", startNewSnippet);
  $("btnAddFolder")?.addEventListener("click", addFolder);
  $("btnSaveShortcut")?.addEventListener("click", saveShortcut);
  $("btnCancelEdit")?.addEventListener("click", cancelEdit);
  $("btnDeleteShortcut")?.addEventListener("click", deleteShortcut);
}

init();
