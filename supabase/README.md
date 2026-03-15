# API คีย์ลัด บน Supabase

รัน API เป็น **Edge Function** เก็บข้อมูลใน **PostgreSQL** ของ Supabase

## โครงสร้าง

- **supabase/migrations/***.sql** — สร้างตาราง `sites`, `snippets` และข้อมูลเริ่มต้น
- **supabase/functions/api/index.ts** — Edge Function เดียวรับทุก route: `/site-map`, `/extension` (GET/POST/DELETE)

## ขั้นตอน

### 1. ติดตั้ง Supabase CLI

```bash
npm install -g supabase
supabase login
```

### 2. ลิงก์โปรเจกต์ (หรือสร้างใหม่)

```bash
cd c:\Users\ADMIN_JUN88\Desktop\okacehotkey
supabase link --project-ref YOUR_PROJECT_REF
```

(ถ้ายังไม่มีโปรเจกต์: สร้างที่ [supabase.com](https://supabase.com) แล้วเอา Project ref จาก Settings → General)

### 3. รัน Migration (สร้างตาราง)

```bash
supabase db push
```

หรือใช้ SQL ใน Dashboard: เปิด SQL Editor แล้ววางเนื้อหาจาก `migrations/20240315000000_initial.sql` แล้วรัน

### 4. Deploy Edge Function

```bash
supabase functions deploy api
```

จะได้ URL ประมาณ  
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/api`

### 5. ตั้งค่า Extension

- ใน **background.js**:  
  `const BASE = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/api";`
- ใน **manifest.json**:  
  `"host_permissions": ["https://YOUR_PROJECT_REF.supabase.co/*"]`

## หน้าจัดการคีย์ลัด (ไม่ hardcode)

เปิดไฟล์ **api/admin.html** ในเบราว์เซอร์ ใส่ที่อยู่ API เป็น URL ของ Edge Function เช่น  
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/api` กด "บันทึกแล้วโหลดใหม่" จะเพิ่ม/ลบไซต์และคีย์ลัดได้จากเว็บ

## ข้อมูลเริ่มต้น

หลังรัน migration จะมีไซต์ `default` และ snippet ตัวอย่าง 2 อัน (คำว่า "สวัสดี" และคีย์ลัด ctrl+shift+1) อยู่แล้ว

## หมายเหตุ

- Edge Function ใช้ **SUPABASE_SERVICE_ROLE_KEY** (ตั้งอัตโนมัติตอน deploy) เพื่ออ่าน/เขียนตาราง
- ถ้าอยากให้ extension เรียก REST ของ Supabase โดยตรง (ไม่ผ่าน Edge Function) ต้องตั้ง RLS และใช้ anon key ใน extension แทน
