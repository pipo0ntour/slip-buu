// ทดสอบ ocrSlip ผ่านโมดูลจริง (รันมือ) — ดึงสลิปจริงจาก Supabase แล้วอ่านผ่านระบบหมุน backend
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { ocrDocument, backendIds } from '../src/services/gemini.js'

console.log('backends:', backendIds().join(' | '))

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const { data: rows } = await supabase
  .from('slips')
  .select('image_path')
  .not('image_path', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1)

const { data: file } = await supabase.storage.from('slips').download(rows[0].image_path)
const buf = Buffer.from(await file.arrayBuffer())

const t0 = Date.now()
const out = await ocrDocument(buf, 'image/jpeg')
console.log(Date.now() - t0, 'ms')
console.log(JSON.stringify({ ...out, raw: undefined }, null, 2))
