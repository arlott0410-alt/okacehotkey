-- โฟลเดอร์สำหรับจัดกลุ่มคีย์ลัด (เปิด/ปิดการใช้งานเป็นกลุ่มได้)
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.folders enable row level security;

create policy "Allow anon read folders"
  on public.folders for select to anon using (true);
create policy "Allow read folders authenticated"
  on public.folders for select to authenticated using (true);
create policy "Allow all folders authenticated"
  on public.folders for all to authenticated using (true) with check (true);

-- เพิ่มคอลัมน์ folder_id ใน shortcuts (nullable = อยู่โฟลเดอร์ "ทั่วไป")
alter table public.shortcuts
  add column if not exists folder_id uuid references public.folders(id) on delete set null;

create index if not exists idx_shortcuts_folder_id on public.shortcuts(folder_id);

drop trigger if exists folders_updated_at on public.folders;
create trigger folders_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();

