import sharp from 'sharp'
import heicConvert from 'heic-convert'

// ตรวจ HEIC/HEIF (ดีฟอลต์กล้อง iPhone) จาก ftyp box ของ ISO-BMFF — ไฟล์ขึ้นต้นด้วย
// [ขนาด 4 ไบต์]['ftyp'][brand 4 ไบต์] เสมอ, brand บอกชนิด (heic/heix/mif1 ฯลฯ)
// ต้องเช็คจาก "ไบต์จริง" ไม่ใช่ mimetype เพราะ mimetype ฝั่ง client ปลอม/หายได้ (บางเครื่องส่ง application/octet-stream)
const HEIC_BRANDS = /^(heic|heix|heim|heis|hevc|hevx|hevm|hevs|mif1|msf1)$/
function isHeic(buf) {
  return buf?.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp' && HEIC_BRANDS.test(buf.toString('latin1', 8, 12))
}

// ───────── preset สำหรับงานคนละแบบ ─────────
// OCR: คมชัดไว้ก่อน — เผื่อรายละเอียดเส้นจิ๋วที่แยกอักษรไทยคล้ายกัน (ฎ/ฏ/ฐ, ผ/ฝ ฯลฯ)
//      รูปนี้ใช้อ่านอย่างเดียว ไม่เก็บ จึงไม่ต้องห่วงขนาดไฟล์
// STORAGE: เก็บลง bucket — เล็กไว้ก่อน ประหยัดพื้นที่ (พออ่านด้วยตาทีหลัง/เป็นหลักฐาน)
// maxDim 1536 = ลง ~33% ของ image token (จาก ~6 เหลือ ~4 ไทล์ 768px ของ Gemini) แต่ยังคมพออ่านอักษรไทย
// (ลดเฉพาะความละเอียด ไม่ลด quality เพราะ quality ไม่กระทบจำนวน token แต่ช่วยความแม่น OCR)
export const OCR_PRESET = { maxDim: 1536, quality: 92 }
export const STORAGE_PRESET = { maxDim: 1280, quality: 80 }

// fileFilter ของ multer — รับเฉพาะไฟล์ที่ประกาศตัวเป็นรูป (image/*) ปฏิเสธชนิดอื่นแต่เนิ่น ๆ
// หมายเหตุ: mimetype ฝั่ง client ปลอมได้ ด่านจริงคือ sharp ใน compressImage ที่จะเด้ง non-image อยู่แล้ว
// อันนี้เป็นแค่การกรองถูก ๆ ชั้นแรก (cb(null,false) = ดรอปไฟล์เงียบ ๆ → handler เด้ง "ไม่พบรูป" เอง)
export function imageFileFilter(_req, file, cb) {
  cb(null, /^image\//i.test(file?.mimetype || ''))
}

/**
 * บีบอัด + ปรับทิศทางรูปก่อนส่ง OCR หรือเก็บลง Storage
 * - หมุนรูปอัตโนมัติตาม EXIF (กล้องมือถือมักฝังข้อมูลทิศทางไว้) ช่วยให้ OCR แม่นขึ้น
 * - ย่อด้านยาวสุดไม่เกิน maxDim แล้วแปลงเป็น JPEG (mozjpeg) ตาม quality
 * - เลือก preset ตามงาน: OCR_PRESET (คมชัด) หรือ STORAGE_PRESET (เล็ก) — ดีฟอลต์ = STORAGE
 *
 * ถ้า compress ล้มเหลว จะคืน buffer เดิมเพื่อไม่ให้ flow พัง
 * @param {{ maxDim?: number, quality?: number }} [opts]
 * @returns {{ buffer: Buffer, mimetype: string }}
 */
export async function compressImage(buffer, originalMime = 'image/jpeg', opts = STORAGE_PRESET) {
  const { maxDim = STORAGE_PRESET.maxDim, quality = STORAGE_PRESET.quality } = opts
  const encode = (src) => sharp(src)
    .rotate() // auto-orient ตาม EXIF
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()
  try {
    // ลอง sharp ตรง ๆ ก่อน — เร็ว/native และ prebuilt รุ่นใหม่ถอด HEIC ได้เองแล้ว
    return { buffer: await encode(buffer), mimetype: 'image/jpeg' }
  } catch (err) {
    // sharp บางบิลด์ (โดยเฉพาะ prebuilt เก่า) ถอด HEIC/HEIF ไม่ได้ — ถ้าไฟล์เป็น HEIC จริง
    // (เช็คจากไบต์) ให้แปลงด้วย libheif (wasm) เป็น JPEG ก่อนแล้วลอง sharp ซ้ำ (libheif ใส่การหมุนให้แล้ว)
    if (isHeic(buffer)) {
      try {
        const jpg = Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 1 }))
        return { buffer: await encode(jpg), mimetype: 'image/jpeg' }
      } catch (e2) { err = e2 }
    }
    console.error('compressImage failed, using original:', err.message)
    return { buffer, mimetype: originalMime }
  }
}
