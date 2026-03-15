# Supabase Setup สำหรับ Chrome Extension คีย์ลัด

## 1. สร้างโปรเจกต์ Supabase

- ไปที่ [supabase.com](https://supabase.com) สร้างโปรเจกต์ใหม่
- จาก **Settings → API** คัดลอก:
  - **Project URL** (เช่น `https://xxxx.supabase.co`)
  - **anon public** key

## 2. รัน Migration (สร้างตาราง `shortcuts`)

ใน Supabase Dashboard เปิด **SQL Editor** แล้วรันไฟล์  
`supabase/migrations/20240316000000_shortcuts.sql`  
หรือวาง SQL ด้านล่างแล้ว Execute:

```sql
create table if not exists public.shortcuts (
  id uuid primary key default gen_random_uuid(),
  command_name text not null unique,
  shortcut_key text not null,
  action_text text not null default '',
  is_global boolean not null default true,
  created_at timestampz default now(),
  updated_at timestamptz default now()
);

alter table public.shortcuts enable row level security;

create policy "Allow read for authenticated"
  on public.shortcuts for select to authenticated using (true);

create policy "Allow all for authenticated"
  on public.shortcuts for all to authenticated using (true) with check (true);
```

## 3. เปิด Auth (Email/Password)

- **Authentication → Providers** เปิด **Email** และตั้ง Password ให้ user ได้
- (ถ้าใช้ Google) เปิด **Google** และตั้ง OAuth client ตาม docs

## 4. ตั้งค่าใน Extension

1. เปิด **Options** ของ extension (คลิกขวาที่ไอคอน → Options หรือจาก chrome://extensions)
2. ใส่ **Project URL** และ **Anon Key**
3. กด **บันทึก Config**
4. เข้าสู่ระบบด้วย **Email + Password** (หรือ Google ถ้าเปิดไว้)
5. จากนั้นจะเพิ่ม/แก้/ลบ shortcuts ได้ และ extension จะดึงจาก Supabase อัตโนมัติ

## 5. Chrome Commands (ตัวเลือก)

ใน manifest มีคำสั่ง `paste-1`, `paste-2`, `paste-3` (Ctrl+Shift+1/2/3)  
ถ้าในตาราง `shortcuts` มีแถวที่ `command_name` เป็น `paste-1`, `paste-2`, `paste-3` การกดคีย์ลัดจะ paste `action_text` ที่ cursor

## โครงสร้างตาราง `shortcuts`

| คอลัมน์        | ประเภท   | คำอธิบาย                          |
|----------------|----------|-----------------------------------|
| id             | uuid     | PK, สร้างอัตโนมัติ                |
| command_name   | text     | ชื่อคำสั่ง (เช่น greeting, paste-1) |
| shortcut_key   | text     | คำลัดหรือคีย์ลัด (เช่น สวัสดี, ctrl+shift+1) |
| action_text    | text     | ข้อความที่จะแทนที่เมื่อ trigger   |
| is_global      | boolean  | ใช้ได้ทุกหน้า (เก็บไว้ใช้ต่อ)     |
| created_at     | timestamptz |  |
| updated_at     | timestamptz |  |
