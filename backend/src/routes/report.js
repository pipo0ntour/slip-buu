import express from 'express'
import { supabase } from '../services/supabase.js'
import { computeRange, computePreviousRange } from '../services/period.js'
import { rateLimitReads } from '../services/rateLimit.js'

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

// ฟิลเตอร์ "ช่วงเวลาตามวันที่ทำรายการจริง" — ยึด transaction_at ก่อน, ถ้าเป็น null (OCR อ่านวันที่ไม่ได้)
// ค่อยตกไปใช้ created_at แทน เทียบเท่า COALESCE(transaction_at, created_at) อยู่ในช่วง [from, to)
// (PostgREST ไม่มี COALESCE ในฟิลเตอร์ตรง ๆ จึงเขียนเป็น OR สองกรณีให้เทียบเท่า — ทั้ง 2 คอลัมน์มีทุก schema)
const effectiveRangeFilter = (fromIso, toIso) =>
  `and(transaction_at.gte.${fromIso},transaction_at.lt.${toIso}),` +
  `and(transaction_at.is.null,created_at.gte.${fromIso},created_at.lt.${toIso})`

// instant (ms) ของ "วันที่ทำรายการจริง" สำหรับเรียงลำดับ — ให้ตรงกับวันที่ที่โชว์ในลิสต์
const effectiveDate = (s) => new Date(s.transaction_at || s.created_at).getTime()

router.get('/', rateLimitReads, async (req, res) => {
  const { period = 'daily', date } = req.query
  const lineUserId = req.lineUser.userId

  // period=all = ทั้งหมด (ไม่กรองวันที่) — ใช้กับบุคลิกการเงินแบบ all-time
  const isAll = period === 'all'
  // ขอบเขตช่วงเวลาตามปฏิทินไทย — logic อยู่ใน period.js (มีเทสคุม)
  // ?date=YYYY-MM-DD = วันอ้างอิงสำหรับดูย้อนหลัง, ไม่ส่ง = วันนี้
  const { fromIso, toIso } = isAll ? {} : computeRange(period, date)
  const prev = isAll ? null : computePreviousRange(period, date)

  // ชุดคอลัมน์ตามรุ่น migration — ลองครบสุดก่อนแล้ว "ถอยทีละขั้น" ห้ามข้ามขั้น:
  // DB ที่มีถึง 003 ยังมี type/category ครบ ถ้าถอยไปชุดเก่าสุดเลย ทุกรายการจะถูกตีเป็นรายรับ
  const COLS_004 =
    'id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, image_path, created_at, fee, sender_account, receiver_account, note, category, type, source'
  // 006 เพิ่ม image_purged_at (เวลาที่รูปถูกลบอัตโนมัติ) — ลองชุดนี้ก่อน ถ้า DB ยังไม่ migrate ค่อยถอยไป 004
  const COLS_006 = `${COLS_004}, image_purged_at`
  const COLS_003 =
    'id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, created_at, fee, sender_account, receiver_account, note, category, type, source'
  const COLS_BASE =
    'id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, created_at'

  // นับยอดตาม "วันที่ทำรายการจริง" (transaction_at) — ถ้าอ่านวันที่ไม่ได้/ไม่มี ใช้ created_at แทน
  // → ผู้ใช้ตั้ง/แก้ "วันที่ทำรายการ" แล้วรายการจะย้ายไปอยู่ช่วงที่ตั้งจริง (รายงานตรงกับวันที่ที่โชว์ในลิสต์)
  //   และรายการที่ไม่มี transaction_at ก็ไม่หาย — ตกไปนับด้วย created_at (ดู effectiveRangeFilter)
  const querySlips = (cols) => {
    let q = supabase
      .from('slips')
      .select(cols)
      .eq('line_user_id', lineUserId)
      .eq('status', 'success')
    if (!isAll) q = q.or(effectiveRangeFilter(fromIso, toIso))
    return q
  }

  let slips, error
  for (const cols of [COLS_006, COLS_004, COLS_003, COLS_BASE]) {
    ;({ data: slips, error } = await querySlips(cols))
    if (!error || !/column|could not find|schema cache/i.test(error.message)) break
  }

  if (error) {
    return res.status(500).json({ error: 'Database error' })
  }

  // เรียงใหม่→เก่า ตาม "วันที่ทำรายการจริง" ใน JS (PostgREST เรียงตาม COALESCE ไม่ได้) — ปริมาณต่อผู้ใช้ไม่มาก
  slips.sort((a, b) => effectiveDate(b) - effectiveDate(a))

  // เลิกเก็บรูปสลิปแล้ว — ถอดคอลัมน์รูป (ถ้า DB รุ่นเก่ายังมี) ออกจาก response กันค่าค้าง/ลิงก์หลุด
  for (const s of slips) {
    delete s.image_url
    delete s.image_path
    delete s.image_purged_at
  }

  // ยอดรายจ่ายแยกหมวดของ"ช่วงก่อนหน้า" — ใช้โชว์ลูกศรเทียบ trend ในหน้ารายงาน
  // (ช่วงปัจจุบันให้ frontend คำนวณเองจาก slips เพื่อให้อัปเดตทันทีหลังแก้/ลบรายการ)
  // ดึงเฉพาะ amount/category/type ของรายจ่าย ถ้า DB เก่ายังไม่มีคอลัมน์ → ข้าม (ไม่มีลูกศร)
  let prevExpenseByCategory = {}
  if (!isAll) {
    const { data: prevRows, error: prevErr } = await supabase
      .from('slips')
      .select('amount, category, type')
      .eq('line_user_id', lineUserId)
      .eq('status', 'success')
      .eq('type', 'expense')
      .or(effectiveRangeFilter(prev.fromIso, prev.toIso))
    if (!prevErr) prevExpenseByCategory = expenseByCategory(prevRows)
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
    prevExpenseByCategory,
    slips,
  })
})

// ───────────────────── สถิติเชิงลึกหลายเดือน (รวบเป็น query เดียว) ─────────────────────
// GET /api/report/insights?months=YYYY-MM-DD,YYYY-MM-DD,... (anchor รายเดือน เก่า→ใหม่)
// เดิมหน้า Insights ยิง /api/report เดือนละ 1 ครั้ง (6 เดือน = 12 query) — รวมเหลือ "query เดียว"
// ครอบทั้งช่วง แล้วแยกใส่รายเดือน + รวมหมวด ในหน่วยความจำ → เบาทั้งเน็ตฝั่งผู้ใช้และโหลด backend
router.get('/insights', rateLimitReads, async (req, res) => {
  const lineUserId = req.lineUser.userId

  // anchor รายเดือนจาก client (มีตรรกะ "วันนี้ตามเวลาไทย" อยู่แล้ว) — รับเฉพาะรูปแบบ YYYY-MM-DD, สูงสุด 12 เดือน
  const anchors = (req.query.months || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
    .slice(0, 12)
  if (!anchors.length) return res.status(400).json({ error: 'months required (YYYY-MM-DD,...)' })

  // ช่วงเวลาแต่ละเดือน (ขอบตามปฏิทินไทย) เรียงตาม anchor ที่ส่งมา
  const buckets = anchors.map((a) => {
    const { fromIso, toIso } = computeRange('monthly', a)
    return { fromMs: Date.parse(fromIso), toMs: Date.parse(toIso), income: 0, expense: 0, cat: new Map(), biggest: null }
  })
  // หน้าต่างรวม = เดือนแรกสุด→เดือนท้ายสุด (ครอบทุก bucket ด้วย query เดียว)
  const windowFrom = new Date(Math.min(...buckets.map((b) => b.fromMs))).toISOString()
  const windowTo = new Date(Math.max(...buckets.map((b) => b.toMs))).toISOString()

  // query เดียวครอบทั้งช่วง — ดึงเฉพาะคอลัมน์ที่ใช้รวมยอด (DB เก่าไม่มี type/category → ถอยไปคอลัมน์พื้นฐาน)
  const COLS_FULL = 'amount, type, category, note, receiver_name, transaction_at, created_at'
  const COLS_BASE = 'amount, transaction_at, created_at'
  let rows, error
  for (const cols of [COLS_FULL, COLS_BASE]) {
    ;({ data: rows, error } = await supabase
      .from('slips')
      .select(cols)
      .eq('line_user_id', lineUserId)
      .eq('status', 'success')
      .or(effectiveRangeFilter(windowFrom, windowTo)))
    if (!error || !/column|could not find|schema cache/i.test(error.message)) break
  }
  if (error) return res.status(500).json({ error: 'Database error' })

  // แยกแต่ละรายการเข้าเดือนของมัน (ตาม "วันที่ทำรายการจริง") แล้วรวมยอด/หมวด/รายการแพงสุด
  for (const s of rows || []) {
    const eff = effectiveDate(s)
    const b = buckets.find((b) => eff >= b.fromMs && eff < b.toMs)
    if (!b) continue
    const amt = Number(s.amount) || 0
    if (amt <= 0) continue
    if (s.type === 'expense') {
      b.expense += amt
      const key = s.category || NO_CATEGORY
      const c = b.cat.get(key) || { amount: 0, count: 0 }
      c.amount += amt
      c.count += 1
      b.cat.set(key, c)
      if (!b.biggest || amt > b.biggest.amount) {
        const name = (s.note || s.receiver_name || s.category || 'รายการ').toString().trim().slice(0, 24)
        b.biggest = { name, amount: amt }
      }
    } else {
      b.income += amt // ไม่มี type (DB เก่า) = นับเป็นรายรับ เหมือน /api/report
    }
  }

  const catRows = (cat) =>
    [...cat.entries()]
      .map(([k, v]) => ({ category: k === NO_CATEGORY ? null : k, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount)

  const months = buckets.map((b) => ({
    income: b.income,
    expense: b.expense,
    net: b.income - b.expense,
    categories: catRows(b.cat),
    biggest: b.biggest,
  }))

  // รวมหมวดทุกเดือน → "หมวดที่จ่ายเยอะสุด" ตลอดช่วง (ให้ frontend ไม่ต้องคำนวณเอง)
  const agg = new Map()
  let total = 0
  for (const b of buckets) {
    for (const [k, v] of b.cat) {
      const c = agg.get(k) || { amount: 0, count: 0 }
      c.amount += v.amount
      c.count += v.count
      agg.set(k, c)
      total += v.amount
    }
  }
  const topRows = [...agg.entries()]
    .map(([k, v]) => ({ category: k === NO_CATEGORY ? null : k, amount: v.amount, count: v.count, pct: total ? v.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)

  res.json({ months, topCategories: { total, rows: topRows } })
})

// สรุปยอด "ตลอดทั้งหมด" (ไม่จำกัดช่วงเวลา) — ใช้ในหน้าโปรไฟล์ ให้ต่างจากหน้ารายงานที่อิงช่วงเวลา
// ดึงแค่ amount/type ทุกแถวที่สำเร็จของผู้ใช้ แล้วรวมในแอป (ปริมาณต่อผู้ใช้ไม่มากในแอปนี้)
router.get('/summary', rateLimitReads, async (req, res) => {
  const lineUserId = req.lineUser.userId

  // DB เก่า (ก่อน migration 003) ยังไม่มีคอลัมน์ type → ถอยไปดึงแค่ amount แล้วตีเป็นรายรับทั้งหมด
  let rows, error
  for (const cols of ['amount, type', 'amount']) {
    ;({ data: rows, error } = await supabase
      .from('slips')
      .select(cols)
      .eq('line_user_id', lineUserId)
      .eq('status', 'success'))
    if (!error || !/column|could not find|schema cache/i.test(error.message)) break
  }

  if (error) return res.status(500).json({ error: 'Database error' })

  let totalIncome = 0
  let totalExpense = 0
  for (const s of rows || []) {
    const amount = Number(s.amount) || 0
    if (amount <= 0) continue
    if (s.type === 'expense') totalExpense += amount
    else totalIncome += amount
  }

  res.json({
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    count: (rows || []).length,
  })
})

export default router
