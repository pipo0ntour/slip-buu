// ย่อรูปในเครื่อง "ก่อนอัปโหลด" — ลดขนาดไฟล์ที่ส่งขึ้น backend อย่างมาก
//
// คอขวดหลักของ "อ่านนาน" บนมือถือคือการอัปโหลดรูปดิบจากกล้อง (2–8MB) ผ่านเน็ตมือถือ
// ย่อด้านยาวสุดเหลือ ~maxDim px + เข้ารหัส JPEG → ไฟล์เหลือ ~100–150KB อัปโหลดเร็วขึ้นหลายเท่า
// แถม vision อ่านเร็วขึ้น (image token น้อยลง)
//
// ใช้กับงานที่ "ไม่ต้องการความคมระดับอ่านตัวอักษร" เท่านั้น (เช่นดูว่าเป็นสินค้าอะไร)
// ห้ามใช้กับสลิป/โน้ต ที่ต้องคมเพื่อแยกอักษรไทยที่คล้ายกัน
//
// imageOrientation:'from-image' = ใส่การหมุนตาม EXIF ลงในพิกเซลเลย (canvas จะ strip EXIF ทิ้ง
// ถ้าไม่ทำ รูปจากกล้องมือถืออาจตะแคง) — เบราว์เซอร์ที่ไม่รองรับจะข้ามออปชันนี้ไปเอง
// ถ้าเบราว์เซอร์ไม่รองรับ createImageBitmap / ย่อพลาด → คืนไฟล์เดิม (backend ย่อซ้ำให้อยู่แล้ว ไม่พัง flow)
export async function shrinkImageForUpload(file, maxDim = 1024, quality = 0.72) {
  try {
    if (!file || !('createImageBitmap' in window)) return file
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1) { bitmap.close?.(); return file } // เล็กกว่า maxDim อยู่แล้ว — ไม่ต้องย่อ
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob ? new File([blob], 'upload.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}
