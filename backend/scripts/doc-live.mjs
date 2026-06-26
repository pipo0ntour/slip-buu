// (ชั่วคราว) เทสกันรีเกรสชัน unified ocrDocument — ยิงผ่าน "ระบบจริง" (backend rotation: Gemini→Groq)
// กับ สลิปจริงจาก Supabase + ใบเสร็จ local เพื่อยืนยันว่า docKind แยกถูก และสลิปเดิมไม่แย่ลง
import 'dotenv/config'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { ocrDocument, backendIds } from '../src/services/gemini.js'

console.log('backends:', backendIds().join(' | '), '\n')

const NSLIP = Number(process.argv[2]) || 3 // จำนวนสลิปจริงที่ดึงมาเทส (กันเปลือง quota)
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

function show(tag, name, r) {
  console.log(`── [${tag}] ${name} → docKind=${r.docKind} | amount=${r.amount ?? '—'} | วันเวลา=${r.transactionAt ?? '—'}`)
  if (r.docKind === 'slip')
    console.log(`     ผู้โอน=${r.senderName ?? '—'} → ผู้รับ=${r.receiverName ?? '—'} | ธนาคาร=${r.bankName ?? '—'} | ref=${r.referenceNo ?? '—'}`)
  else if (r.docKind === 'receipt')
    console.log(`     ร้าน=${r.merchant ?? '—'} | หมวด=${r.category ?? '—'} | จ่าย=${r.paymentMethod ?? '—'} | สินค้า=${r.itemsSummary ?? '—'}`)
}

// ── สลิปจริงจาก Supabase ──
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const { data: rows } = await supabase
  .from('slips').select('image_path').not('image_path', 'is', null)
  .order('created_at', { ascending: false }).limit(NSLIP)
for (const row of rows || []) {
  const { data: file, error } = await supabase.storage.from('slips').download(row.image_path)
  if (error) { console.warn('ดาวน์โหลดสลิปพลาด:', error.message); continue }
  const buf = Buffer.from(await file.arrayBuffer())
  try { show('SLIP', basename(row.image_path), await ocrDocument(buf, 'image/jpeg')) }
  catch (e) { console.error('  ERROR:', e.message) }
}

// ── ใบเสร็จ local ──
const dir = join(import.meta.dirname, '..', 'receipt-samples')
const files = existsSync(dir) ? readdirSync(dir).filter((f) => IMG_EXT.has(extname(f).toLowerCase())).slice(0, NSLIP) : []
for (const f of files) {
  try { show('RECEIPT', f, await ocrDocument(readFileSync(join(dir, f)), 'image/jpeg')) }
  catch (e) { console.error('  ERROR:', e.message) }
}
