import express from 'express'
import { supabase } from '../services/supabase.js'

const router = express.Router()

router.get('/', async (req, res) => {
  const { period = 'daily', date } = req.query
  const lineUserId = req.lineUser.userId

  // คำนวณขอบเขตช่วงเวลาตามโซนเวลาไทย (Asia/Bangkok, +07:00) ไม่ใช่เวลา server (Railway = UTC)
  const TZ_OFFSET_MS = 7 * 60 * 60 * 1000

  // วันอ้างอิง: ถ้าส่ง ?date=YYYY-MM-DD มา (วันที่ตามปฏิทินไทย) ใช้ดูย้อนหลังได้ — ไม่ส่ง = วันนี้
  let y, mo, d
  const anchor = typeof date === 'string' && date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (anchor) {
    y = Number(anchor[1])
    mo = Number(anchor[2]) - 1
    d = Number(anchor[3])
  } else {
    const nowBkk = new Date(Date.now() + TZ_OFFSET_MS) // ฟิลด์ UTC ของตัวนี้ = เวลาไทยจริง
    y = nowBkk.getUTCFullYear()
    mo = nowBkk.getUTCMonth()
    d = nowBkk.getUTCDate()
  }

  // ช่วงเวลามีทั้งขอบล่าง (start) และขอบบน (end) → ดูช่วงไหนก็ได้ ไม่ใช่แค่ "ถึงปัจจุบัน"
  // Date.UTC จัดการ overflow ให้เอง (เช่น d+1 ข้ามเดือน, mo+1 ข้ามปี)
  let startWallclock, endWallclock
  if (period === 'daily') {
    startWallclock = Date.UTC(y, mo, d)
    endWallclock = Date.UTC(y, mo, d + 1)
  } else if (period === 'monthly') {
    startWallclock = Date.UTC(y, mo, 1)
    endWallclock = Date.UTC(y, mo + 1, 1)
  } else {
    startWallclock = Date.UTC(y, 0, 1)
    endWallclock = Date.UTC(y + 1, 0, 1)
  }
  // แปลงเที่ยงคืนเวลาไทยกลับเป็น instant จริง (UTC) เพื่อเทียบกับ created_at
  const fromDate = new Date(startWallclock - TZ_OFFSET_MS)
  const toDate = new Date(endWallclock - TZ_OFFSET_MS)

  // คอลัมน์เต็ม (รวมข้อมูลสำหรับหน้ารายละเอียด) — ถ้า DB ยังไม่ migrate คอลัมน์ใหม่ จะ fallback อัตโนมัติ
  const FULL_COLS =
    'id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, created_at, fee, sender_account, receiver_account, note, category, type, source'
  const BASE_COLS =
    'id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, created_at'

  // นับยอดตาม "วันที่บันทึก" (created_at = วันที่กดอัป/สร้างรายการ)
  // → อัปวันนี้จะอยู่ใน "วันนี้" เสมอ และไม่มีรายการหายแม้ OCR อ่านวันที่บนสลิปผิด
  const fromIso = fromDate.toISOString()
  const toIso = toDate.toISOString()
  const querySlips = (cols) =>
    supabase
      .from('slips')
      .select(cols)
      .eq('line_user_id', lineUserId)
      .eq('status', 'success')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: false })

  let { data: slips, error } = await querySlips(FULL_COLS)
  if (error && /column|could not find|schema cache/i.test(error.message)) {
    ;({ data: slips, error } = await querySlips(BASE_COLS))
  }

  if (error) {
    return res.status(500).json({ error: 'Database error' })
  }

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
