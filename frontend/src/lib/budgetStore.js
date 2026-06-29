// งบประมาณรายเดือน "ต่อหมวด" เก็บในเครื่อง (localStorage) — เหมือน goalStore
// ยังไม่ต้องมีตาราง/คอลัมน์ใน DB (ยอดใช้จริงคำนวณจาก /api/report ที่มีอยู่แล้ว)
// shape: { [category: string]: number }  เช่น { 'ค่าอาหาร': 3000, 'ค่าเดินทาง': 1000 } (บาท/เดือน)
const KEY = 'slipbuu.budgets'

export function loadBudgets() {
  try {
    const raw = localStorage.getItem(KEY)
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
    localStorage.setItem(KEY, JSON.stringify(clean))
  } catch {
    /* noop */
  }
}

export function clearBudgets() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
