-- ========================================
-- Slip-BUU — Supabase Schema
-- วิธีใช้: Copy ทั้งหมดไปวางใน SQL Editor ของ Supabase แล้วกด Run
-- ========================================

-- ตาราง users
CREATE TABLE IF NOT EXISTS users (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  picture_url  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ตาราง slips
CREATE TABLE IF NOT EXISTS slips (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id   TEXT NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  amount         NUMERIC(12, 2),
  sender_name    TEXT,
  receiver_name  TEXT,
  bank_name      TEXT,
  reference_no   TEXT,
  transaction_at TIMESTAMPTZ,
  image_url      TEXT,
  image_hash     TEXT UNIQUE,
  ocr_raw        JSONB,
  fee              NUMERIC(12, 2),
  sender_account   TEXT,
  receiver_account TEXT,
  note           TEXT,
  category       TEXT,
  type           TEXT NOT NULL DEFAULT 'income',   -- 'income' รายรับ | 'expense' รายจ่าย
  source         TEXT NOT NULL DEFAULT 'slip',      -- 'slip' จาก OCR | 'manual' สร้างเอง
  status         TEXT DEFAULT 'success' CHECK (status IN ('success', 'duplicate', 'failed')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes สำหรับ query performance
CREATE INDEX IF NOT EXISTS idx_slips_line_user_id   ON slips(line_user_id);
CREATE INDEX IF NOT EXISTS idx_slips_transaction_at ON slips(transaction_at);
CREATE INDEX IF NOT EXISTS idx_slips_created_at     ON slips(created_at);

-- ========================================
-- Supabase Storage
-- ทำใน Dashboard: Storage → New bucket → ชื่อ "slips" → Public bucket
-- ========================================

-- ========================================
-- Row Level Security (RLS)
-- Backend ใช้ service key ซึ่ง bypass RLS ได้อยู่แล้ว
-- เปิดไว้เพื่อป้องกัน anon access จาก client โดยตรง
-- ========================================
ALTER TABLE slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ไม่สร้าง policy → anon/authenticated ไม่สามารถ access ได้
-- เฉพาะ service_role เท่านั้นที่เข้าถึงได้ (backend)
