import express from 'express'
import { supabase } from '../services/supabase.js'
import { computeRange, computePreviousRange } from '../services/period.js'
import { storagePathOf } from '../services/storage.js'

const router = express.Router()

// คีย์แทน "ไม่ระบุหมวด" — แยกออกจากหมวด 'อื่นๆ' ที่ผู้ใช้ติดป้ายเอง (frontend ใช้ค่าเดียวกัน)
const NO_CATEGORY = '__none__'

// รวมยอดรายจ่ายแยกตามหมวด → { [category|__none__]: amount } ใช้เทียบช่วงก่อนหน้า
function expenseByCategory(rows) {
  const map = {}
  for (const s of rows || []) {
    if (s.type !== 'expense') continue
    const amount = Number(s.amount) || 0
    if (amount <= 0) continue
    const key = s.category || NO_CATEGORY
    map[key] = (map[key] || 0) + amount
  }
  return map
}

router.get('/', async (req, res) => {
  const { period = 'daily', date } = req.query
  const lineUserId = req.lineUser.userId

  // ขอบเขตช่วงเวลาตามปฏิทินไทย — logic อยู่ใน period.js (มีเทสคุม)
  // ?date=YYYY-MM-DD = วันอ้างอิงสำหรับดูย้อนหลัง, ไม่ส่ง = วันนี้
  const { fromIso, toIso } = computeRange(period, date)
  const prev = computePreviousRange(period, date)

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

  // รูปสลิปขอแบบ lazy (ดูทีละใบตอนเปิด modal) → ไม่ออก signed URL ให้ทุกใบที่นี่
  // เพราะ "รายปี" อาจมีหลายร้อยใบ การ sign ทุกใบทั้งที่ดูไม่กี่ใบทำให้รายงานช้า/เปลือง
  // ส่งแค่ has_image บอกว่ามีรูปไหม แล้วถอด path/url ดิบทิ้ง (กันลิงก์รูป private หลุด)
  for (const s of slips) {
    s.has_image = !!storagePathOf(s)
    delete s.image_url
    delete s.image_path
  }

  // ยอดรายจ่ายแยกหมวดของ"ช่วงก่อนหน้า" — ใช้โชว์ลูกศรเทียบ trend ในหน้ารายงาน
  // (ช่วงปัจจุบันให้ frontend คำนวณเองจาก slips เพื่อให้อัปเดตทันทีหลังแก้/ลบรายการ)
  // ดึงเฉพาะ amount/category/type ของรายจ่าย ถ้า DB เก่ายังไม่มีคอลัมน์ → ข้าม (ไม่มีลูกศร)
  let prevExpenseByCategory = {}
  const { data: prevRows, error: prevErr } = await supabase
    .from('slips')
    .select('amount, category, type')
    .eq('line_user_id', lineUserId)
    .eq('status', 'success')
    .eq('type', 'expense')
    .gte('created_at', prev.fromIso)
    .lt('created_at', prev.toIso)
  if (!prevErr) prevExpenseByCategory = expenseByCategory(prevRows)

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
    prevExpenseByCategory,
    slips,
  })
})

export default router
