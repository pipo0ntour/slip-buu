// จำกัดจำนวน request ต่อผู้ใช้ (in-memory) — กันสแปมอัปโหลดซึ่งเรียก Gemini OCR ที่มีค่าใช้จ่าย
// ใช้หลัง lineAuth เท่านั้น (ต้องมี req.lineUser.userId)
const WINDOW_MS = 60 * 1000 // หน้าต่างเวลา 1 นาที
const MAX_PER_WINDOW = 20 // จำนวน request สูงสุดต่อผู้ใช้ต่อนาที (ปรับได้)

const hits = new Map() // userId -> number[] (timestamps)

export function rateLimitByUser(req, res, next) {
  const id = req.lineUser?.userId
  if (!id) return next() // ไม่ควรเกิดเพราะผ่าน lineAuth มาแล้ว แต่กันพลาด

  const now = Date.now()
  const recent = (hits.get(id) || []).filter((t) => now - t < WINDOW_MS)

  if (recent.length >= MAX_PER_WINDOW) {
    return res.status(429).json({ status: 'error', message: 'ทำรายการถี่เกินไป กรุณารอสักครู่' })
  }

  recent.push(now)
  hits.set(id, recent)

  // กวาด entry ที่หมดอายุเป็นครั้งคราว กัน Map โตไม่จำกัด
  if (hits.size > 5000) {
    for (const [key, arr] of hits) {
      const live = arr.filter((t) => now - t < WINDOW_MS)
      if (live.length === 0) hits.delete(key)
      else hits.set(key, live)
    }
  }

  next()
}
