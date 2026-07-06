// เก็บ "ลักษณะอวตาร" ไว้ในเครื่อง (ก้อนเล็ก = แค่ค่า attribute) แยกออกจากตัว render DiceBear
// ที่หนัก → ไฟล์นี้ import ได้ตั้งแต่หน้าแรกโดยไม่ดึงไลบรารีอวตารมาถ่วง bundle
// คีย์ผูกกับผู้ใช้ LINE คนปัจจุบัน (ดู userScope.js) — สลับบัญชีในเครื่องเดียวกันอวตารไม่ปนกัน
import { getScopedItem, setScopedItem, removeScopedItem } from './userScope'

const STORAGE_KEY = 'slipbuu.avatar'

export function loadAvatarFace() {
  try {
    const raw = getScopedItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveAvatarFace(face) {
  try {
    setScopedItem(STORAGE_KEY, JSON.stringify(face))
  } catch {
    /* localStorage เต็ม/ปิด → ข้ามไป (ไม่ critical) */
  }
}

export function clearAvatarFace() {
  try {
    removeScopedItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}
