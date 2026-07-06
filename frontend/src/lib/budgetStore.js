// งบประมาณรายเดือน "ต่อหมวด" เก็บในเครื่อง (localStorage) — เหมือน goalStore
// ยังไม่ต้องมีตาราง/คอลัมน์ใน DB (ยอดใช้จริงคำนวณจาก /api/report ที่มีอยู่แล้ว)
// คีย์ผูกกับผู้ใช้ LINE คนปัจจุบัน (ดู userScope.js) — สลับบัญชีในเครื่องเดียวกันข้อมูลไม่ปนกัน
// shape: { [category: string]: number }  เช่น { 'ค่าอาหาร': 3000, 'ค่าเดินทาง': 1000 } (บาท/เดือน)
import { getScopedItem, setScopedItem, removeScopedItem } from './userScope'

const KEY = 'slipbuu.budgets'

export function loadBudgets() {
  try {
    const raw = getScopedItem(KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
  } catch {
    return {}
  }
}

export function saveBudgets(budgets) {
  try {
    // เก็บเฉพาะหมวดที่ตั้งวงเงินเป็นเลขบวก — ตั้ง 0/ว่าง = เอาออก (ถือว่าไม่ตั้งงบหมวดนั้น)
    const clean = {}
    for (const [cat, v] of Object.entries(budgets || {})) {
      const n = Number(v)
      if (n > 0) clean[cat] = n
    }
    setScopedItem(KEY, JSON.stringify(clean))
  } catch {
    /* noop */
  }
}

export function clearBudgets() {
  try {
    removeScopedItem(KEY)
  } catch {
    /* noop */
  }
}
