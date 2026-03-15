# ขั้นตอน Deploy และการใช้งาน – คีย์ลัด (Text Expansion)

คู่มือนี้รวม **การ deploy** (Supabase + Chrome Extension) และ **การใช้งาน** (ตั้งค่า, login, ใช้คำลัด) ไว้ในที่เดียว

---

## ส่วนที่ 1: Deploy (ทำครั้งเดียว)

### ขั้น 1 – สร้างโปรเจกต์ Supabase

1. ไปที่ **[app.supabase.com](https://app.supabase.com)** → **New project**
2. ตั้งชื่อโปรเจกต์ เลือก Region (เช่น Singapore) ใส่รหัสผ่าน Database
3. รอสร้างโปรเจกต์เสร็จ

### ขั้น 2 – สร้างตาราง shortcuts

1. ในโปรเจกต์ → ไปที่ **SQL Editor** → **New query**
2. เปิดไฟล์ **`supabase/migrations/20240316000000_shortcuts.sql`** ในเครื่อง
3. Copy เนื้อหาทั้งหมดไปวางใน SQL Editor → กด **Run**
4. ตรวจใน **Table Editor** ว่ามีตาราง **shortcuts** และมีข้อมูลตัวอย่าง (ถ้ามีใน migration)

### ขั้น 3 – คัดลอก URL และ Anon Key

1. ไปที่ **Project Settings** (ไอคอนฟันเฟือง) → **API**
2. คัดลอกเก็บไว้:
   - **Project URL** (เช่น `https://xxxx.supabase.co`)
   - **anon public** (key ยาวขึ้นต้นด้วย `eyJ...`)

### ขั้น 4 – เปิดการล็อกอิน (Auth)

1. ไปที่ **Authentication** → **Providers**
2. เปิด **Email** (Enable)
3. (ถ้าต้องการ) เปิด **Google** แล้วตั้ง OAuth ตามคู่มือ Supabase

### ขั้น 5 – สร้าง user คนแรก (สำหรับ login ใน extension)

1. ไปที่ **Authentication** → **Users** → **Add user**
2. ใส่ **Email** และ **Password** (ใช้ login ใน Options ของ extension)

### ขั้น 6 – โหลด Extension ใน Chrome

1. เปิด Chrome → ไปที่ **`chrome://extensions/`**
2. เปิด **Developer mode** (สวิตช์มุมขวาบน)
3. กด **Load unpacked**
4. **เลือกโฟลเดอร์ `extension`** ในโปรเจกต์นี้ (โฟลเดอร์ที่มี `manifest.json` อยู่ข้างใน)
5. จะเห็น extension โผล่ในรายการ (ใช้ไอคอน default ของ Chrome ถ้าไม่ได้ใส่ไอคอนเอง)

---

## ส่วนที่ 2: ตั้งค่า Extension (ครั้งแรกหลังโหลด)

### ขั้น 7 – ใส่ Supabase URL และ Anon Key

1. ที่ **chrome://extensions/** กด **Details** ของ extension คีย์ลัด
2. กด **Extension options** (หรือคลิกขวาที่ไอคอน extension → **Options**)
3. ในช่อง **Project URL** ใส่ URL จากขั้น 3 (เช่น `https://xxxx.supabase.co`)
4. ในช่อง **Anon Key** ใส่ anon key จากขั้น 3
5. กด **บันทึก Config**

### ขั้น 8 – Login ใน Options

1. ในหน้า Options เดิม ใส่ **Email** และ **Password** ของ user ที่สร้างในขั้น 5
2. กด **เข้าสู่ระบบ**
3. ถ้าสำเร็จ จะเห็นฟอร์ม **จัดการ Shortcuts** และตารางรายการ (อาจว่างหรือมีตัวอย่าง)

---

## ส่วนที่ 3: การใช้งาน

### สำหรับ Admin – จัดการ Shortcuts

1. เปิด **Options** ของ extension (คลิกขวาที่ไอคอน → Options)
2. หลัง login แล้ว:
   - **เพิ่ม:** ใส่ Command name, Shortcut key, Action text → กด **บันทึก**
   - **แก้ไข:** กด **แก้ไข** ที่แถวที่ต้องการ แก้แล้วกด **บันทึก**
   - **ลบ:** กด **ลบ** ที่แถวที่ต้องการ
3. ข้อมูลจะบันทึกไปที่ Supabase ทันที และ extension จะดึงข้อมูลใหม่ (มี cache สั้นๆ)

### สำหรับผู้ใช้ – ใช้คำลัดบนเว็บ

- **แบบพิมพ์คำลัด:** ไปที่ช่องพิมพ์ข้อความ (input/textarea) บนเว็บใดก็ได้ → พิมพ์ **คำลัด** ที่ตั้งไว้ (เช่น `สวัสดี`) ตามด้วย space หรือจบคำ → ข้อความจะถูกแทนที่ด้วย **Action text** ที่ตั้งไว้ และมี confetti
- **แบบกดคีย์ลัด:** ถ้ามี shortcut ที่เป็นคีย์ลัด (เช่น `ctrl+shift+1`) ให้กดคีย์ลัดที่ช่องพิมพ์ → ข้อความจะถูก paste ที่ cursor
- **Chrome Commands:** ถ้าในตารางมี `command_name` เป็น `paste-1`, `paste-2`, `paste-3` การกด **Ctrl+Shift+1 / 2 / 3** จะ paste ข้อความของ shortcut นั้น

### Popup

- คลิกไอคอน extension → จะเปิด popup มีลิงก์ **เปิดตั้งค่า (Options)** สำหรับเข้า Options ได้เร็ว

---

## สรุป Checklist

| ลำดับ | รายการ | สถานะ |
|--------|--------|--------|
| 1 | สร้างโปรเจกต์ Supabase | ☐ |
| 2 | รัน migration สร้างตาราง `shortcuts` | ☐ |
| 3 | คัดลอก Project URL + anon key | ☐ |
| 4 | เปิด Auth (Email / Google) | ☐ |
| 5 | สร้าง user สำหรับ login | ☐ |
| 6 | โหลด extension จากโฟลเดอร์ `extension` | ☐ |
| 7 | ใส่ URL + Anon Key ใน Options → บันทึก Config | ☐ |
| 8 | Login ใน Options | ☐ |
| 9 | เพิ่ม shortcut อย่างน้อย 1 อัน แล้วทดสอบบนเว็บ | ☐ |

---

## แจกจ่ายให้ทีม

- **แบบไม่ผ่าน Store:** แชร์โฟลเดอร์ **extension/** (zip หรือ Drive) ให้ทีม → แต่ละคนไป **chrome://extensions** → Load unpacked → เลือกโฟลเดอร์ extension → เปิด Options ใส่ **Project URL + Anon Key** ครั้งเดียว (ค่าตรงกันทั้งบริษัท) → ไม่จำเป็นต้อง login ถ้าไม่ต้องแก้ shortcuts (อ่าน shortcuts ใช้แค่ anon key)
- **แบบผ่าน Chrome Web Store:** บีบโฟลเดอร์ **extension/** เป็น zip → อัปโหลดที่ [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) → ตั้งเป็น Private/Unlisted แล้วแจกลิงก์หรือใช้ Chrome Admin บังคับติดตั้ง

---

## หมายเหตุ

- **Anon key** ใช้สำหรับอ่าน shortcuts ได้แม้ไม่ login (RLS อนุญาต anon อ่าน) การ login ใช้เมื่อจะ **เพิ่ม/แก้/ลบ** shortcuts ใน Options
- Session / รหัสผ่าน เก็บใน **chrome.storage.local** ของเครื่องผู้ใช้ ไม่ส่งไปที่อื่นนอกจาก Supabase
