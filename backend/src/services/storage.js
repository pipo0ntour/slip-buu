import { supabase } from './supabase.js'

// บักเก็ตรูปสลิปเป็น private — เก็บเฉพาะ path ใน DB แล้วออก signed URL อายุจำกัดตอนอ่าน
// (รูปสลิปมีชื่อคน/เลขบัญชีบางส่วน ห้ามเปิดดูได้ด้วยลิงก์เปล่า ๆ โดยไม่ผ่าน auth)
const BUCKET = 'slips'
const SIGNED_URL_TTL = 60 * 60 // 1 ชั่วโมง — นานพอสำหรับเปิดดูในแอป และหมดอายุเองถ้าลิงก์หลุด

// หา path ของไฟล์ในบักเก็ตจากแถวใน DB — แถวใหม่เก็บใน image_path,
// แถวเก่า (ก่อน migration 004) เก็บ public URL เต็มไว้ใน image_url
export function storagePathOf(row) {
  if (row.image_path) return row.image_path
  const m = (row.image_url || '').match(/\/object\/(?:public|sign)\/slips\/([^?]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// แทนที่ image_url ของทุกแถวด้วย signed URL (in place) — แถวที่หา path ไม่ได้คงค่าเดิมไว้
export async function attachSignedImageUrls(rows) {
  const paths = []
  const rowIndex = []
  rows.forEach((row, i) => {
    const p = storagePathOf(row)
    if (p) {
      paths.push(p)
      rowIndex.push(i)
    }
  })
  if (!paths.length) return rows

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL)
  if (error || !data) {
    console.error('createSignedUrls error:', error?.message)
    return rows
  }
  data.forEach((item, j) => {
    if (item.signedUrl) rows[rowIndex[j]].image_url = item.signedUrl
  })
  return rows
}
