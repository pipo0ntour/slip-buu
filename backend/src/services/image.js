import sharp from 'sharp'

// ───────── preset สำหรับงานคนละแบบ ─────────
// OCR: คมชัดไว้ก่อน — เผื่อรายละเอียดเส้นจิ๋วที่แยกอักษรไทยคล้ายกัน (ฎ/ฏ/ฐ, ผ/ฝ ฯลฯ)
//      รูปนี้ใช้อ่านอย่างเดียว ไม่เก็บ จึงไม่ต้องห่วงขนาดไฟล์
// STORAGE: เก็บลง bucket — เล็กไว้ก่อน ประหยัดพื้นที่ (พออ่านด้วยตาทีหลัง/เป็นหลักฐาน)
export const OCR_PRESET = { maxDim: 2000, quality: 92 }
export const STORAGE_PRESET = { maxDim: 1280, quality: 80 }

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
  try {
    const out = await sharp(buffer)
      .rotate() // auto-orient ตาม EXIF
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
    return { buffer: out, mimetype: 'image/jpeg' }
  } catch (err) {
    console.error('compressImage failed, using original:', err.message)
    return { buffer, mimetype: originalMime }
  }
}
