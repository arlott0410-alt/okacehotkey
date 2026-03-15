// Supabase Edge Function: API คีย์ลัด (route ตาม path หลัง /api/)
import "jsr:@supabase/functions-js/edge_runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: object, status = 200) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const url = new URL(req.url);
  const pathname = url.pathname;
  // pathname = /functions/v1/api/site-map หรือ /functions/v1/api/extension
  const path = pathname.includes("/api/") ? pathname.split("/api/")[1] || "" : pathname.replace(/^\/+/, "");
  const segs = path.split("/").filter(Boolean);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // POST .../api/sites → เพิ่มไซต์ (body: id, name)
    if (req.method === "POST" && (segs[0] === "sites" || path === "sites")) {
      const body = await req.json().catch(() => ({}));
      const id = body.id != null ? String(body.id).trim() : "";
      if (!id) return json({ error: "Need id" }, 400);
      const name = (body.name != null ? String(body.name) : id).trim();
      const { error } = await supabase.from("sites").upsert({ id, name }, { onConflict: "id" });
      if (error) return json({ error: error.message }, 500);
      return json({ id, name }, 201);
    }

    // GET .../api/site-map
    if (req.method === "GET" && (segs[0] === "site-map" || path === "site-map")) {
      const { data: rows, error } = await supabase.from("sites").select("id, name");
      if (error) return json({ error: error.message }, 500);
      const data: Record<string, string> = {};
      for (const r of rows || []) data[r.id] = r.name ?? "";
      return json({ data });
    }

    // GET .../api/extension?site=xxx
    if (req.method === "GET" && (segs[0] === "extension" || path === "extension")) {
      const site = url.searchParams.get("site");
      if (!site) return json({ error: "Missing site" }, 400);
      const { data: list, error } = await supabase.from("snippets").select("_id, site, shortcut, content").eq("site", site);
      if (error) return json({ error: error.message }, 500);
      return json({ snippets: list ?? [] });
    }

    // POST .../api/extension
    if (req.method === "POST" && (segs[0] === "extension" || path === "extension")) {
      const body = await req.json().catch(() => ({}));
      const { site, shortcut, content } = body;
      if (!site || shortcut == null) return json({ error: "Need site and shortcut" }, 400);
      const doc = {
        _id: nextId(),
        site,
        shortcut: String(shortcut).trim(),
        content: content != null ? String(content) : "",
      };
      const { data: inserted, error } = await supabase.from("snippets").insert(doc).select().single();
      if (error) return json({ error: error.message }, 500);
      return json(inserted, 201);
    }

    // DELETE .../api/extension/:id
    if (req.method === "DELETE" && segs[0] === "extension" && segs[1]) {
      const id = decodeURIComponent(segs[1]);
      const { data: existing } = await supabase.from("snippets").select("_id").eq("_id", id).maybeSingle();
      if (!existing) return json({ error: "Snippet not found" }, 404);
      const { error } = await supabase.from("snippets").delete().eq("_id", id);
      if (error) return json({ error: error.message }, 500);
      return empty(204);
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
