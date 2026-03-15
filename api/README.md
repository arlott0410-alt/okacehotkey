# API คีย์ลัด (สำหรับ Extension)

เซิร์ฟเวอร์ API เล็กๆ ใช้กับ Chrome Extension คีย์ลัด เก็บข้อมูลในไฟล์ `store.json` (ไม่ต้องใช้ DB)

## หน้าจัดการคีย์ลัด (ไม่ hardcode)

รัน `npm start` แล้วเปิดเบราว์เซอร์ไปที่ **http://localhost:3000/** จะได้หน้าเว็บสำหรับจัดการไซต์และคีย์ลัด (เพิ่ม/ลบ) โดยไม่ต้องแก้ไฟล์หรือ hardcode

- เลือกไซต์ → ดู/เพิ่ม/ลบ คีย์ลัดของไซต์นั้น
- เพิ่มไซต์ใหม่ได้จากฟอร์ม "เพิ่มไซต์"
- ไฟล์หน้าเว็บอยู่ที่ **api/admin.html** — เปิดไฟล์นี้ที่อื่นแล้วใส่ URL API ก็ใช้กับ Cloudflare/Supabase ได้

## Endpoints (ให้ Extension เรียก)

| Method | Path | คำอธิบาย |
|--------|------|----------|
| GET | `/api/site-map` | รายการไซต์ → `{ data: { "siteId": "ชื่อไซต์" } }` |
| GET | `/api/extension?site=<siteId>` | รายการ snippets ของไซต์ → `{ snippets: [ { _id, site, shortcut, content } ] }` |
| POST | `/api/extension` | เพิ่ม snippet → body: `{ site, shortcut, content }` |
| DELETE | `/api/extension/:id` | ลบ snippet ตาม _id |
| POST | `/api/sites` | เพิ่มไซต์ → body: `{ id, name }` (ใช้จากหน้าจัดการ) |

## วิธีรัน

```bash
cd api
npm install
npm start
```

จะรันที่ **http://localhost:3000** (หรือค่า `PORT` ที่ตั้งใน env)

## ข้อมูลเริ่มต้น

- ไฟล์ `store.json` มีไซต์ `default` และตัวอย่าง snippet 2 อัน
- แก้ไข `store.json` ได้โดยตรง หรือใช้ผ่าน Extension (popup เพิ่ม/ลบ snippet)

## Deploy ขึ้นเซิร์ฟเวอร์จริง

- อัปโหลดโฟลเดอร์ `api/` ไปรันบน VPS / Railway / Render ฯลฯ
- ตั้งค่า extension: ใน `background.js` เปลี่ยน `BASE` เป็น URL ของ API จริง และใน `manifest.json` ใส่ `host_permissions` ให้ตรงกับโดเมนนั้น
