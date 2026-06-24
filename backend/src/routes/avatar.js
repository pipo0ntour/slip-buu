import express from 'express'
import multer from 'multer'
import { analyzeFace } from '../services/gemini.js'
import { compressImage, OCR_PRESET } from '../services/image.js'
import { rateLimitByUser } from '../services/rateLimit.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB เท่ากับ slip
})

/**
 * POST /api/avatar/analyze — รับเซลฟี่ 1 รูป → คืน "ลักษณะใบหน้า" ให้ frontend ประกอบอวตารการ์ตูน
 * ไม่เก็บรูปต้นฉบับ (privacy) — อ่านลักษณะเสร็จทิ้ง buffer เลย คืนแค่ค่า attribute
 */
router.post('/analyze', rateLimitByUser, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'กรุณาแนบรูปใบหน้า' })
  }

  try {
    // ย่อ/หมุนตาม EXIF ก่อนส่ง vision (คมพอให้อ่านลักษณะ ไม่ต้องใหญ่เท่าสลิป)
    const { buffer, mimetype } = await compressImage(req.file.buffer, req.file.mimetype, OCR_PRESET)
    const face = await analyzeFace(buffer, mimetype)

    if (!face.isFace) {
      return res.status(422).json({ status: 'error', message: 'ไม่พบใบหน้าในรูปนี้ ลองถ่ายให้เห็นหน้าชัด ๆ อีกครั้ง' })
    }

    return res.json({ status: 'success', face })
  } catch (err) {
    console.error('analyzeFace error:', err.message)
    const quota = /429|quota|too many requests|rate limit/i.test(err.message || '')
    return res.status(quota ? 429 : 500).json({
      status: 'error',
      message: quota
        ? 'คิว AI เต็มชั่วคราว กรุณารอสักครู่แล้วลองใหม่'
        : 'สร้างอวตารไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    })
  }
})

export default router
