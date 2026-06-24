// อ่าน "บุคลิกการเงิน" จากพฤติกรรมการบันทึก — rule-based ล้วน (ไม่ใช้ AI, ไม่กินโควต้า, ผลคงเส้นคงวา)
// อินพุต = ลิสต์ slips ของช่วงเวลาที่หน้ารายงานโหลดมาแล้ว (มี amount/type/category/transaction_at/created_at)
// คืน archetype 1 ตัว + คำบรรยายกวน ๆ + ชิปสถิติไว้โชว์บนการ์ด

const num = (v) => Number(v) || 0
const sum = (arr) => arr.reduce((a, s) => a + num(s.amount), 0)

// วันในสัปดาห์ของรายการ — ใช้ transaction_at ก่อน (วันที่บนสลิป) ไม่มีค่อย fallback created_at
// 0 = อาทิตย์, 6 = เสาร์ (เวลาเครื่องผู้ใช้ก็พอสำหรับแยกวันธรรมดา/สุดสัปดาห์)
function dayOfWeek(s) {
  const iso = s.transaction_at || s.created_at
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.getDay()
}

const pct = (x) => Math.round(x * 100)

// ── นิยาม archetype: เรียงตาม "ความเด่น" จากบนลงล่าง ตัวแรกที่เงื่อนไขผ่าน = ผู้ชนะ ──
// แต่ละตัวรับ stats แล้วคืน { match, build } — build() สร้างเนื้อการ์ดเมื่อถูกเลือก
// color = โทนการ์ด (คุมพื้นหลัง/ตัวอักษรผ่าน util ด้านล่าง)
function buildPersonas(st) {
  return [
    {
      key: 'newbie',
      match: st.count < 5,
      emoji: '🌱',
      color: 'slate',
      title: 'มือใหม่หัดบันทึก',
      description: 'บันทึกอีกสักหน่อย เดี๋ยวเราอ่านนิสัยการเงินของคุณออก!',
      stats: [{ label: 'บันทึกแล้ว', value: `${st.count} รายการ` }],
    },
    {
      key: 'overspender',
      match: st.incomeTotal > 0 && st.net < 0,
      emoji: '🔥',
      color: 'coral',
      title: 'สายใช้ก่อน ผ่อนทีหลัง',
      description: 'ช่วงนี้จ่ายมากกว่ารับ ระวังกระเป๋าแฟบนิดนะ 😅',
      stats: [
        { label: 'ติดลบ', value: `${st.net.toLocaleString('th-TH')} ฿` },
        { label: 'รายจ่าย', value: `${st.expenseCount} รายการ` },
      ],
    },
    {
      key: 'saver',
      match: st.incomeTotal > 0 && st.savingsRate >= 0.4,
      emoji: '🐿️',
      color: 'teal',
      title: 'นักเก็บเสบียง',
      description: `เก็บเงินไว้ได้ ${pct(st.savingsRate)}% ของรายรับ มือเย็นเรื่องเงินตัวจริง`,
      stats: [
        { label: 'อัตราออม', value: `${pct(st.savingsRate)}%` },
        { label: 'คงเหลือ', value: `${st.net.toLocaleString('th-TH')} ฿` },
      ],
    },
    {
      key: 'weekend',
      match: st.expenseCount >= 4 && st.weekendShare >= 0.45,
      emoji: '🎉',
      color: 'violet',
      title: 'สายเปย์สุดสัปดาห์',
      description: `${pct(st.weekendShare)}% ของรายจ่ายหมดไปกับวันเสาร์-อาทิตย์ ชาร์จพลังกันเต็มที่!`,
      stats: [
        { label: 'จ่ายวันหยุด', value: `${pct(st.weekendShare)}%` },
        { label: 'รายจ่ายรวม', value: `${st.expenseTotal.toLocaleString('th-TH')} ฿` },
      ],
    },
    {
      key: 'focused',
      match: st.topShare >= 0.5 && !!st.topCategoryLabel,
      emoji: '🎯',
      color: 'amber',
      title: `สายทุ่มสุดใจให้${st.topCategoryLabel}`,
      description: `${pct(st.topShare)}% ของรายจ่ายไปกับ${st.topCategoryLabel} รักจริงไม่ไปไหน`,
      stats: [
        { label: 'หมวดเด่น', value: st.topCategoryLabel },
        { label: 'สัดส่วน', value: `${pct(st.topShare)}%` },
      ],
    },
    {
      key: 'nibbler',
      match: st.expenseCount >= 8 && st.avgExpense <= 120,
      emoji: '☕',
      color: 'rose',
      title: 'สายจุกจิกละมุน',
      description: `ใช้ทีละนิดแต่บ่อย รวมแล้ว ${st.expenseCount} รายการเล็ก ๆ น้อย ๆ`,
      stats: [
        { label: 'เฉลี่ย/ครั้ง', value: `${Math.round(st.avgExpense).toLocaleString('th-TH')} ฿` },
        { label: 'จำนวนครั้ง', value: `${st.expenseCount}` },
      ],
    },
    {
      // default — รับ-จ่ายสมดุล ไม่มีลายเด่นเป็นพิเศษ
      key: 'balanced',
      match: true,
      emoji: '⚖️',
      color: 'teal',
      title: 'สายสมดุลชีวิตดี',
      description:
        st.incomeTotal > 0
          ? `รับกับจ่ายสมดุลกำลังสวย เก็บไว้ได้ ${Math.max(pct(st.savingsRate), 0)}%`
          : 'จัดการรายจ่ายเป็นระเบียบ น่าจับตามองสุด ๆ',
      stats: [
        { label: 'รายรับ', value: `${st.incomeTotal.toLocaleString('th-TH')} ฿` },
        { label: 'รายจ่าย', value: `${st.expenseTotal.toLocaleString('th-TH')} ฿` },
      ],
    },
  ]
}

/**
 * อ่านบุคลิกการเงินจากลิสต์รายการ
 * @param {Array} slips รายการธุรกรรม (จาก /api/report)
 * @param {(category:string|null)=>string} labelOf ฟังก์ชันแปลง category → ป้ายภาษาไทย (ส่งจาก Report)
 * @returns {{ key, emoji, color, title, description, stats:{label,value}[] }}
 */
export function derivePersona(slips = [], labelOf = (c) => c || 'อื่นๆ') {
  const txns = (slips || []).filter((s) => num(s.amount) > 0)
  const income = txns.filter((s) => s.type !== 'expense')
  const expense = txns.filter((s) => s.type === 'expense')

  const incomeTotal = sum(income)
  const expenseTotal = sum(expense)
  const net = incomeTotal - expenseTotal
  const savingsRate = incomeTotal > 0 ? net / incomeTotal : 0

  // หมวดจ่ายที่กินสัดส่วนมากสุด — บอก "ทุ่มให้อะไรเป็นพิเศษ"
  const byCat = new Map()
  for (const s of expense) {
    const key = s.category || null
    byCat.set(key, (byCat.get(key) || 0) + num(s.amount))
  }
  let topCategory = null
  let topAmount = 0
  for (const [key, amt] of byCat) {
    if (amt > topAmount) { topAmount = amt; topCategory = key }
  }
  const topShare = expenseTotal > 0 ? topAmount / expenseTotal : 0

  // สัดส่วนรายจ่ายที่เกิดวันเสาร์-อาทิตย์
  const weekendTotal = expense
    .filter((s) => { const d = dayOfWeek(s); return d === 0 || d === 6 })
    .reduce((a, s) => a + num(s.amount), 0)
  const weekendShare = expenseTotal > 0 ? weekendTotal / expenseTotal : 0

  const stats = {
    count: txns.length,
    incomeTotal,
    expenseTotal,
    net,
    savingsRate,
    expenseCount: expense.length,
    avgExpense: expense.length ? expenseTotal / expense.length : 0,
    topShare,
    topCategoryLabel: topCategory != null ? labelOf(topCategory) : null,
    weekendShare,
  }

  return buildPersonas(stats).find((p) => p.match)
}
