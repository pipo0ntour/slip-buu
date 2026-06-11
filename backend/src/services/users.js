import { supabase } from './supabase.js'

// สร้าง/อัปเดต row ใน users ก่อน insert slip — จำเป็นเพราะ slips.line_user_id มี FK อ้างถึง users
// (เรียกตอน upload เท่านั้น) เก็บชื่อ/รูปจากโปรไฟล์ LINE ไว้ใช้แสดงผลด้วย
export async function upsertUser({ userId, displayName, pictureUrl } = {}) {
  if (!userId) return
  const { error } = await supabase
    .from('users')
    .upsert(
      { line_user_id: userId, display_name: displayName, picture_url: pictureUrl },
      { onConflict: 'line_user_id' }
    )
  if (error) console.error('upsertUser error:', error.message)
}
