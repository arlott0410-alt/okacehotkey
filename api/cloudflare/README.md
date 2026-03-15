# API คีย์ลัด บน Cloudflare Workers (KV)

รัน API บน Cloudflare Workers เก็บข้อมูลใน KV — ไม่ต้องมีเซิร์ฟเวอร์ รันที่ edge ได้ทั่วโลก

## ขั้นตอน

### 1. ติดตั้ง Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. สร้าง KV Namespace

```bash
cd api/cloudflare
wrangler kv:namespace create "STORE"
```

จะได้ `id` มา (เช่น `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`) เอาไปใส่ใน `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "STORE"
id = "ใส่_id_ที่ได้ตรงนี้"
```

### 3. Deploy

```bash
wrangler deploy
```

จะได้ URL เช่น `https://okacehotkey-api.<your-subdomain>.workers.dev`

### 4. ตั้งค่า Extension

- ใน **background.js**: ตั้ง  
  `const BASE = "https://okacehotkey-api.<your-subdomain>.workers.dev/api";`
- ใน **manifest.json**: ใส่  
  `"host_permissions": ["https://okacehotkey-api.<your-subdomain>.workers.dev/*"]`

## หน้าจัดการคีย์ลัด (ไม่ hardcode)

เปิดไฟล์ **api/admin.html** ในเบราว์เซอร์ แล้วในช่อง "ที่อยู่ API" ใส่ URL ของ Worker เช่น  
`https://okacehotkey-api.<subdomain>.workers.dev/api` กด "บันทึกแล้วโหลดใหม่" จากนั้นเพิ่มไซต์/คีย์ลัดได้จากเว็บ ไม่ต้องแก้โค้ด

(ถ้าใช้ API แบบ Node รันที่ localhost ให้เปิด **http://localhost:3000/** จะได้หน้าเดียวกัน)

## ใส่ข้อมูลเริ่มต้น (ถ้าต้องการ)

หลัง deploy แล้ว ใช้คำสั่งใส่ค่าเริ่มต้นลง KV (รันครั้งเดียว):

```bash
wrangler kv:key put --binding=STORE "data" '{"sites":{"default":"ไซต์หลัก"},"snippets":[{"_id":"demo1","site":"default","shortcut":"สวัสดี","content":"สวัสดีครับ ยินดีต้อนรับ"}]}'
```

หรือเพิ่มผ่าน popup ของ extension หลังโหลดแล้วก็ได้
