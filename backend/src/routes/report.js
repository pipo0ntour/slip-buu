import express from 'express'
import { supabase } from '../services/supabase.js'
import { computeRange } from '../services/period.js'
import { attachSignedImageUrls } from '../services/storage.js'

const router = express.Router()

router.get('/', async (req, res) => {
  const { period = 'daily', date } = req.query
  const lineUserId = req.lineUser.userId

  // ขอบเขตช่วงเวลาตามปฏิทินไทย — logic อยู่ใน period.js (มีเทสคุม)
  // ?date=YYYY-MM-DD = วันอ้างอิงสำหรับดูย้อนหลัง, ไม่ส่ง = วันนี้
  const { fromIso, toIso } = computeRange(period, date)

  // ชุดคอลัมน์ตามรุ่น migration — ลองครบสุดก่อนแล้ว "ถอยทีละขั้น" ห้ามข้ามขั้น:
  // DB ที่มีถึง 003 ยังมี type/category ครบ ถ้าถอยไปชุดเก่าสุดเลย ทุกรายการจะถูกตีเป็นรายรับ
  const COLS_004 =
    'id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, image_path, created_at, fee, sender_account, receiver_account, note, category, type, source'
  const COLS_003 =
    'id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, created_at, fee, sender_account, receiver_account, note, category, type, source'
  const COLS_BASE =
    'id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, created_at'

  // นับยอดตาม "วันที่บันทึก" (created_at = วันที่กดอัป/สร้างรายการ)
  // → อัปวันนี้จะอยู่ใน "วันนี้" เสมอ และไม่มีรายการหายแม้ OCR อ่านวันที่บนสลิปผิด
  const querySlips = (cols) =>
    supabase
      .from('slips')
      .select(cols)
      .eq('line_user_id', lineUserId)
      .eq('status', 'success')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: false })

  let slips, error
  for (const cols of [COLS_004, COLS_003, COLS_BASE]) {
    ;({ data: slips, error } = await querySlips(cols))
    if (!error || !/column|could not find|schema cache/i.test(error.message)) break
  }

  if (error) {
    return res.status(500).json({ error: 'Database error' })
  }

  // บักเก็ตรูปเป็น private — แปลง image_url เป็น signed URL อายุจำกัดก่อนส่งให้ client
  await attachSignedImageUrls(slips)

  // แยกรายรับ/รายจ่ายตาม type (รายการที่ไม่มี type เช่นก่อน migrate = นับเป็นรายรับ)
  const totalIncome = slips
    .filter((s) => s.type !== 'expense')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
  const totalExpense = slips
    .filter((s) => s.type === 'expense')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)

  res.json({
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    totalAmount: totalIncome, // backward compat (เดิม = ยอดรวมรายรับ)
    count: slips.length,
    slips,
  })
})

export default router
