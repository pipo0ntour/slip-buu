// ฟังก์ชัน pure สำหรับแปลง/ทำความสะอาดข้อมูลที่ OCR อ่านได้
// แยกออกจาก gemini.js เพื่อให้เขียนเทสได้โดยไม่ต้องโหลด Gemini SDK

export const THAI_MONTHS = {
  'ม.ค.': 1, 'มกราคม': 1, 'ก.พ.': 2, 'กุมภาพันธ์': 2, 'มี.ค.': 3, 'มีนาคม': 3,
  'เม.ย.': 4, 'เมษายน': 4, 'พ.ค.': 5, 'พฤษภาคม': 5, 'มิ.ย.': 6, 'มิถุนายน': 6,
  'ก.ค.': 7, 'กรกฎาคม': 7, 'ส.ค.': 8, 'สิงหาคม': 8, 'ก.ย.': 9, 'กันยายน': 9,
  'ต.ค.': 10, 'ตุลาคม': 10, 'พ.ย.': 11, 'พฤศจิกายน': 11, 'ธ.ค.': 12, 'ธันวาคม': 12,
}

// ชื่อธนาคารมาตรฐาน — จับคำสำคัญแล้วแปลงให้เป็นชื่อย่อเดียวกันเสมอ
const BANK_MAP = [
  [/kbank|กสิกร|kasikorn/i, 'กสิกรไทย'],
  [/scb|ไทยพาณิชย์|siam commercial/i, 'ไทยพาณิชย์'],
  [/bbl|กรุงเทพ|bangkok bank/i, 'กรุงเทพ'],
  [/ktb|กรุงไทย|krungthai/i, 'กรุงไทย'],
  [/bay|krungsri|กรุงศรี/i, 'กรุงศรีอยุธยา'],
  [/ttb|ทหารไทย|ธนชาต|thanachart/i, 'ทหารไทยธนชาต'],
  [/gsb|ออมสิน|government savings/i, 'ออมสิน'],
  [/baac|ธ.?ก.?ส|เกษตร/i, 'ธ.ก.ส.'],
  [/kkp|เกียรตินาคิน|kiatnakin/i, 'เกียรตินาคินภัทร'],
  [/cimb|ซีไอเอ็มบี/i, 'ซีไอเอ็มบีไทย'],
  [/uob|ยูโอบี/i, 'ยูโอบี'],
  [/tisco|ทิสโก้/i, 'ทิสโก้'],
  [/lh ?bank|แลนด์.?แอนด์.?เฮ้?าส์/i, 'แลนด์ แอนด์ เฮ้าส์'],
  [/icbc|ไอซีบีซี/i, 'ไอซีบีซีไทย'],
  [/promptpay|พร้อมเพย์/i, 'พร้อมเพย์'],
]

export function toNumber(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const cleaned = String(v).replace(/[^\d.]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

export function normalizeBank(name) {
  if (!name) return null
  for (const [pattern, canonical] of BANK_MAP) {
    if (pattern.test(name)) return canonical
  }
  return name.trim() || null
}

export function clean(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s && s.toLowerCase() !== 'null' ? s : null
}

// แปลง transactionDate (YYYY-MM-DD) + time เป็น ISO string โซนไทย (+07:00)
// มี safety net: ถ้าปียังเป็น พ.ศ. (มากกว่าปีปัจจุบัน+1) ให้ลบ 543 ให้อัตโนมัติ
// nowYear รับเป็นพารามิเตอร์เพื่อให้เทสกำหนด "ปีปัจจุบัน" ได้
export function buildTransactionAt(dateStr, timeStr, nowYear = new Date().getFullYear()) {
  let y, mo, d

  if (dateStr && /^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr.trim())) {
    ;[y, mo, d] = dateStr.trim().split('-').map(Number)
  } else if (dateStr) {
    // เผื่อ Gemini ตอบรูปแบบไทย เช่น "8 มิ.ย. 2568"
    const parsed = parseThaiDate(dateStr)
    if (!parsed) return null
    ;({ y, mo, d } = parsed)
  } else {
    return null
  }

  if (!y || !mo || !d) return null

  // safety: ปี พ.ศ. → ค.ศ.
  if (y > nowYear + 1) y -= 543

  let hh = 0, mm = 0
  if (timeStr && /^\d{1,2}:\d{2}/.test(timeStr.trim())) {
    ;[hh, mm] = timeStr.trim().split(':').map(Number)
  }

  const iso = `${pad4(y)}-${pad2(mo)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00+07:00`
  const dt = new Date(iso)
  return isNaN(dt.getTime()) ? null : dt.toISOString()
}

export function parseThaiDate(str) {
  // จับรูปแบบ "8 มิ.ย. 2568" หรือ "8 มิถุนายน 2568"
  // ช่วงอักขระต้องครอบทั้งพยัญชนะ+สระ+วรรณยุกต์ (U+0E01–U+0E4E) —
  // [ก-ฮ.] เฉย ๆ ไม่รวมสระ ทำให้เดือนอย่าง "มิ.ย."/"เม.ย."/"มีนาคม" ไม่เคย match
  const m = str.match(/(\d{1,2})\s*([ก-๎.]+)\s*(\d{2,4})/)
  if (!m) return null
  const d = Number(m[1])
  const mo = THAI_MONTHS[m[2]] || null
  let y = Number(m[3])
  // ปีย่อ 2 หลักบนสลิปไทย (มากับชื่อเดือนไทย) = พ.ศ. ศตวรรษ 25xx เสมอ เช่น "68" → 2568
  if (y < 100) y += 2500
  if (!mo) return null
  return { y, mo, d }
}

const pad2 = (n) => String(n).padStart(2, '0')
const pad4 = (n) => String(n).padStart(4, '0')
