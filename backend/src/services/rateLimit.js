// จำกัดจำนวน request ต่อผู้ใช้ (in-memory) — กันสแปม/ขูดข้อมูล และคุมการเรียก Gemini OCR ที่มีค่าใช้จ่าย
// ใช้หลัง lineAuth เท่านั้น (ต้องมี req.lineUser.userId)
const WINDOW_MS = 60 * 1000 // หน้าต่างเวลา 1 นาที

/**
 * สร้าง middleware จำกัด req ต่อผู้ใช้ — แต่ละ limiter มี Map ของตัวเอง (นับแยกกัน ไม่ปนกัน)
 * @param {{ max?: number, windowMs?: number }} [opts]
 */
export function createRateLimit({ max = 20, windowMs = WINDOW_MS } = {}) {
  const hits = new Map() // userId -> number[] (timestamps)

  return function rateLimit(req, res, next) {
    const id = req.lineUser?.userId
    if (!id) return next() // ไม่ควรเกิดเพราะผ่าน lineAuth มาแล้ว แต่กันพลาด

    const now = Date.now()
    const recent = (hits.get(id) || []).filter((t) => now - t < windowMs)

    if (recent.length >= max) {
      return res.status(429).json({ status: 'error', message: 'ทำรายการถี่เกินไป กรุณารอสักครู่' })
    }

    recent.push(now)
    hits.set(id, recent)

    // กวาด entry ที่หมดอายุเป็นครั้งคราว กัน Map โตไม่จำกัด
    if (hits.size > 5000) {
      for (const [key, arr] of hits) {
        const live = arr.filter((t) => now - t < windowMs)
        if (live.length === 0) hits.delete(key)
        else hits.set(key, live)
      }
    }

    next()
  }
}

// อัปโหลด/เรียก AI (มีต้นทุน) — เข้มหน่อย 20/นาที/คน
export const rateLimitByUser = createRateLimit({ max: 20 })

// อ่านรายงาน (เบากว่ามาก แต่กันสแปม/ขูดข้อมูล) — ผ่อนกว่า เพราะ Insights ยิงทีเดียว 6 + เปิดหลายหน้า
export const rateLimitReads = createRateLimit({ max: 60 })
