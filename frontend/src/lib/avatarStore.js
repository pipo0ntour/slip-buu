// เก็บ "ลักษณะอวตาร" ไว้ในเครื่อง (ก้อนเล็ก = แค่ค่า attribute) แยกออกจากตัว render DiceBear
// ที่หนัก → ไฟล์นี้ import ได้ตั้งแต่หน้าแรกโดยไม่ดึงไลบรารีอวตารมาถ่วง bundle
const STORAGE_KEY = 'slipbuu.avatar'

export function loadAvatarFace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveAvatarFace(face) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(face))
  } catch {
    /* localStorage เต็ม/ปิด → ข้ามไป (ไม่ critical) */
  }
}

export function clearAvatarFace() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}
