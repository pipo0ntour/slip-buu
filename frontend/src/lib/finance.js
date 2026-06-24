// ── ตัวช่วยเรื่องเงิน/หมวดหมู่ ที่หลายหน้าใช้ร่วมกัน (รายงาน/ค้นหา/สถิติ/โปรไฟล์) ──

export const fmtBaht = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })
export const fmtBahtShort = (n) => Number(n || 0).toLocaleString('th-TH')

// คีย์แทน "ไม่ระบุหมวด" — แยกจากหมวด 'อื่นๆ' ที่ผู้ใช้ติดป้ายเอง (ตรงกับ backend report.js)
export const NO_CATEGORY = '__none__'

// สี + อิโมจิประจำหมวด — ให้แต่ละหมวดสีคงที่ สแกนด้วยตาได้เร็ว
export const CATEGORY_META = {
  'ค่าของ': { emoji: '🛍️', color: '#3b82f6' },
  'ค่าส่ง': { emoji: '🚚', color: '#f59e0b' },
  'ค่าอาหาร': { emoji: '🍜', color: '#ef4444' },
  'ค่าน้ำค่าไฟ': { emoji: '💡', color: '#eab308' },
  'เงินเดือน': { emoji: '💼', color: '#8b5cf6' },
  'อื่นๆ': { emoji: '📦', color: '#64748b' },
}
const NO_CATEGORY_META = { emoji: '❓', color: '#94a3b8' }
// เผื่อหมวดที่ผู้ใช้พิมพ์เองนอกรายการมาตรฐาน — วนสีจากชุดนี้
const FALLBACK_COLORS = ['#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16']

export const categoryKey = (category) => (category == null ? NO_CATEGORY : category)
export const categoryLabel = (category) => (category == null ? 'ไม่ระบุหมวด' : category)
export function categoryMeta(category, idx = 0) {
  if (category == null) return NO_CATEGORY_META
  return CATEGORY_META[category] || { emoji: '🏷️', color: FALLBACK_COLORS[idx % FALLBACK_COLORS.length] }
}

// ยอดรายรับ/รายจ่าย/คงเหลือ/จำนวน จากลิสต์สลิป
export function summarize(slips) {
  const list = slips || []
  const totalIncome = list.filter((s) => s.type !== 'expense').reduce((a, s) => a + (Number(s.amount) || 0), 0)
  const totalExpense = list.filter((s) => s.type === 'expense').reduce((a, s) => a + (Number(s.amount) || 0), 0)
  return { totalIncome, totalExpense, net: totalIncome - totalExpense, count: list.length }
}

// จัดกลุ่มรายจ่ายตามหมวด (มาก→น้อย) + จำนวนรายการ/สัดส่วน
export function expenseByCategory(slips) {
  const map = new Map()
  let total = 0
  for (const s of slips || []) {
    if (s.type !== 'expense') continue
    const amount = Number(s.amount) || 0
    if (amount <= 0) continue
    const key = s.category || null // null = ไม่ระบุหมวด (แยกจาก 'อื่นๆ')
    const cur = map.get(key) || { amount: 0, count: 0 }
    cur.amount += amount
    cur.count += 1
    map.set(key, cur)
    total += amount
  }
  const rows = [...map.entries()]
    .map(([category, v]) => ({ category, amount: v.amount, count: v.count, pct: total ? v.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
  return { total, rows }
}
