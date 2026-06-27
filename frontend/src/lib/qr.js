import jsQR from 'jsqr'

// ถอด QR จากไฟล์รูปในเครื่อง (on-device) — คืน raw payload string หรือ null
//
// ใช้ทำ "เช็คสลิปซ้ำแบบฟรี": QR บนสลิปไทยเป็น QR สำหรับตรวจสลิป ซึ่งไม่ซ้ำกันต่อธุรกรรม
// → ใช้ payload ดิบเป็นกุญแจเช็คซ้ำได้แม่น (ไม่มี OCR เพี้ยน) โดยไม่ต้องแกะ format
// ถ้าอ่านไม่ได้ (ไม่มี QR / รูปเบลอ / เบราว์เซอร์ไม่รองรับ) → คืน null แล้วปล่อยให้ backend ใช้ Gemini ตามเดิม
export async function decodeQrFromFile(file) {
  try {
    if (!('createImageBitmap' in window)) return null
    const bitmap = await createImageBitmap(file)
    // ย่อด้านยาวสุดลงเพื่อความเร็ว (QR ยังอ่านออกที่ ~1000px) แล้วคืน memory ของ bitmap
    const MAX = 1000
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const { data } = ctx.getImageData(0, 0, w, h)
    const code = jsQR(data, w, h)
    const payload = code?.data?.trim()
    return payload && payload.length >= 12 ? payload : null // กันค่าสั้น/ขยะ
  } catch {
    return null
  }
}
