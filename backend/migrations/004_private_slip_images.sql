-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️ LEGACY (เลิกใช้แล้ว) — ปัจจุบัน "ไม่เก็บรูปสลิป" แล้ว (ทั้ง bucket "slips" + คอลัมน์ image_url/image_path)
--   คงไว้เป็นประวัติ/เพื่อความเข้ากันได้กับ DB ที่รันอยู่ — DB ใหม่ข้ามได้เลย ไม่ต้องสร้าง bucket "slips"
-- ═══════════════════════════════════════════════════════════════════════
--
-- (เดิม) ปิดรูปสลิปไม่ให้เปิดดูได้ด้วยลิงก์เปล่า ๆ (รูปมีชื่อคน/เลขบัญชีบางส่วน)
-- แนวทาง: เก็บ "path" ของไฟล์ใน DB แล้วให้ backend ออก signed URL อายุจำกัดตอนอ่าน
--
-- ⚠️ ลำดับการใช้งาน: deploy backend เวอร์ชันใหม่ก่อน แล้วค่อยรันไฟล์นี้ทั้งไฟล์
--    (ถ้ารันข้อ 3 ก่อน deploy รูปเก่าจะเปิดไม่ขึ้นจนกว่า backend ใหม่จะออนไลน์)

-- 1) คอลัมน์เก็บ path ของไฟล์ในบักเก็ต slips
ALTER TABLE slips ADD COLUMN IF NOT EXISTS image_path TEXT;

-- 2) แถวเก่า: ดึง path ออกจาก public URL ที่เคยเก็บไว้ใน image_url
UPDATE slips
SET image_path = regexp_replace(image_url, '^.*/object/public/slips/', '')
WHERE image_path IS NULL
  AND image_url LIKE '%/object/public/slips/%';

-- 3) ปิดบักเก็ตเป็น private — ลิงก์ public เดิมจะใช้ไม่ได้ทันที (backend ใหม่ใช้ signed URL แทน)
UPDATE storage.buckets SET public = false WHERE id = 'slips';
