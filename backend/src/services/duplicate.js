import crypto from 'crypto'
import { supabase } from './supabase.js'

export function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export async function checkByHash(imageHash) {
  if (!imageHash) return false
  const { data, error } = await supabase
    .from('slips')
    .select('id')
    .eq('image_hash', imageHash)
    .limit(1)
  if (error) {
    console.error('checkByHash error:', error.message)
    return false
  }
  return data.length > 0
}

export async function checkByRefNo(referenceNo) {
  // ข้ามค่าว่าง/สั้นเกินไป — กัน false positive จากเลขอ้างอิงที่อ่านมาไม่ครบ
  const ref = (referenceNo || '').trim()
  if (ref.length < 6) return false

  const { data, error } = await supabase
    .from('slips')
    .select('id')
    .eq('reference_no', ref)
    .limit(1)
  if (error) {
    console.error('checkByRefNo error:', error.message)
    return false
  }
  return data.length > 0
}
