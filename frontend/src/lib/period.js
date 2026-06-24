// ── ตัวช่วยช่วงเวลา (วันอ้างอิงตามปฏิทินไทย Asia/Bangkok) ใช้ร่วมกันหลายหน้า ──
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000

export const PERIODS = [
  { key: 'daily', label: 'รายวัน' },
  { key: 'monthly', label: 'รายเดือน' },
  { key: 'yearly', label: 'รายปี' },
]

// วันนี้ตามเวลาไทย → { y, mo, d } (mo เริ่มที่ 0)
export function bkkToday() {
  const n = new Date(Date.now() + TZ_OFFSET_MS)
  return { y: n.getUTCFullYear(), mo: n.getUTCMonth(), d: n.getUTCDate() }
}

// เลื่อนวันอ้างอิงทีละ วัน/เดือน/ปี (dir = -1 ย้อน, +1 ถัดไป) — Date.UTC จัดการ overflow ให้เอง
export function stepAnchor(a, period, dir) {
  let ms
  if (period === 'daily') ms = Date.UTC(a.y, a.mo, a.d + dir)
  else if (period === 'monthly') ms = Date.UTC(a.y, a.mo + dir, 1)
  else ms = Date.UTC(a.y + dir, 0, 1)
  const t = new Date(ms)
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate() }
}

// อยู่ที่ช่วงปัจจุบันแล้วหรือยัง (ใช้ปิดปุ่ม "ถัดไป" กันเลื่อนไปอนาคต)
export function isAtPresent(a, period) {
  const t = bkkToday()
  if (period === 'yearly') return a.y >= t.y
  if (period === 'monthly') return a.y > t.y || (a.y === t.y && a.mo >= t.mo)
  return a.y > t.y || (a.y === t.y && (a.mo > t.mo || (a.mo === t.mo && a.d >= t.d)))
}

// แปลงวันอ้างอิงเป็น YYYY-MM-DD (เกรกอเรียน) ส่งให้ backend
export function anchorParam(a) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${a.y}-${pad(a.mo + 1)}-${pad(a.d)}`
}

// ป้ายช่วงเวลา (พ.ศ. ตาม locale ไทย)
export function anchorLabel(a, period) {
  const dt = new Date(Date.UTC(a.y, a.mo, a.d))
  if (period === 'daily') return dt.toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  if (period === 'monthly') return dt.toLocaleDateString('th-TH', { timeZone: 'UTC', month: 'long', year: 'numeric' })
  return `ปี ${a.y + 543}`
}
