-- เพิ่มคอลัมน์เก็บข้อมูลเสริมจาก OCR เพื่อ query ได้ตรงๆ (เดิมเก็บใน ocr_raw)
ALTER TABLE slips
  ADD COLUMN IF NOT EXISTS fee              NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS sender_account   TEXT,
  ADD COLUMN IF NOT EXISTS receiver_account TEXT;
