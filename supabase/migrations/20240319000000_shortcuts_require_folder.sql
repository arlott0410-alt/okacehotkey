-- บังคับให้ทุกคำลัดต้องอยู่ในโฟลเดอร์ (folder_id ไม่เป็น null)
-- 1) สร้างโฟลเดอร์ "ทั่วไป" ถ้ายังไม่มี
insert into public.folders (id, name, sort_order)
select gen_random_uuid(), 'ทั่วไป', -1
where not exists (select 1 from public.folders where name = 'ทั่วไป' limit 1);

-- 2) ย้ายคำลัดที่ไม่มีโฟลเดอร์ไปอยู่โฟลเดอร์ "ทั่วไป"
update public.shortcuts s
set folder_id = (select id from public.folders where name = 'ทั่วไป' limit 1)
where s.folder_id is null;

-- 3) บังคับให้ folder_id ไม่เป็น null
alter table public.shortcuts
  alter column folder_id set not null;

-- 4) เปลี่ยน FK เป็น on delete restrict (ห้ามลบโฟลเดอร์ที่ยังมีคำลัด)
alter table public.shortcuts
  drop constraint if exists shortcuts_folder_id_fkey;
alter table public.shortcuts
  add constraint shortcuts_folder_id_fkey
  foreign key (folder_id) references public.folders(id) on delete restrict;
