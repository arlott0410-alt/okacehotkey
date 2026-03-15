-- ตาราง shortcuts สำหรับ Text Expansion (sync กับ Chrome Extension)
create table if not exists public.shortcuts (
  id uuid primary key default gen_random_uuid(),
  command_name text not null,
  shortcut_key text not null,
  action_text text not null default '',
  is_global boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(command_name)
);

-- RLS: anon อ่านได้ (extension โหลด shortcuts ได้แม้ยังไม่ login); authenticated เพิ่ม/แก้/ลบได้
alter table public.shortcuts enable row level security;

create policy "Allow anon read"
  on public.shortcuts for select
  to anon
  using (true);

create policy "Allow read for authenticated"
  on public.shortcuts for select
  to authenticated
  using (true);

create policy "Allow all for authenticated"
  on public.shortcuts for all
  to authenticated
  using (true)
  with check (true);

-- ตัวอย่างข้อมูล (ลบได้)
insert into public.shortcuts (command_name, shortcut_key, action_text, is_global) values
  ('paste-1', 'ctrl+shift+1', 'ข้อความจาก shortcut 1', true),
  ('paste-2', 'ctrl+shift+2', 'ข้อความจาก shortcut 2', true),
  ('greeting', 'สวัสดี', 'สวัสดีครับ ยินดีต้อนรับ', true)
on conflict (command_name) do nothing;

-- trigger อัปเดต updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists shortcuts_updated_at on public.shortcuts;
create trigger shortcuts_updated_at
  before update on public.shortcuts
  for each row execute function public.set_updated_at();
