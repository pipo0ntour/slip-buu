-- แก้ unique ของ image_hash จาก "ระดับทั้งตาราง" เป็น "ต่อผู้ใช้"
--
-- ปัญหาเดิม: schema กำหนด image_hash TEXT UNIQUE (ข้ามผู้ใช้ทุกคน) แต่ logic เช็คซ้ำ (duplicate.js)
--   ตั้งใจ scope ต่อผู้ใช้ — สลิปใบเดียวกันที่ทั้ง "คนโอน" และ "คนรับ" ต่างคนต่างบันทึก ไม่ถือว่าซ้ำ
--   ผลคือคนที่บันทึกทีหลังชน unique เดิม insert พัง ("บันทึกข้อมูลไม่สำเร็จ" ทั้งที่ไม่ควร)
--   และเปิดช่องให้คนอื่น "จอง hash" บล็อกการบันทึกของเราได้
--
-- ปลอดภัยถ้ารันก่อน/หลัง deploy โค้ดใหม่: โค้ดเช็คซ้ำต่อผู้ใช้อยู่แล้ว การผ่อน unique ไม่กระทบ logic เดิม

-- ชื่อ constraint อัตโนมัติจาก image_hash TEXT UNIQUE ใน schema.sql
ALTER TABLE slips DROP CONSTRAINT IF EXISTS slips_image_hash_key;
-- เผื่อบางเครื่องสร้างเป็น unique index เดี่ยว ๆ แทน constraint
DROP INDEX IF EXISTS slips_image_hash_key;

-- unique ใหม่: ต่อผู้ใช้ + เฉพาะแถวที่มี hash (partial index — แถว manual/note ที่ไม่มีรูปไม่ต้องเข้า index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_slips_user_image_hash
  ON slips (line_user_id, image_hash)
  WHERE image_hash IS NOT NULL;
