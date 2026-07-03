// จำกัดจำนวน request (in-memory) — กันสแปม/ขูดข้อมูล และคุมการเรียก Gemini OCR ที่มีค่าใช้จ่าย
// ดีฟอลต์นับต่อผู้ใช้ (ใช้หลัง lineAuth — ต้องมี req.lineUser.userId) หรือส่ง keyFn มานับด้วย key อื่น (เช่น IP)
//
// ⚠️ ข้อจำกัดที่ "ยอมรับ" สำหรับสเกลนี้: state อยู่ใน memory ล้วน — restart/deploy = ตัวนับรีเซ็ต
//    และถ้ารันหลาย instance แต่ละตัวนับแยกกัน (ลิมิตจริงคูณจำนวน instance)
//    ถ้าจะเข้มจริงต้องย้ายไป store กลาง (Redis/DB) ซึ่งเกินความจำเป็นของแอปนี้ตอนนี้
const WINDOW_MS = 60 * 1000 // หน้าต่างเวลา 1 นาที

/**
 * สร้าง middleware จำกัด req — แต่ละ limiter มี Map ของตัวเอง (นับแยกกัน ไม่ปนกัน)
 * @param {{ max?: number, windowMs?: number, keyFn?: (req) => string|undefined }} [opts]
 *   keyFn = ตัวเลือก key ที่ใช้นับ (ดีฟอลต์: userId จาก lineAuth) — คืน undefined = ปล่อยผ่าน
 */
export function createRateLimit({ max = 20, windowMs = WINDOW_MS, keyFn } = {}) {
  const hits = new Map() // key -> number[] (timestamps)
  const getKey = keyFn || ((req) => req.lineUser?.userId)

  return function rateLimit(req, res, next) {
    const id = getKey(req)
    if (!id) return next() // ไม่มี key ให้นับ (เช่นยังไม่ผ่าน lineAuth) — ปล่อยผ่าน กันพลาด

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

// แก้/ลบ/เปิดรูปรายการ (ต้นทุนต่ำแต่ต้องไม่ปล่อยยิงไม่อั้น) — แยกถังจากตัวอ่าน กันเบียดโควต้ากัน
export const rateLimitItemOps = createRateLimit({ max: 60 })

// ต่อ IP "ก่อน auth" — ด่านแรกกันสแปม token มั่ว ๆ (ทุก req ที่หลุดไปถึง lineAuth = ยิง LINE API จริง)
// เพดานกว้างพอสำหรับผู้ใช้จริงหลายคนหลัง NAT เดียวกัน (ใช้ req.ip — ต้อง app.set('trust proxy', 1))
export const rateLimitByIp = createRateLimit({ max: 300, keyFn: (req) => req.ip })
