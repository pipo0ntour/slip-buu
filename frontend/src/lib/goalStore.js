// เป้าหมายออมเงิน เก็บในเครื่อง (localStorage) — ยังไม่ต้องมีตาราง/คอลัมน์ใน DB
// shape: { target:number, label:string, deadline:string|null }
const KEY = 'slipbuu.goal'

export function loadGoal() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveGoal(goal) {
  try {
    localStorage.setItem(KEY, JSON.stringify(goal))
  } catch {
    /* noop */
  }
}

export function clearGoal() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
