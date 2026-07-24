// ⚠️ LEGACY — พึ่ง "รูปสลิปใน Supabase" (image_path) ซึ่งเลิกเก็บแล้ว → ปัจจุบันไม่มีรูปให้ดึง
//    เก็บไว้เป็นตัวอย่างยิง Groq vision + json_object mode
// สคริปต์ทดสอบจริง (รันมือ ไม่ใช่ unit test) — ดึงสลิปจริงจาก Supabase แล้วยิงผ่าน Groq
// ใช้ยืนยันว่า vision + json_object mode + คุณภาพการอ่านใช้ได้ ก่อน deploy
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const key = (process.env.GROQ_API_KEYS || '').split(',')[0].trim()
const model = 'meta-llama/llama-4-scout-17b-16e-instruct'

// เอาสลิปล่าสุดที่มีรูป
const { data: rows } = await supabase
  .from('slips')
  .select('image_path, reference_no')
  .not('image_path', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1)
const path = rows?.[0]?.image_path
if (!path) { console.error('ไม่พบสลิปที่มีรูป'); process.exit(1) }

const { data: file, error } = await supabase.storage.from('slips').download(path)
if (error) { console.error('ดาวน์โหลดรูปไม่สำเร็จ:', error.message); process.exit(1) }
const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')

const prompt = `อ่านสลิปโอนเงินไทยใบนี้ ตอบเป็น JSON object เท่านั้น คีย์:
{"isSlip": boolean, "amount": number|null, "senderName": string|null, "receiverName": string|null, "bankName": string|null, "referenceNo": string|null, "transactionDate": "YYYY-MM-DD"|null, "transactionTime": "HH:mm"|null}
แปลงปี พ.ศ. เป็น ค.ศ. (ลบ 543)`

const t0 = Date.now()
const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
      ],
    }],
  }),
})
console.log('HTTP', res.status, '|', Date.now() - t0, 'ms')
const data = await res.json()
if (!res.ok) { console.error('ERROR:', JSON.stringify(data).slice(0, 400)); process.exit(1) }
console.log('ผลที่อ่านได้:', data.choices[0].message.content)
