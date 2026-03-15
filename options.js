// options.js – Supabase Auth + CRUD shortcuts (ใช้ใน options page เท่านั้น)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const $ = (id) => document.getElementById(id);
const showMsg = (elId, text, isError) => {
  const el = $(elId);
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (text ? (isError ? "err" : "ok") : "");
};

let supabase = null;

function getConfigFromForm() {
  return {
    supabase_url: ($("supabaseUrl")?.value || "").trim().replace(/\/$/, ""),
    supabase_anon_key: ($("supabaseAnonKey")?.value || "").trim(),
  };
}

async function loadStoredConfig() {
  const o = await chrome.storage.local.get(["supabase_url", "supabase_anon_key"]);
  if ($("supabaseUrl")) $("supabaseUrl").value = o.supabase_url || "";
  if ($("supabaseAnonKey")) $("supabaseAnonKey").value = o.supabase_anon_key || "";
}

async function saveConfig() {
  const { supabase_url, supabase_anon_key } = getConfigFromForm();
  if (!supabase_url || !supabase_anon_key) {
    showMsg("configMsg", "กรุณาใส่ URL และ Anon Key", true);
    return;
  }
  await chrome.storage.local.set({ supabase_url, supabase_anon_key });
  chrome.runtime.sendMessage({ type: "SAVE_CONFIG", supabase_url, supabase_anon_key }).catch(() => {});
  showMsg("configMsg", "บันทึกแล้ว", false);
  initSupabase();
}

function initSupabase() {
  const { supabase_url, supabase_anon_key } = getConfigFromForm();
  if (!supabase_url || !supabase_anon_key) {
    supabase = null;
    return;
  }
  supabase = createClient(supabase_url, supabase_anon_key);
}

async function restoreSession() {
  const o = await chrome.storage.local.get(["supabase_session"]);
  const session = o.supabase_session;
  if (!supabase || !session?.access_token) return null;
  supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token || "",
  }).catch(() => {});
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function login() {
  const email = ($("loginEmail")?.value || "").trim();
  const password = ($("loginPassword")?.value || "");
  if (!email || !password) {
    showMsg("authMsg", "กรุณาใส่ email และ password", true);
    return;
  }
  if (!supabase) {
    showMsg("authMsg", "กรุณาบันทึก Config ก่อน", true);
    return;
  }
  showMsg("authMsg", "กำลังเข้าสู่ระบบ...", false);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await chrome.storage.local.set({ supabase_session: data.session });
    chrome.runtime.sendMessage({ type: "SAVE_CONFIG", supabase_session: data.session }).catch(() => {});
    showMsg("authMsg", "เข้าสู่ระบบแล้ว", false);
    updateAuthUI(data.user);
    loadShortcuts();
  } catch (e) {
    showMsg("authMsg", e.message || "เข้าสู่ระบบไม่สำเร็จ", true);
  }
}

async function logout() {
  if (supabase) supabase.auth.signOut().catch(() => {});
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
    const { data, error } = await supabase.from("shortcuts").select("id,command_name,shortcut_key,action_text,is_global").order("command_name");
    if (error) throw error;
    tbody.innerHTML = "";
    (data || []).forEach((row) => {
      const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${escapeHtml(row.command_name || "")}</td>
            <td>${escapeHtml(row.shortcut_key || "")}</td>
            <td class="action-preview">${escapeHtml((row.action_text || "").slice(0, 50))}${(row.action_text || "").length > 50 ? "…" : ""}</td>
            <td>${row.is_global ? "ใช่" : ""}</td>
            <td>
              <button type="button" class="btn-ghost btn-edit" data-id="${escapeHtml(row.id)}">แก้ไข</button>
              <button type="button" class="btn-danger btn-del" data-id="${escapeHtml(row.id)}">ลบ</button>
            </td>
          `;
      tr.querySelector(".btn-edit")?.addEventListener("click", () => startEdit(row));
      tr.querySelector(".btn-del")?.addEventListener("click", () => deleteShortcut(row.id));
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
      const { error } = await supabase.from("shortcuts").update({ command_name, shortcut_key, action_text, is_global, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      showMsg("shortcutListMsg", "อัปเดตแล้ว", false);
    } else {
      const { error } = await supabase.from("shortcuts").insert({ command_name, shortcut_key, action_text, is_global });
      if (error) throw error;
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
    const { error } = await supabase.from("shortcuts").delete().eq("id", id);
    if (error) throw error;
    showMsg("shortcutListMsg", "ลบแล้ว", false);
    await loadShortcuts();
    chrome.runtime.sendMessage({ type: "REFRESH_SHORTCUTS" }).catch(() => {});
  } catch (e) {
    showMsg("shortcutListMsg", e.message || "ลบไม่สำเร็จ", true);
  }
}

async function init() {
  await loadStoredConfig();
  initSupabase();
  const user = await restoreSession();
  updateAuthUI(user);
  if (user) await loadShortcuts();

  $("saveConfig")?.addEventListener("click", saveConfig);
  $("btnLogin")?.addEventListener("click", login);
  $("btnLogout")?.addEventListener("click", logout);
  $("btnSaveShortcut")?.addEventListener("click", saveShortcut);
  $("btnCancelEdit")?.addEventListener("click", () => { cancelEdit(); showMsg("shortcutListMsg", "", false); });
}

init();
