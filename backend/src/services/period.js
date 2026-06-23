// คำนวณขอบเขตช่วงเวลารายงานตามโซนเวลาไทย (Asia/Bangkok, +07:00) ไม่ใช่เวลา server (Railway = UTC)
// แยกเป็น pure function เพื่อให้เขียนเทสคุม logic timezone/ขอบเดือน-ปี ได้

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * @param {'daily'|'monthly'|'yearly'} period
 * @param {string=} dateStr วันอ้างอิงตามปฏิทินไทย รูปแบบ YYYY-MM-DD — ไม่ส่ง/ผิดรูปแบบ = วันนี้
 * @param {Date=} now ใช้กำหนด "ตอนนี้" ในเทส
 * @returns {{ fromIso: string, toIso: string }} ขอบเขตเป็น instant UTC สำหรับเทียบกับ created_at
 */
// แปลงวันอ้างอิง (string YYYY-MM-DD หรือ "วันนี้") → { y, mo, d } ตามปฏิทินไทย
function resolveAnchor(dateStr, now) {
  const anchor = typeof dateStr === 'string' && dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (anchor) {
    const y = Number(anchor[1])
    const mo = Number(anchor[2]) - 1
    const d = Number(anchor[3])
    // regex \d{2} รับเดือน/วันนอกช่วงได้ (เช่น 2025-13-40) แล้ว Date.UTC จะ overflow ข้ามไปเอง
    // กันด้วย round-trip: ถ้า y/mo/d ที่สร้างกลับมาไม่ตรงกับที่ parse = นอกช่วงจริง → ตกไปใช้ "วันนี้"
    const probe = new Date(Date.UTC(y, mo, d))
    if (probe.getUTCFullYear() === y && probe.getUTCMonth() === mo && probe.getUTCDate() === d) {
      return { y, mo, d }
    }
  }
  const nowBkk = new Date(now.getTime() + TZ_OFFSET_MS) // ฟิลด์ UTC ของตัวนี้ = เวลาไทยจริง
  return { y: nowBkk.getUTCFullYear(), mo: nowBkk.getUTCMonth(), d: nowBkk.getUTCDate() }
}

// แปลงวันอ้างอิง { y, mo, d } เป็นขอบเขต instant UTC ตาม granularity
function rangeFromAnchor(period, { y, mo, d }) {
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

  // แปลงเที่ยงคืนเวลาไทยกลับเป็น instant จริง (UTC)
  return {
    fromIso: new Date(startWallclock - TZ_OFFSET_MS).toISOString(),
    toIso: new Date(endWallclock - TZ_OFFSET_MS).toISOString(),
  }
}

export function computeRange(period = 'daily', dateStr, now = new Date()) {
  return rangeFromAnchor(period, resolveAnchor(dateStr, now))
}

/**
 * ขอบเขตของ "ช่วงก่อนหน้า" ตาม granularity (วันก่อน/เดือนก่อน/ปีก่อน) — ใช้เทียบ trend
 * @param {'daily'|'monthly'|'yearly'} period
 * @param {string=} dateStr วันอ้างอิงเดียวกับ computeRange
 * @param {Date=} now
 * @returns {{ fromIso: string, toIso: string }}
 */
export function computePreviousRange(period = 'daily', dateStr, now = new Date()) {
  const a = resolveAnchor(dateStr, now)
  let prevMs
  if (period === 'daily') prevMs = Date.UTC(a.y, a.mo, a.d - 1)
  else if (period === 'monthly') prevMs = Date.UTC(a.y, a.mo - 1, 1)
  else prevMs = Date.UTC(a.y - 1, 0, 1)
  const t = new Date(prevMs)
  return rangeFromAnchor(period, { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate() })
}
