-- ห้ามคำลัดซ้ำกัน (ใช้ตัวแรกที่ตรงเท่านั้น) – บังคับให้ shortcut_key ไม่ซ้ำทั้งระบบ (ไม่สนใจตัวพิมพ์)
-- ถ้ามีข้อมูลซ้ำอยู่แล้ว ให้แก้ใน Options ก่อน แล้วค่อยรัน migration นี้
create unique index if not exists idx_shortcuts_shortcut_key_lower
  on public.shortcuts (lower(trim(shortcut_key)));
