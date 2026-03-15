-- ตารางไซต์ (id = siteId, name = ชื่อแสดง)
create table if not exists public.sites (
  id text primary key,
  name text not null default ''
);

-- ตาราง snippets (ตรงกับที่ extension ใช้: _id, site, shortcut, content)
create table if not exists public.snippets (
  _id text primary key,
  site text not null references public.sites(id) on delete cascade,
  shortcut text not null default '',
  content text not null default '',
  created_at timestamptz default now()
);

-- เปิด RLS แต่ให้ anon อ่าน/เขียนได้ (ถ้าใช้แค่จาก Edge Function ไม่ต้องเปิด anon)
-- ถ้าให้ extension เรียก REST โดยตรงต้องตั้ง RLS ให้ anon
alter table public.sites enable row level security;
alter table public.snippets enable row level security;

-- นโยบาย: ให้ service_role ใช้ได้เต็ม (Edge Function ใช้ service_role)
-- ถ้าอยากให้ anon เรียกจาก extension โดยตรง ให้สร้าง policy สำหรับ anon
create policy "Allow all for service role"
  on public.sites for all
  using (true)
  with check (true);

create policy "Allow all for service role"
  on public.snippets for all
  using (true)
  with check (true);

-- ข้อมูลเริ่มต้น
insert into public.sites (id, name) values ('default', 'ไซต์หลัก')
  on conflict (id) do update set name = excluded.name;

insert into public.snippets (_id, site, shortcut, content) values
  ('demo1', 'default', 'สวัสดี', 'สวัสดีครับ ยินดีต้อนรับ'),
  ('demo2', 'default', 'ctrl+shift+1', 'ข้อความจากคีย์ลัด Ctrl+Shift+1')
  on conflict (_id) do nothing;
