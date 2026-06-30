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
  'ค่าเช่า': { emoji: '🏠', color: '#ec4899' },
  'ค่าเดินทาง': { emoji: '🚗', color: '#14b8a6' },
  'สุขภาพ': { emoji: '💊', color: '#22c55e' },
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

// ── คำแนะนำการใช้จ่าย (rule-based) ─────────────────────────────────────────
// ตีความข้อมูลรายเดือนเป็น "ข้อความบอกว่าควรลด/จับตาอะไร" — ฟรี เร็ว ไม่พึ่ง AI
// รับ months = ข้อมูลรายเดือน "เก่า→ใหม่" (เดือนล่าสุดอยู่ท้าย) จาก /api/report/insights แต่ละตัวมี:
//   { income, expense, net, categories:[{category, amount, count}], biggest:{name, amount}|null }
// + budgets = { [หมวด]: วงเงิน } ที่ผู้ใช้ตั้งไว้
// คืน [{ id, tone:'warn'|'info'|'good', emoji, text }] เรียงเร่งด่วนก่อน (เกินงบ → พุ่ง → สัดส่วน → ออม → แพงสุด)
//
// หมายเหตุ: เดือนล่าสุดอาจยังไม่จบเดือน → เทียบกับ "ค่าเฉลี่ยเดือนก่อน ๆ" มีโอกาส under-report (เตือนน้อยไว้ก่อน)
// จึงตั้งเกณฑ์ให้เตือนเฉพาะที่ขึ้นชัด ๆ (≥30% และเพิ่มจริง ≥300฿) กัน noise
export function buildAdvice(months, budgets = {}) {
  const list = (months || []).filter(Boolean)
  if (!list.length) return []
  const cur = list[list.length - 1]
  const prior = list.slice(0, -1)
  const curRows = (cur.categories || []).slice().sort((a, b) => b.amount - a.amount)
  const curExpense = Number(cur.expense) || 0
  const curByCat = Object.fromEntries(curRows.map((r) => [r.category ?? NO_CATEGORY, r.amount]))
  const labelOf = (key) => (key === NO_CATEGORY ? 'ไม่ระบุหมวด' : key)
  const emojiOf = (key) => categoryMeta(key === NO_CATEGORY ? null : key).emoji
  const advice = []

  // 1) เกินงบ — เร่งด่วนสุด (สูงสุด 2 หมวดที่เกินเยอะสุด)
  const over = Object.keys(budgets || {})
    .map((cat) => ({ cat, budget: Number(budgets[cat]) || 0, spent: curByCat[cat] || 0 }))
    .filter((b) => b.budget > 0 && b.spent > b.budget)
    .sort((a, b) => b.spent - b.budget - (a.spent - a.budget))
  for (const b of over.slice(0, 2)) {
    const pct = Math.round(((b.spent - b.budget) / b.budget) * 100)
    advice.push({ id: `over-${b.cat}`, tone: 'warn', emoji: '🚨', text: `ใช้เกินงบ ${b.cat} แล้ว +${pct}% (${fmtBahtShort(b.spent)}/${fmtBahtShort(b.budget)}฿)` })
  }

  // 2) หมวดที่ "พุ่งขึ้น" เทียบค่าเฉลี่ยเดือนก่อน ๆ (สูงสุด 2 หมวดที่เพิ่มเป็นเงินเยอะสุด)
  if (prior.length) {
    const priorSum = {} // หมวด → ยอดรวมทุกเดือนก่อนหน้า
    for (const r of prior) {
      for (const row of r.categories || []) {
        const k = row.category ?? NO_CATEGORY
        priorSum[k] = (priorSum[k] || 0) + row.amount
      }
    }
    const spikes = []
    for (const row of curRows) {
      const k = row.category ?? NO_CATEGORY
      const base = priorSum[k] ? priorSum[k] / prior.length : 0
      const diff = row.amount - base
      if (base > 0 && diff / base >= 0.3 && diff >= 300) spikes.push({ k, amount: row.amount, pct: diff / base, diff })
    }
    spikes.sort((a, b) => b.diff - a.diff)
    for (const s of spikes.slice(0, 2)) {
      if (over.some((b) => b.cat === s.k)) continue // เตือนเกินงบไปแล้ว ไม่ต้องซ้ำ
      advice.push({ id: `spike-${s.k}`, tone: 'warn', emoji: emojiOf(s.k), text: `${labelOf(s.k)}เดือนนี้ ${fmtBahtShort(s.amount)}฿ — สูงกว่าค่าเฉลี่ย +${Math.round(s.pct * 100)}%` })
    }
  }

  // 3) หมวดที่กินสัดส่วนรายจ่ายมากสุด (เฉพาะเมื่อกระจุกตัวจริง ≥40%)
  if (curRows.length && curExpense > 0) {
    const top = curRows[0]
    const pct = Math.round((top.amount / curExpense) * 100)
    if (pct >= 40) {
      advice.push({ id: 'top-share', tone: 'info', emoji: '📊', text: `${labelOf(top.category ?? NO_CATEGORY)}คิดเป็น ${pct}% ของรายจ่ายเดือนนี้ (${fmtBahtShort(top.amount)}฿)` })
    }
  }

  // 4) สถานะการออมเดือนนี้
  const income = Number(cur.income) || 0
  const net = Number(cur.net) || 0
  if (net < 0) {
    advice.push({ id: 'savings', tone: 'warn', emoji: '🏦', text: `เดือนนี้จ่ายมากกว่ารับ (ติดลบ ${fmtBahtShort(Math.abs(net))}฿)` })
  } else if (income > 0) {
    const rate = Math.round((net / income) * 100)
    if (rate >= 20) advice.push({ id: 'savings', tone: 'good', emoji: '🎉', text: `ออมได้ ${rate}% ของรายรับเดือนนี้ — เยี่ยมไปเลย` })
    else if (rate < 10) advice.push({ id: 'savings', tone: 'info', emoji: '🏦', text: `ออมได้ ${rate}% ของรายรับ ลองตั้งเป้าออมเพิ่มอีกนิด` })
  }

  // 5) รายการเดี่ยวที่แพงสุดเดือนนี้
  if (cur.biggest && Number(cur.biggest.amount) > 0) {
    advice.push({ id: 'biggest', tone: 'info', emoji: '💸', text: `รายการแพงสุดเดือนนี้: ${cur.biggest.name} ${fmtBahtShort(cur.biggest.amount)}฿` })
  }

  return advice
}
