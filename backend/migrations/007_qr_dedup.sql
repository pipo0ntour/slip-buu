-- เก็บ payload ของ QR บนสลิป (อ่าน on-device ฝั่ง client ด้วย jsQR) ไว้กันสลิปซ้ำแบบแม่น + ฟรี
-- QR บนสลิปไทยเป็น QR สำหรับ "ตรวจสลิป" ซึ่งไม่ซ้ำกันต่อธุรกรรม → ใช้เป็นกุญแจเช็คซ้ำได้ตรงกว่า
-- image hash (จับเคส "ถ่าย/ครอปสลิปเดิมใหม่" ได้ด้วย) และทำให้ backend ข้าม OCR (Gemini) ได้ถ้าซ้ำ
--
-- ปลอดภัยถ้ารันก่อน deploy: โค้ดมี fallback (checkByQr คืน null + insert ถอยชุดคอลัมน์) ถ้าคอลัมน์ยังไม่มา
ALTER TABLE slips ADD COLUMN IF NOT EXISTS qr_ref TEXT;

-- ช่วยให้เช็คซ้ำเร็ว — scope ต่อผู้ใช้ + เฉพาะแถวที่มี QR
CREATE INDEX IF NOT EXISTS idx_slips_qr_ref ON slips (line_user_id, qr_ref) WHERE qr_ref IS NOT NULL;
