-- รองรับการโน้ตในแต่ละรายการ + สร้างรายการธุรกรรมเอง (รายรับ/จ่าย) ที่ไม่มีสลิป
-- - note/category : ระบุว่า "ค่าอะไร" (note = พิมพ์อิสระ, category = หมวดลัด)
-- - type          : 'income' = รายรับ | 'expense' = รายจ่าย (แถวเดิม = รายรับ)
-- - source        : 'slip' = มาจาก OCR | 'manual' = ผู้ใช้สร้างเอง (แถวเดิม = slip)
ALTER TABLE slips
  ADD COLUMN IF NOT EXISTS note     TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS type     TEXT NOT NULL DEFAULT 'income',
  ADD COLUMN IF NOT EXISTS source   TEXT NOT NULL DEFAULT 'slip';
