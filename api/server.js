/**
 * API สำหรับ Extension คีย์ลัด
 * รองรับ: GET /api/site-map, GET /api/extension?site=, POST /api/extension, DELETE /api/extension/:id
 */
const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const STORE_PATH = path.join(__dirname, "store.json");

// อ่านข้อมูลจากไฟล์
function readStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return { sites: {}, snippets: [] };
  }
}

// เขียนข้อมูลลงไฟล์
function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

// สร้าง _id แบบสั้น
function nextId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

app.use(express.json());

// CORS: ให้ extension (chrome-extension://) และ localhost เรียกได้
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// หน้าเว็บจัดการคีย์ลัด (ไม่ hardcode)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// POST /api/sites → เพิ่มไซต์ (body: id, name)
app.post("/api/sites", (req, res) => {
  const { id, name } = req.body || {};
  if (!id || typeof id !== "string" || !id.trim()) {
    return res.status(400).json({ error: "Need id" });
  }
  const store = readStore();
  store.sites = store.sites || {};
  store.sites[id.trim()] = (name != null ? String(name) : id).trim();
  writeStore(store);
  res.status(201).json({ id: id.trim(), name: store.sites[id.trim()] });
});

// GET /api/site-map → รายการไซต์ (extension รับได้ทั้ง { data: { id: name } } หรือ [ { _id, name } ])
app.get("/api/site-map", (req, res) => {
  const store = readStore();
  res.json({ data: store.sites || {} });
});

// GET /api/extension?site=xxx → รายการ snippets ของไซต์นั้น (ต้องมีฟิลด์ snippets เป็น array)
app.get("/api/extension", (req, res) => {
  const site = req.query.site;
  if (!site) return res.status(400).json({ error: "Missing site" });
  const store = readStore();
  const list = (store.snippets || []).filter((s) => s.site === site);
  res.json({ snippets: list });
});

// POST /api/extension → เพิ่ม snippet (body: site, shortcut, content)
app.post("/api/extension", (req, res) => {
  const { site, shortcut, content } = req.body || {};
  if (!site || shortcut == null) {
    return res.status(400).json({ error: "Need site and shortcut" });
  }
  const store = readStore();
  const doc = {
    _id: nextId(),
    site,
    shortcut: String(shortcut).trim(),
    content: content != null ? String(content) : "",
  };
  store.snippets = store.snippets || [];
  store.snippets.push(doc);
  writeStore(store);
  res.status(201).json(doc);
});

// DELETE /api/extension/:id
app.delete("/api/extension/:id", (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Missing id" });
  const store = readStore();
  const before = (store.snippets || []).length;
  store.snippets = (store.snippets || []).filter((s) => s._id !== id);
  if (store.snippets.length === before) {
    return res.status(404).json({ error: "Snippet not found" });
  }
  writeStore(store);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`[API] คีย์ลัด server รันที่ http://localhost:${PORT}`);
  console.log(`[API] หน้าจัดการ: http://localhost:${PORT}/`);
  console.log(`[API] site-map: GET http://localhost:${PORT}/api/site-map`);
  console.log(`[API] snippets: GET http://localhost:${PORT}/api/extension?site=default`);
});
