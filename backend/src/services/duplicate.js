import crypto from 'crypto'
import { supabase } from './supabase.js'

export function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// ตรวจซ้ำ "ภายในสมุดบัญชีของผู้ใช้คนนั้น" เท่านั้น (.eq line_user_id) —
// สลิปใบเดียวกันอาจถูกบันทึกโดยทั้งคนโอนและคนรับ ซึ่งเป็นคนละสมุดบัญชีกัน ไม่ถือว่าซ้ำ

export async function checkByHash(imageHash, lineUserId) {
  if (!imageHash || !lineUserId) return false
  const { data, error } = await supabase
    .from('slips')
    .select('id')
    .eq('line_user_id', lineUserId)
    .eq('image_hash', imageHash)
    .limit(1)
  if (error) {
    console.error('checkByHash error:', error.message)
    return false
  }
  return data.length > 0
}

export async function checkByRefNo(referenceNo, lineUserId) {
  // ข้ามค่าว่าง/สั้นเกินไป — กัน false positive จากเลขอ้างอิงที่อ่านมาไม่ครบ
  const ref = (referenceNo || '').trim()
  if (ref.length < 6 || !lineUserId) return false

  const { data, error } = await supabase
    .from('slips')
    .select('id')
    .eq('line_user_id', lineUserId)
    .eq('reference_no', ref)
    .limit(1)
  if (error) {
    console.error('checkByRefNo error:', error.message)
    return false
  }
  return data.length > 0
}
