import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { toNumber, normalizeBank, buildTransactionAt, clean } from './parse.js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// ───────── รายการ "backend" ที่หมุนใช้อ่านสลิป ─────────
// โควต้า free tier นับแยกต่อ (โมเดล/คีย์) — รวมหลายก้อนได้ throughput สูงขึ้น
// ลำดับ = ลำดับความสำคัญ: Gemini ก่อน (structured output คุณภาพดี) แล้วต่อด้วย Groq (โควต้าสูง)
const split = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean)

const GEMINI_MODELS = split(process.env.GEMINI_MODELS) .length
  ? split(process.env.GEMINI_MODELS)
  : ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
const GEMINI_RPM = Math.max(1, Number(process.env.GEMINI_MAX_RPM) || 4)

// Groq ใช้ได้หลายคีย์ (คั่นด้วย comma) — แต่ละคีย์เป็นโควต้าก้อนแยก
const GROQ_KEYS = split(process.env.GROQ_API_KEYS)
const GROQ_MODELS = split(process.env.GROQ_MODELS).length
  ? split(process.env.GROQ_MODELS)
  : ['meta-llama/llama-4-scout-17b-16e-instruct']
const GROQ_RPM = Math.max(1, Number(process.env.GROQ_MAX_RPM) || 25)

const backends = [
  ...GEMINI_MODELS.map((model) => ({ id: `gemini:${model}`, kind: 'gemini', model, rpm: GEMINI_RPM })),
  ...GROQ_KEYS.flatMap((apiKey, i) =>
    GROQ_MODELS.map((model) => ({ id: `groq#${i + 1}:${model}`, kind: 'groq', model, apiKey, rpm: GROQ_RPM }))
  ),
]

// รายชื่อ backend ที่หมุนได้ (ไว้ตรวจ config/debug ว่าคีย์ถูกอ่านครบ) — ไม่เปิดเผยคีย์
export const backendIds = () => backends.map((b) => b.id)

// ───────────────────────── Schema (Structured Output) ─────────────────────────
// บังคับให้ Gemini ตอบเป็น JSON ตาม schema นี้เสมอ — ไม่ต้อง parse เอง ไม่พังกลางทาง
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    isSlip: {
      type: SchemaType.BOOLEAN,
      description: 'true ถ้ารูปนี้เป็นสลิป/หลักฐานการโอนเงินจริง, false ถ้าเป็นรูปอื่น',
    },
    amount: {
      type: SchemaType.NUMBER,
      nullable: true,
      description: 'จำนวนเงินที่โอน เป็นตัวเลขล้วน ไม่มีลูกน้ำ ไม่มีหน่วย',
    },
    senderName: { type: SchemaType.STRING, nullable: true, description: 'ชื่อผู้โอน/ผู้ส่ง' },
    senderAccount: { type: SchemaType.STRING, nullable: true, description: 'เลขบัญชีหรือเบอร์ผู้โอน (เก็บตามที่เห็น อาจมี x ปิดบัง)' },
    receiverName: { type: SchemaType.STRING, nullable: true, description: 'ชื่อผู้รับเงิน' },
    receiverAccount: { type: SchemaType.STRING, nullable: true, description: 'เลขบัญชีหรือเบอร์ผู้รับ' },
    bankName: { type: SchemaType.STRING, nullable: true, description: 'ธนาคารผู้โอน ใช้ชื่อย่อภาษาไทย' },
    referenceNo: { type: SchemaType.STRING, nullable: true, description: 'เลขที่อ้างอิง / รหัสอ้างอิง' },
    transactionDate: { type: SchemaType.STRING, nullable: true, description: 'วันที่ทำรายการ รูปแบบ YYYY-MM-DD (ค.ศ.)' },
    transactionTime: { type: SchemaType.STRING, nullable: true, description: 'เวลาทำรายการ รูปแบบ HH:mm (24 ชม.)' },
    fee: { type: SchemaType.NUMBER, nullable: true, description: 'ค่าธรรมเนียม เป็นตัวเลข ถ้าไม่มีให้ 0' },
  },
  required: ['isSlip', 'amount'],
}

const PROMPT = `คุณคือระบบอ่านข้อมูลจากสลิปโอนเงินของธนาคารในประเทศไทยที่แม่นยำสูง
อ่านรูปภาพอย่างละเอียดแล้วดึงข้อมูลตามกฎต่อไปนี้:

1. amount = จำนวนเงินที่โอนจริง (ตัวเลขล้วน) เช่น "1,500.00 บาท" → 1500.00
   - ระวังอย่าสับสนกับยอดคงเหลือ (balance) หรือค่าธรรมเนียม ให้เอาเฉพาะ "จำนวนเงิน" ที่โอน

2. senderName / receiverName = ชื่อผู้โอน (จาก/From) และผู้รับ (ไปยัง/ถึง/To)
   - เก็บชื่อตามที่ปรากฏ รวมคำนำหน้า เช่น "นาย", "นาง", "น.ส." ถ้ามี

3. senderAccount / receiverAccount = เลขบัญชีหรือเบอร์พร้อมเพย์ (เก็บอักขระ x ที่ใช้ปิดบังไว้ด้วย)

4. bankName = ธนาคารของ"ผู้โอน" ใช้ชื่อย่อภาษาไทยมาตรฐานเท่านั้น:
   กสิกรไทย, ไทยพาณิชย์, กรุงเทพ, กรุงไทย, กรุงศรีอยุธยา, ทหารไทยธนชาต (ttb),
   ออมสิน, ธ.ก.ส., เกียรตินาคินภัทร, ซีไอเอ็มบีไทย, ยูโอบี, ทิสโก้,
   แลนด์ แอนด์ เฮ้าส์, ไอซีบีซีไทย, ไทยเครดิต, พร้อมเพย์
   - ดูจากโลโก้/สี/ชื่อบนสลิป ถ้าระบุไม่ได้ให้ใส่ null

5. referenceNo = เลขที่อ้างอิง / รหัสอ้างอิง / Reference No (มักเป็นตัวเลขหรือตัวอักษรยาว)

6. transactionDate = วันที่ทำรายการ รูปแบบ YYYY-MM-DD เป็นปี ค.ศ. เท่านั้น
   ⚠️ สำคัญมาก: สลิปไทยมักใช้ปี พ.ศ. ต้องลบ 543 เพื่อแปลงเป็น ค.ศ.
   ตัวอย่าง: "8 มิ.ย. 2568" → "2025-06-08" | "08/06/68" → "2025-06-08" | "2024-06-08" → คงเดิม
   ชื่อเดือนย่อไทย: ม.ค.=01 ก.พ.=02 มี.ค.=03 เม.ย.=04 พ.ค.=05 มิ.ย.=06 ก.ค.=07 ส.ค.=08 ก.ย.=09 ต.ค.=10 พ.ย.=11 ธ.ค.=12

7. transactionTime = เวลา รูปแบบ HH:mm แบบ 24 ชั่วโมง เช่น "14:30 น." → "14:30"

8. fee = ค่าธรรมเนียม (ตัวเลข) ถ้าไม่มีให้ใส่ 0

9. isSlip = true ถ้ารูปนี้เป็นสลิป/หลักฐานการโอนเงินจริง, false ถ้าเป็นรูปอื่น (เช่น รูปวิว รูปคน)

กฎสำคัญ:
- ห้ามเดาหรือสร้างข้อมูลที่ไม่ปรากฏในรูป ถ้าไม่พบให้ใส่ null
- ตอบเฉพาะข้อมูลที่อ่านได้จากรูปจริงเท่านั้น`

// Gemini บังคับโครงสร้างด้วย responseSchema อยู่แล้ว แต่ Groq (json_object mode) ต้องบอกคีย์ให้ชัด
const GROQ_JSON_HINT = `

ตอบกลับเป็น JSON object เท่านั้น ห้ามมีข้อความอื่นนอก JSON ใช้คีย์เหล่านี้:
{"isSlip": boolean, "amount": number|null, "senderName": string|null, "senderAccount": string|null, "receiverName": string|null, "receiverAccount": string|null, "bankName": string|null, "referenceNo": string|null, "transactionDate": "YYYY-MM-DD"|null, "transactionTime": "HH:mm"|null, "fee": number|null}`

// ───────────────────────── Helpers ─────────────────────────
// ฟังก์ชันแปลงวันที่/ตัวเลข/ชื่อธนาคาร ย้ายไปไว้ที่ parse.js (มีเทสคุม)

// ───────── คุมจังหวะเรียก ให้อยู่ใต้ลิมิต free tier ─────────
// แต่ละ backend มี sliding window ของตัวเอง (rpm ของมันเอง) + เวลา "พัก" (cooldown) เมื่อโดน 429
const WINDOW_MS = 60_000
const backendState = new Map(backends.map((b) => [b.id, { startTimes: [], cooldownUntil: 0 }]))
let chain = Promise.resolve() // คิวกลาง — กันหลาย request แย่งจองช่องพร้อมกัน

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// เลือก backend ตัวแรกที่ยังมีช่องว่าง — ถ้าไม่มีเลย คืนเวลาที่ต้องรอจนกว่าช่องแรกสุดจะว่าง
function pickBackend() {
  const now = Date.now()
  let earliestWait = Infinity
  for (const b of backends) {
    const st = backendState.get(b.id)
    if (now < st.cooldownUntil) {
      earliestWait = Math.min(earliestWait, st.cooldownUntil - now)
      continue
    }
    while (st.startTimes.length && now - st.startTimes[0] >= WINDOW_MS) st.startTimes.shift()
    if (st.startTimes.length < b.rpm) return { backend: b }
    earliestWait = Math.min(earliestWait, WINDOW_MS - (now - st.startTimes[0]))
  }
  return { waitMs: Math.max(earliestWait, 500) + 250 }
}

// จองช่องเรียกผ่านคิวกลาง — คืน backend ที่ได้ช่อง (รอเฉพาะเมื่อทุกตัวเต็ม/ติดพัก)
function acquireSlot() {
  const p = chain.then(async () => {
    for (;;) {
      const pick = pickBackend()
      if (pick.backend) {
        backendState.get(pick.backend.id).startTimes.push(Date.now())
        return pick.backend
      }
      await sleep(pick.waitMs)
    }
  })
  chain = p.then(() => {}, () => {}) // คิวต้องเดินต่อแม้งานก่อนหน้าพัง
  return p
}

// ดึงเวลารอที่ server แนะนำจากข้อความ error — "Please retry in 55.79s" / "retryDelay":"55s"
// / Groq "retry in Ns" (จาก retry-after header) คืน null ถ้าไม่พบ, cap ที่ 65 วิ
export function retryDelayMs(err) {
  const msg = err?.message || ''
  const m = msg.match(/retry in ([\d.]+)\s*s/i) || msg.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i)
  return m ? Math.min(Math.ceil(Number(m[1]) * 1000) + 500, 65_000) : null
}

// เรียก Gemini — บังคับ JSON ด้วย responseSchema คืน "ข้อความ JSON ดิบ"
async function callGemini(model, { promptText, imageBase64, mimeType }) {
  const m = genAI.getGenerativeModel({
    model,
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema },
  })
  const result = await m.generateContent([
    { text: promptText },
    { inlineData: { data: imageBase64, mimeType } },
  ])
  return result.response.text()
}

// เรียก Groq (OpenAI-compatible chat completions + vision) คืน "ข้อความ JSON ดิบ"
async function callGroq(model, apiKey, { promptText, imageBase64, mimeType }) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText + GROQ_JSON_HINT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const ra = res.headers.get('retry-after') // วินาทีที่ Groq บอกให้รอ (ตอนติด rate limit)
    const hint = ra ? ` retry in ${ra}s` : ''
    throw new Error(`Groq ${res.status}:${hint} ${body}`.slice(0, 500))
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || ''
  // เผื่อโมเดลห่อด้วย ```json ... ``` — ลอกออกก่อน parse
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

// ยิงโดยหมุน backend อัตโนมัติ: จองช่อง → เรียก → ถ้าตัวนั้นโควต้าเต็ม/ล่ม/ตอบไม่เป็น JSON
// พักมันไว้แล้ววนตัวถัดไป — คืน object ที่ parse แล้ว
async function generateWithFallback(payload) {
  let lastErr
  const maxAttempts = backends.length + 1 // เผื่อกลับมาลองรอบสองหลังพ้น cooldown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const backend = await acquireSlot()
    try {
      const text =
        backend.kind === 'groq'
          ? await callGroq(backend.model, backend.apiKey, payload)
          : await callGemini(backend.model, payload)
      return JSON.parse(text)
    } catch (err) {
      lastErr = err
      const msg = err.message || ''
      const st = backendState.get(backend.id)
      if (/429|quota|too many requests|rate limit/i.test(msg)) {
        // โควต้าตัวนี้เต็มจริง — เพดานรายวันพักยาว, รายนาทีพักตามที่ server บอก
        const cooldown = /per ?day|daily|rpd/i.test(msg) ? 10 * 60_000 : (retryDelayMs(err) ?? WINDOW_MS)
        st.cooldownUntil = Date.now() + cooldown
        console.warn(`${backend.id} โควต้าเต็ม — พัก ${Math.round(cooldown / 1000)} วิ แล้วใช้ตัวถัดไป`)
        continue
      }
      if (/50\d|timeout|fetch failed|JSON/i.test(msg)) {
        // ล่มชั่วคราว / ตอบไม่เป็น JSON — พักสั้น ๆ แล้ววนต่อ (อาจตัวเดิมหรือตัวถัดไป)
        st.cooldownUntil = Date.now() + (retryDelayMs(err) ?? 5_000)
        continue
      }
      throw err // error อื่น (เช่นคีย์ผิด) — วนต่อไปก็ไม่ช่วยอะไร
    }
  }
  throw lastErr
}

// ───────────────────────── Main ─────────────────────────

/**
 * อ่านสลิปด้วย Gemini/Groq (structured output + normalization)
 * หมุนหลาย backend อัตโนมัติเมื่อโควต้า free tier ของตัวหลักเต็ม — ดู backends ด้านบน
 * @returns {{
 *   isSlip:boolean, amount:number|null, senderName, senderAccount,
 *   receiverName, receiverAccount, bankName, referenceNo,
 *   transactionAt:string|null, fee:number|null, raw:object
 * }}
 */
export async function ocrSlip(imageBuffer, mimeType = 'image/jpeg') {
  const raw = await generateWithFallback({
    promptText: PROMPT,
    imageBase64: imageBuffer.toString('base64'),
    mimeType,
  })

  return {
    isSlip: raw.isSlip !== false,
    amount: toNumber(raw.amount),
    senderName: clean(raw.senderName),
    senderAccount: clean(raw.senderAccount),
    receiverName: clean(raw.receiverName),
    receiverAccount: clean(raw.receiverAccount),
    bankName: normalizeBank(clean(raw.bankName)),
    referenceNo: clean(raw.referenceNo),
    transactionAt: buildTransactionAt(raw.transactionDate, raw.transactionTime),
    fee: toNumber(raw.fee) ?? 0,
    raw,
  }
}
