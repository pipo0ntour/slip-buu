import sharp from 'sharp'

/**
 * บีบอัด + ปรับทิศทางรูปสลิปก่อนส่ง OCR และเก็บลง Storage
 * - หมุนรูปอัตโนมัติตาม EXIF (กล้องมือถือมักฝังข้อมูลทิศทางไว้) ช่วยให้ OCR แม่นขึ้น
 * - ย่อด้านยาวสุดไม่เกิน 1600px (พอสำหรับอ่านตัวอักษร แต่ไฟล์เล็กลงมาก)
 * - แปลงเป็น JPEG quality 82 (mozjpeg) ลดขนาดไฟล์ ~70-80%
 *
 * ถ้า compress ล้มเหลว จะคืน buffer เดิมเพื่อไม่ให้ flow พัง
 * @returns {{ buffer: Buffer, mimetype: string }}
 */
export async function compressImage(buffer, originalMime = 'image/jpeg') {
  try {
    const out = await sharp(buffer)
      .rotate() // auto-orient ตาม EXIF
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    return { buffer: out, mimetype: 'image/jpeg' }
  } catch (err) {
    console.error('compressImage failed, using original:', err.message)
    return { buffer, mimetype: originalMime }
  }
}
