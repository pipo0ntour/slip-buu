import { supabase } from './supabase.js'
import { storagePathOf } from './storage.js'

// ── ลบรูปสลิปที่เก็บเกินกำหนดอัตโนมัติ — ลบแค่ "ไฟล์รูป" แต่ "เก็บรายการไว้ครบ" ──
// รูปสลิปมีชื่อคน/เลขบัญชีบางส่วน ไม่ต้องเก็บถาวร: เก็บพอให้ย้อนดู แล้วลบเพื่อความเป็นส่วนตัว + ประหยัด storage
// กลไก: สแกนเป็นรอบ (เกาะ pattern เดียวกับ keepAlive.js) หาแถวที่ created_at เกิน N วัน และ "ยังมีรูป"
//        → ลบ object ในบักเก็ต slips แล้ว null image_path/image_url + ตั้ง image_purged_at = now()
//        (frontend ใช้ image_purged_at โชว์ป้าย "รูปหมดอายุถูกลบ" แยกจากรายการที่ไม่มีรูปแต่แรก)
// idempotent + self-healing: สแกนด้วย created_at < cutoff ทุกรอบ — แถวที่ purge แล้วจะ image คอลัมน์ว่าง
//   จึงไม่ถูกหยิบซ้ำ และถ้า host หลับพลาดรอบ รอบถัดไปเก็บกวาดต่อเอง

// อายุรูปแยกตามชนิด: รูป "สินค้า" (รายการกรอกเอง source='manual') เก็บสั้นกว่า — เป็นแค่หลักฐานชั่วคราว
//   ส่วนสลิป/ใบเสร็จเก็บนานกว่า (ไว้ย้อนตรวจ) ทั้งคู่ลบแค่ "ไฟล์รูป" แต่เก็บ "รายการ" ไว้ครบ
const SLIP_DAYS = Math.max(1, Number(process.env.IMAGE_RETENTION_DAYS) || 7)
const PRODUCT_DAYS = Math.max(1, Number(process.env.IMAGE_RETENTION_PRODUCT_DAYS) || 3)
const SCAN_HOURS = Math.max(1, Number(process.env.IMAGE_RETENTION_SCAN_HOURS) || 24)
const SCAN_INTERVAL_MS = SCAN_HOURS * 60 * 60 * 1000
const BATCH = 200 // แถวต่อรอบย่อย — กันลบ/อัปเดตทีละมากเกินไป
const MAX_BATCHES = 25 // เพดานต่อการสแกน 1 ครั้ง (≈ 5000 รูป) ที่เหลือรอบหน้าเก็บต่อ

// ลบรูป "กลุ่มหนึ่ง" ที่เก็บเกิน days วัน — applyFilter เลือกชนิดแถว (เช่น เฉพาะ source='manual')
// idempotent: หยิบเฉพาะแถว image_purged_at = null + ยังมีรูป → กลุ่ม 7 วันจะไม่ชนรูปสินค้าที่กลุ่ม 3 วันลบไปแล้ว
async function purgeGroup(label, days, applyFilter) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  let total = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    let q = supabase
      .from('slips')
      .select('id, image_url, image_path')
      .lt('created_at', cutoff)
      .is('image_purged_at', null)
      .or('image_path.not.is.null,image_url.not.is.null')
      .order('created_at', { ascending: true })
      .limit(BATCH)
    q = applyFilter(q)
    const { data: rows, error } = await q
    if (error) {
      console.warn(`image-retention[${label}] select error:`, error.message)
      return total
    }
    if (!rows?.length) break

    const ids = rows.map((r) => r.id)
    const paths = rows.map(storagePathOf).filter(Boolean)
    if (paths.length) {
      // best-effort เหมือน DELETE route — ลบไฟล์พลาดก็ยัง mark ต่อ ไม่งั้นจะวนหยิบแถวเดิมไม่จบ
      const { error: rmErr } = await supabase.storage.from('slips').remove(paths)
      if (rmErr) console.warn(`image-retention[${label}] storage remove error:`, rmErr.message)
    }

    const { error: upErr } = await supabase
      .from('slips')
      .update({ image_path: null, image_url: null, image_purged_at: new Date().toISOString() })
      .in('id', ids)
    if (upErr) {
      console.warn(`image-retention[${label}] update error:`, upErr.message)
      return total
    }

    total += ids.length
    if (rows.length < BATCH) break
  }
  if (total) console.log(`image-retention[${label}]: ลบรูปเกิน ${days} วันแล้ว ${total} รูป (เก็บรายการไว้ครบ)`)
  return total
}

async function purgeOnce() {
  // 1) รูปสินค้า (กรอกเอง) — อายุสั้น 3 วัน
  await purgeGroup('product', PRODUCT_DAYS, (q) => q.eq('source', 'manual'))
  // 2) ที่เหลือ (สลิป/ใบเสร็จ/โน้ต) — อายุยาว 7 วัน (รูปสินค้าที่เก่ากว่า 3 วันถูกลบไปแล้ว จึงไม่ถูกหยิบซ้ำ)
  await purgeGroup('slip', SLIP_DAYS, (q) => q)
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
  console.log(`image-retention เปิดอยู่ — รูปสินค้า ${PRODUCT_DAYS} วัน / สลิป ${SLIP_DAYS} วัน, สแกนทุก ${SCAN_HOURS} ชม.`)
}
