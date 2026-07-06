// เป้าหมายออมเงิน เก็บในเครื่อง (localStorage) — ยังไม่ต้องมีตาราง/คอลัมน์ใน DB
// คีย์ผูกกับผู้ใช้ LINE คนปัจจุบัน (ดู userScope.js) — สลับบัญชีในเครื่องเดียวกันข้อมูลไม่ปนกัน
// shape: { target:number, label:string, deadline:string|null }
import { getScopedItem, setScopedItem, removeScopedItem } from './userScope'

const KEY = 'slipbuu.goal'

export function loadGoal() {
  try {
    const raw = getScopedItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveGoal(goal) {
  try {
    setScopedItem(KEY, JSON.stringify(goal))
  } catch {
    /* noop */
  }
}

export function clearGoal() {
  try {
    removeScopedItem(KEY)
  } catch {
    /* noop */
  }
}
