-- เพิ่ม sort_order สำหรับจัดเรียงคำลัด (ลากวางได้)
alter table public.shortcuts
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_shortcuts_folder_sort on public.shortcuts(folder_id, sort_order);
