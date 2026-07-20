// ครั้งเดียว: ลบ "ไฟล์รูป" สลิป/ใบเสร็จ/สินค้าทั้งหมดออกจากบักเก็ต slips + null คอลัมน์รูปใน DB
// (โปรเจกต์เลิกเก็บรูปแล้ว — เก็บ "รายการ" ไว้ครบ ลบแค่ไฟล์รูป เพื่อไม่ให้มีรูปค้างใน storage)
//
//   node scripts/purge-slip-images.mjs         ลบจริง
//   node scripts/purge-slip-images.mjs --dry    ดูจำนวนก่อน ไม่ลบ
//
// ต้องมี SUPABASE_URL + SUPABASE_SERVICE_KEY ใน backend/.env (ชี้บักเก็ตเดียวกับที่ deploy)
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry')
const BUCKET = 'slips'
const PAGE = 500

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('❌ ไม่พบ SUPABASE_URL / SUPABASE_SERVICE_KEY ใน env — ยกเลิก')
  process.exit(1)
}
const supabase = createClient(url, key)

// path ในบักเก็ตจากแถว DB — แถวใหม่ใช้ image_path, แถวเก่าดึงจาก public/sign URL ใน image_url
function storagePathOf(row) {
  if (row.image_path) return row.image_path
  const m = (row.image_url || '').match(/\/object\/(?:public|sign)\/slips\/([^?]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// อัปเดต null คอลัมน์รูป — เผื่อ DB ยังไม่มี image_purged_at (migration 006) ให้ถอยไป null แค่ path/url
async function nullImageCols(ids) {
  let { error } = await supabase
    .from('slips')
    .update({ image_path: null, image_url: null, image_purged_at: new Date().toISOString() })
    .in('id', ids)
  if (error && /column|could not find|schema cache/i.test(error.message)) {
    ;({ error } = await supabase.from('slips').update({ image_path: null, image_url: null }).in('id', ids))
  }
  return error
}

// ── Phase A: ลบไฟล์ที่อ้างอิงจากแถวใน DB แล้ว null คอลัมน์รูป (idempotent: รอบถัดไปจะไม่หยิบแถวเดิม) ──
async function purgeFromDb() {
  let rowsDone = 0
  let filesDone = 0
  for (;;) {
    const { data: rows, error } = await supabase
      .from('slips')
      .select('id, image_url, image_path')
      .or('image_path.not.is.null,image_url.not.is.null')
      .limit(PAGE)
    if (error) {
      console.error('select error:', error.message)
      break
    }
    if (!rows?.length) break

    const ids = rows.map((r) => r.id)
    const paths = rows.map(storagePathOf).filter(Boolean)

    if (DRY) {
      console.log(`[dry] Phase A: จะลบ ${paths.length} ไฟล์ / null ${ids.length} แถว (ตัวอย่างรอบแรก)`)
      return { rows: ids.length, files: paths.length }
    }

    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
      if (rmErr) console.warn('storage remove:', rmErr.message) // best-effort — ยัง null ต่อ ไม่งั้นวนไม่จบ
      else filesDone += paths.length
    }
    const upErr = await nullImageCols(ids)
    if (upErr) {
      console.error('update error:', upErr.message)
      break
    }
    rowsDone += ids.length
    console.log(`Phase A: null แล้ว ${rowsDone} แถว / ลบไฟล์ ${filesDone}`)
    if (rows.length < PAGE) break
  }
  return { rows: rowsDone, files: filesDone }
}

// ── Phase B: กวาดไฟล์ orphan ที่เหลือในบักเก็ต (ไม่ถูกอ้างจากแถวใด เช่นอัปสำเร็จแต่ insert ล้ม) ──
// รูปเก็บใต้โฟลเดอร์ {line_user_id}/... — list ราก → แต่ละโฟลเดอร์ → ลบไฟล์ข้างใน (best-effort)
async function sweepBucket() {
  let removed = 0
  const { data: entries, error } = await supabase.storage.from(BUCKET).list('', { limit: 10000 })
  if (error) {
    console.warn('list bucket root:', error.message)
    return removed
  }
  for (const e of entries || []) {
    // โฟลเดอร์ผู้ใช้จะไม่มี metadata (id === null); ข้าม entry ที่เป็นไฟล์ระดับรากไปก่อน (ไม่มีในแอปนี้)
    if (e.id) continue
    const prefix = e.name
    const { data: files, error: e2 } = await supabase.storage.from(BUCKET).list(prefix, { limit: 10000 })
    if (e2) {
      console.warn(`list ${prefix}:`, e2.message)
      continue
    }
    const paths = (files || []).filter((x) => x.id).map((x) => `${prefix}/${x.name}`)
    if (!paths.length) continue
    if (DRY) {
      console.log(`[dry] Phase B: orphan ใน ${prefix}/ = ${paths.length} ไฟล์`)
      removed += paths.length
      continue
    }
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
    if (rmErr) console.warn(`remove ${prefix}:`, rmErr.message)
    else {
      removed += paths.length
      console.log(`Phase B: sweep ${prefix}/ ลบ ${paths.length} ไฟล์`)
    }
  }
  return removed
}

console.log(DRY ? '🔎 DRY RUN — ไม่ลบจริง\n' : '🧹 เริ่มลบรูปทั้งหมด (เก็บรายการไว้ครบ)\n')
const a = await purgeFromDb()
const bRemoved = await sweepBucket()
console.log('\n─────────────────────────────')
console.log(`Phase A (จาก DB): null ${a.rows} แถว, ลบไฟล์ ${a.files}`)
console.log(`Phase B (orphan sweep): ลบไฟล์ ${bRemoved}`)
console.log(DRY ? '(dry run — ยังไม่ลบจริง รันซ้ำโดยไม่ใส่ --dry เพื่อลบ)' : '✅ เสร็จ')
