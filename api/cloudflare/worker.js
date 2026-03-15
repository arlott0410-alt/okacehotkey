/**
 * Cloudflare Worker สำหรับ API คีย์ลัด (ใช้ KV เก็บข้อมูล)
 * Endpoints: GET/POST/DELETE เหมือน server.js
 */
const KV_KEY = "data";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function empty(status = 204) {
  return new Response(null, { status, headers: cors });
}

function nextId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "").replace(/^\/api/, "") || "/";
    const segs = path.split("/").filter(Boolean);

    try {
      // POST /api/sites → เพิ่มไซต์ (body: id, name)
      if (request.method === "POST" && (segs[0] === "sites" || path === "/sites")) {
        const body = await request.json().catch(() => ({}));
        const id = body.id != null ? String(body.id).trim() : "";
        if (!id) return json({ error: "Need id" }, 400);
        const store = await getStore(env);
        store.sites = store.sites || {};
        store.sites[id] = (body.name != null ? String(body.name) : id).trim();
        await setStore(env, store);
        return json({ id, name: store.sites[id] }, 201);
      }

      // GET /api/site-map
      if (request.method === "GET" && (segs[0] === "site-map" || path === "/site-map")) {
        const store = await getStore(env);
        return json({ data: store.sites || {} });
      }

      // GET /api/extension?site=xxx
      if (request.method === "GET" && (segs[0] === "extension" || path === "/extension")) {
        const site = url.searchParams.get("site");
        if (!site) return json({ error: "Missing site" }, 400);
        const store = await getStore(env);
        const list = (store.snippets || []).filter((s) => s.site === site);
        return json({ snippets: list });
      }

      // POST /api/extension
      if (request.method === "POST" && (segs[0] === "extension" || path === "/extension")) {
        const body = await request.json().catch(() => ({}));
        const { site, shortcut, content } = body;
        if (!site || shortcut == null) return json({ error: "Need site and shortcut" }, 400);
        const store = await getStore(env);
        const doc = {
          _id: nextId(),
          site,
          shortcut: String(shortcut).trim(),
          content: content != null ? String(content) : "",
        };
        store.snippets = store.snippets || [];
        store.snippets.push(doc);
        await setStore(env, store);
        return json(doc, 201);
      }

      // DELETE /api/extension/:id
      if (request.method === "DELETE" && segs[0] === "extension" && segs[1]) {
        const id = decodeURIComponent(segs[1]);
        const store = await getStore(env);
        const len = (store.snippets || []).length;
        store.snippets = (store.snippets || []).filter((s) => s._id !== id);
        if (store.snippets.length === len) return json({ error: "Snippet not found" }, 404);
        await setStore(env, store);
        return empty(204);
      }

      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  },
};

async function getStore(env) {
  const raw = await env.STORE.get(KV_KEY);
  if (!raw) return { sites: { default: "ไซต์หลัก" }, snippets: [] };
  return JSON.parse(raw);
}

async function setStore(env, data) {
  await env.STORE.put(KV_KEY, JSON.stringify(data));
}
