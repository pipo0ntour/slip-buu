import { supabase } from './supabase.js'
import { storagePathOf } from './storage.js'

// ── ลบรูปสลิปที่เก็บเกินกำหนดอัตโนมัติ — ลบแค่ "ไฟล์รูป" แต่ "เก็บรายการไว้ครบ" ──
// รูปสลิปมีชื่อคน/เลขบัญชีบางส่วน ไม่ต้องเก็บถาวร: เก็บพอให้ย้อนดู แล้วลบเพื่อความเป็นส่วนตัว + ประหยัด storage
// กลไก: สแกนเป็นรอบ (เกาะ pattern เดียวกับ keepAlive.js) หาแถวที่ created_at เกิน N วัน และ "ยังมีรูป"
//        → ลบ object ในบักเก็ต slips แล้ว null image_path/image_url + ตั้ง image_purged_at = now()
//        (frontend ใช้ image_purged_at โชว์ป้าย "รูปหมดอายุถูกลบ" แยกจากรายการที่ไม่มีรูปแต่แรก)
// idempotent + self-healing: สแกนด้วย created_at < cutoff ทุกรอบ — แถวที่ purge แล้วจะ image คอลัมน์ว่าง
//   จึงไม่ถูกหยิบซ้ำ และถ้า host หลับพลาดรอบ รอบถัดไปเก็บกวาดต่อเอง

const DAYS = Math.max(1, Number(process.env.IMAGE_RETENTION_DAYS) || 7)
const SCAN_HOURS = Math.max(1, Number(process.env.IMAGE_RETENTION_SCAN_HOURS) || 24)
const SCAN_INTERVAL_MS = SCAN_HOURS * 60 * 60 * 1000
const BATCH = 200 // แถวต่อรอบย่อย — กันลบ/อัปเดตทีละมากเกินไป
const MAX_BATCHES = 25 // เพดานต่อการสแกน 1 ครั้ง (≈ 5000 รูป) ที่เหลือรอบหน้าเก็บต่อ

async function purgeOnce() {
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()
  let total = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    // หาแถวเก่าพอ + ยังมีรูป (image_path ใหม่ หรือ legacy image_url) + ยังไม่เคย purge
    const { data: rows, error } = await supabase
      .from('slips')
      .select('id, image_url, image_path')
      .lt('created_at', cutoff)
      .is('image_purged_at', null)
      .or('image_path.not.is.null,image_url.not.is.null')
      .order('created_at', { ascending: true })
      .limit(BATCH)
    if (error) {
      console.warn('image-retention select error:', error.message)
      return total
    }
    if (!rows?.length) break

    const ids = rows.map((r) => r.id)
    const paths = rows.map(storagePathOf).filter(Boolean)
    if (paths.length) {
      // best-effort เหมือน DELETE route — ลบไฟล์พลาดก็ยัง mark ต่อ ไม่งั้นจะวนหยิบแถวเดิมไม่จบ
      const { error: rmErr } = await supabase.storage.from('slips').remove(paths)
      if (rmErr) console.warn('image-retention storage remove error:', rmErr.message)
    }

    const { error: upErr } = await supabase
      .from('slips')
      .update({ image_path: null, image_url: null, image_purged_at: new Date().toISOString() })
      .in('id', ids)
    if (upErr) {
      console.warn('image-retention update error:', upErr.message)
      return total
    }

    total += ids.length
    if (rows.length < BATCH) break
  }
  if (total) console.log(`image-retention: ลบรูปที่เก็บเกิน ${DAYS} วันแล้ว ${total} รูป (เก็บรายการไว้ครบ)`)
  return total
}

/**
 * เริ่มงานลบรูปหมดอายุเป็นรอบ — ลบครั้งแรก 60 วิหลังบูต (ให้ server พร้อม) แล้วทุก ๆ SCAN_HOURS ชั่วโมง
 * ใช้ .unref() ให้ timer ไม่กัน process ปิดเอง (express server คุม lifecycle อยู่แล้ว เหมือน keepAlive)
 */
export function startImageRetention() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.warn('image-retention ปิดอยู่ — ไม่พบ SUPABASE_URL/SUPABASE_SERVICE_KEY')
    return
  }
  const run = () => purgeOnce().catch((e) => console.warn('image-retention failed:', e.message))
  setTimeout(run, 60_000).unref?.()
  setInterval(run, SCAN_INTERVAL_MS).unref?.()
  console.log(`image-retention เปิดอยู่ — ลบรูปเกิน ${DAYS} วัน, สแกนทุก ${SCAN_HOURS} ชม.`)
}
