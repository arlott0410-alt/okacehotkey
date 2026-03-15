// options.js – Supabase Auth + CRUD shortcuts (ใช้เฉพาะ fetch ไม่โหลด script จากภายนอก)
const $ = (id) => document.getElementById(id);
const showMsg = (elId, text, isError) => {
  const el = $(elId);
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (text ? (isError ? "err" : "ok") : "");
};

let config = { url: "", anonKey: "", session: null };

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

// ---- Supabase REST (fetch only) ----
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
  const res = await fetch(config.url + "/rest/v1/shortcuts?select=id,command_name,shortcut_key,action_text,is_global&order=command_name.asc", {
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
    loadShortcuts();
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
  $("shortcutForm").classList.add("hidden");
  $("shortcutTableBody").innerHTML = "";
}

function updateAuthUI(user) {
  const loginForm = $("loginForm");
  const loggedIn = $("loggedIn");
  const userEmail = $("userEmail");
  const formWrap = $("shortcutForm");
  if (user) {
    if (loginForm) loginForm.classList.add("hidden");
    if (loggedIn) loggedIn.classList.remove("hidden");
    if (userEmail) userEmail.textContent = user.email || "";
    if (formWrap) formWrap.classList.remove("hidden");
  } else {
    if (loginForm) loginForm.classList.remove("hidden");
    if (loggedIn) loggedIn.classList.add("hidden");
    if (userEmail) userEmail.textContent = "";
    if (formWrap) formWrap.classList.add("hidden");
  }
}

async function loadShortcuts() {
  const tbody = $("shortcutTableBody");
  const loading = $("shortcutListLoading");
  if (!tbody) return;
  if (loading) loading.classList.remove("hidden");
  showMsg("shortcutListMsg", "", false);
  try {
    const data = await fetchShortcuts();
    const list = Array.isArray(data) ? data : [];
    tbody.innerHTML = "";
    list.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.command_name || "")}</td>
        <td>${escapeHtml(row.shortcut_key || "")}</td>
        <td class="action-preview">${escapeHtml((row.action_text || "").slice(0, 50))}${(row.action_text || "").length > 50 ? "…" : ""}</td>
        <td>${row.is_global ? "ใช่" : ""}</td>
        <td>
          <button type="button" class="btn-ghost btn-edit">แก้ไข</button>
          <button type="button" class="btn-danger btn-del">ลบ</button>
        </td>`;
      tr.querySelector(".btn-edit").addEventListener("click", () => startEdit(row));
      tr.querySelector(".btn-del").addEventListener("click", () => deleteShortcut(row.id));
      tbody.appendChild(tr);
    });
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "โหลดไม่สำเร็จ", true);
  } finally {
    if (loading) loading.classList.add("hidden");
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function startEdit(row) {
  $("editId").value = row.id || "";
  $("commandName").value = row.command_name || "";
  $("shortcutKey").value = row.shortcut_key || "";
  $("actionText").value = row.action_text || "";
  $("isGlobal").checked = !!row.is_global;
}

function cancelEdit() {
  $("editId").value = "";
  $("commandName").value = "";
  $("shortcutKey").value = "";
  $("actionText").value = "";
  $("isGlobal").checked = false;
}

async function saveShortcut() {
  const id = ($("editId")?.value || "").trim();
  const command_name = ($("commandName")?.value || "").trim();
  const shortcut_key = ($("shortcutKey")?.value || "").trim();
  const action_text = ($("actionText")?.value || "").trim();
  const is_global = $("isGlobal")?.checked ?? false;
  if (!command_name || !shortcut_key) {
    showMsg("shortcutListMsg", "กรุณาใส่ command name และ shortcut key", true);
    return;
  }
  try {
    if (id) {
      await restShortcuts("PATCH", { command_name, shortcut_key, action_text, is_global, updated_at: new Date().toISOString() }, id);
      showMsg("shortcutListMsg", "อัปเดตแล้ว", false);
    } else {
      await restShortcuts("POST", { command_name, shortcut_key, action_text, is_global });
      showMsg("shortcutListMsg", "เพิ่มแล้ว", false);
    }
    cancelEdit();
    await loadShortcuts();
    chrome.runtime.sendMessage({ type: "REFRESH_SHORTCUTS" }).catch(() => {});
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "บันทึกไม่สำเร็จ", true);
  }
}

async function deleteShortcut(id) {
  if (!confirm("ลบรายการนี้?")) return;
  try {
    await restShortcuts("DELETE", null, id);
    showMsg("shortcutListMsg", "ลบแล้ว", false);
    await loadShortcuts();
    chrome.runtime.sendMessage({ type: "REFRESH_SHORTCUTS" }).catch(() => {});
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "ลบไม่สำเร็จ", true);
  }
}

async function init() {
  await loadStoredConfig();
  const user = await restoreSession();
  updateAuthUI(user);
  if (user) await loadShortcuts();

  $("btnLogin")?.addEventListener("click", login);
  $("btnLogout")?.addEventListener("click", logout);
  $("btnSaveShortcut")?.addEventListener("click", saveShortcut);
  $("btnCancelEdit")?.addEventListener("click", () => { cancelEdit(); showMsg("shortcutListMsg", "", false); });
}

init();
