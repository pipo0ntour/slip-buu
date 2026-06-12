// คำนวณขอบเขตช่วงเวลารายงานตามโซนเวลาไทย (Asia/Bangkok, +07:00) ไม่ใช่เวลา server (Railway = UTC)
// แยกเป็น pure function เพื่อให้เขียนเทสคุม logic timezone/ขอบเดือน-ปี ได้

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * @param {'daily'|'monthly'|'yearly'} period
 * @param {string=} dateStr วันอ้างอิงตามปฏิทินไทย รูปแบบ YYYY-MM-DD — ไม่ส่ง/ผิดรูปแบบ = วันนี้
 * @param {Date=} now ใช้กำหนด "ตอนนี้" ในเทส
 * @returns {{ fromIso: string, toIso: string }} ขอบเขตเป็น instant UTC สำหรับเทียบกับ created_at
 */
export function computeRange(period = 'daily', dateStr, now = new Date()) {
  let y, mo, d
  const anchor = typeof dateStr === 'string' && dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (anchor) {
    y = Number(anchor[1])
    mo = Number(anchor[2]) - 1
    d = Number(anchor[3])
  } else {
    const nowBkk = new Date(now.getTime() + TZ_OFFSET_MS) // ฟิลด์ UTC ของตัวนี้ = เวลาไทยจริง
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

  // แปลงเที่ยงคืนเวลาไทยกลับเป็น instant จริง (UTC)
  return {
    fromIso: new Date(startWallclock - TZ_OFFSET_MS).toISOString(),
    toIso: new Date(endWallclock - TZ_OFFSET_MS).toISOString(),
  }
}
