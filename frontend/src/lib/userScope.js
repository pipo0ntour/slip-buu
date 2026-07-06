// ผูกข้อมูล localStorage กับ "ผู้ใช้ LINE คนปัจจุบัน" — เครื่องเดียวกันสลับหลายบัญชี
// ต้องไม่เห็นงบ/เป้า/อวตารของกันและกัน (เดิมคีย์กลางคีย์เดียว ใช้ร่วมกันทุกบัญชี)
//
// App.jsx เรียก setStorageUser(profile.userId) ทันทีหลัง LIFF init สำเร็จ — ก่อนหน้าเรนเดอร์หน้าใด ๆ
// จึงการันตีว่า store ทุกตัว (โหลดตอน mount ของหน้า) เห็นคีย์ประจำผู้ใช้เสมอ

let currentUserId = null

export function setStorageUser(userId) {
  currentUserId = userId || null
}

// ยังไม่รู้ผู้ใช้ (LIFF ล้มเหลว/ยังไม่ init) → ใช้คีย์กลางแบบเดิม (พฤติกรรมเดิม ไม่พัง)
const scopedKey = (base) => (currentUserId ? `${base}.${currentUserId}` : base)

export function getScopedItem(base) {
  const key = scopedKey(base)
  const val = localStorage.getItem(key)
  if (val != null || key === base) return val
  // ครั้งแรกหลังอัปเดต: ย้ายค่าจากคีย์กลางแบบเก่า (ไม่ผูกผู้ใช้) มาเป็นของบัญชีแรกที่เปิดแอป
  // — ผู้ใช้เดิม (เครื่องละคน ซึ่งเป็นเคสส่วนใหญ่) จะไม่เห็นข้อมูลหายหลังอัปเดต
  const legacy = localStorage.getItem(base)
  if (legacy != null) {
    localStorage.setItem(key, legacy)
    localStorage.removeItem(base)
  }
  return legacy
}

export function setScopedItem(base, value) {
  localStorage.setItem(scopedKey(base), value)
}

export function removeScopedItem(base) {
  localStorage.removeItem(scopedKey(base))
}
