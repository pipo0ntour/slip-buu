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
// รองรับ 2 ชนิดเอกสารใน schema เดียว (call เดียว แยกด้วย docKind):
//   slip = สลิป/หลักฐานการโอนเงิน | receipt = ใบเสร็จ/ใบกำกับภาษี/ตั๋วโดยสาร
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    docKind: {
      type: SchemaType.STRING,
      description: '"slip" = สลิปโอนเงิน, "receipt" = ใบเสร็จ/ใบกำกับภาษี/ตั๋วโดยสาร, "other" = รูปอื่น',
    },
    amount: {
      type: SchemaType.NUMBER,
      nullable: true,
      description: 'slip = จำนวนเงินที่โอน, receipt = ยอดสุทธิที่จ่ายจริง (ตัวเลขล้วน ไม่มีลูกน้ำ/หน่วย)',
    },
    // ── ฟิลด์ของสลิปโอนเงิน ──
    senderName: { type: SchemaType.STRING, nullable: true, description: 'ชื่อผู้โอน/ผู้ส่ง (เฉพาะสลิป)' },
    senderAccount: { type: SchemaType.STRING, nullable: true, description: 'เลขบัญชีหรือเบอร์ผู้โอน (เก็บตามที่เห็น อาจมี x ปิดบัง)' },
    receiverName: { type: SchemaType.STRING, nullable: true, description: 'ชื่อผู้รับเงิน (เฉพาะสลิป)' },
    receiverAccount: { type: SchemaType.STRING, nullable: true, description: 'เลขบัญชีหรือเบอร์ผู้รับ' },
    bankName: { type: SchemaType.STRING, nullable: true, description: 'ธนาคารผู้โอน ใช้ชื่อย่อภาษาไทย (เฉพาะสลิป)' },
    referenceNo: { type: SchemaType.STRING, nullable: true, description: 'เลขที่อ้างอิงการโอน (สลิป) หรือเลขที่ใบเสร็จ (receipt)' },
    fee: { type: SchemaType.NUMBER, nullable: true, description: 'ค่าธรรมเนียม เป็นตัวเลข ถ้าไม่มีให้ 0 (เฉพาะสลิป)' },
    // ── ฟิลด์ของใบเสร็จ/ตั๋ว ──
    merchant: { type: SchemaType.STRING, nullable: true, description: 'ชื่อร้าน/ผู้ให้บริการ เช่น 7-Eleven, BTS (เฉพาะ receipt)' },
    category: { type: SchemaType.STRING, nullable: true, description: 'หมวดรายจ่าย: ค่าอาหาร|ค่าเดินทาง|ค่าของ|ค่าน้ำค่าไฟ|ค่าส่ง|สุขภาพ|ค่าเช่า (เฉพาะ receipt)' },
    paymentMethod: { type: SchemaType.STRING, nullable: true, description: 'วิธีจ่าย: เงินสด|บัตร|ทรูมันนี่|พร้อมเพย์|คิวอาร์ (เฉพาะ receipt)' },
    items: {
      type: SchemaType.ARRAY,
      nullable: true,
      description: 'รายการสินค้าในใบเสร็จ (เฉพาะ receipt) — ใช้ช่วยคำนวณยอด/ทำสรุป',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, nullable: true },
          price: { type: SchemaType.NUMBER, nullable: true },
        },
      },
    },
    // ── ร่วม ──
    transactionDate: { type: SchemaType.STRING, nullable: true, description: 'วันที่ทำรายการ รูปแบบ YYYY-MM-DD (ค.ศ.)' },
    transactionTime: { type: SchemaType.STRING, nullable: true, description: 'เวลาทำรายการ รูปแบบ HH:mm (24 ชม.)' },
  },
  required: ['docKind', 'amount'],
}

const PROMPT = `คุณคือระบบอ่านเอกสารการเงินของไทยที่แม่นยำสูง รองรับ 2 ชนิด อ่านรูปอย่างละเอียดแล้ว
ขั้นแรกกำหนด docKind ก่อน:
- "slip" = สลิป/หลักฐานการโอนเงิน (โอนผ่านแอปธนาคาร/พร้อมเพย์/เป๋าตัง/ทรูมันนี่) — มีผู้โอน→ผู้รับ, เลขบัญชี/พร้อมเพย์, เลขที่อ้างอิงการโอน, โลโก้แอปธนาคาร
- "receipt" = ใบเสร็จ/ใบกำกับภาษี/ตั๋วโดยสาร (7-Eleven, ห้าง, ร้านอาหาร, BTS/MRT ฯลฯ) — มีชื่อร้าน, รายการสินค้า+ราคา, ยอดรวม/VAT/เงินทอน หรือเป็นตั๋วค่าโดยสาร
- "other" = ไม่ใช่ทั้งสอง (รูปวิว/คน/อื่น ๆ) → amount = null

แล้วดึงข้อมูลตามชนิด — ฟิลด์ที่ไม่เกี่ยวกับชนิดนั้นให้ใส่ null:

═══ ถ้า docKind = "slip" (สลิปโอนเงิน) — ใส่ merchant/category/paymentMethod/items = null ═══

1. amount = จำนวนเงินที่โอนจริง (ตัวเลขล้วน) เช่น "1,500.00 บาท" → 1500.00
   - ระวังอย่าสับสนกับยอดคงเหลือ (balance) หรือค่าธรรมเนียม ให้เอาเฉพาะ "จำนวนเงิน" ที่โอน
   - สลิปเป๋าตัง/คนละครึ่ง/ไทยช่วยไทย ที่มีส่วนลดรัฐ: ใช้ "จำนวนเงินที่ชำระ" (ยอดสุทธิที่จ่ายจริง)
     ไม่ใช่ "ค่าสินค้า/บริการ" (ยอดก่อนหักสิทธิ) เช่น ค่าสินค้า 205 − สิทธิ 123 = จ่ายจริง 82 → 82

2. senderName / receiverName = ชื่อผู้โอน (จาก/From) และผู้รับ (ไปยัง/ถึง/To)
   - เก็บชื่อตามที่ปรากฏ รวมคำนำหน้า เช่น "นาย", "นาง", "น.ส." ถ้ามี
   - สลิปกระเป๋าเงิน (เป๋าตัง/ทรูมันนี่ ฯลฯ) มักเรียงบนลงล่างมีลูกศร ↓ คั่น:
     รายการ"บนสุด" = ผู้โอน (senderName), รายการ"ใต้ลูกศร" = ผู้รับ (receiverName)
     ⚠️ ห้ามสลับ และถ้าเห็นชื่อผู้โอนด้านบนต้องอ่านมาเสมอ ห้ามปล่อย senderName เป็น null ทั้งที่มีชื่อ
   - ชื่อร้านค้า (เช่น "ก๋วยเตี๋ยว...", โลโก้ถุงเงิน) ที่อยู่ฝั่งผู้รับ = receiverName ไม่ใช่ผู้โอน
   - ⚠️ อักษรไทยบางคู่หน้าตาคล้ายกันมาก ต่างกันแค่หางหรือเส้นเล็ก ๆ ให้พิจารณาเส้นอย่างละเอียดก่อนเลือก
     พยัญชนะ: ฏ(ปฏัก)/ฐ(ฐาน)/ฎ(ชฎา), ฌ/ญ, ผ/ฝ, พ/ฟ, ถ/ภ, ด/ค/ต, น/ม
     สระหน้า: ใ(ไม้ม้วน)/ไ(ไม้มลาย) — ดูรอยม้วนด้านบน "ใ" มีหางม้วน ส่วน "ไ" ไม่มี
     ตัวอย่าง: "ณัฎฐา" (ตัวที่สามคือ ฎ ชฎา ไม่ใช่ ฐ) — อย่าอ่านควบเป็น "ณัฐฐา"
     ตัวอย่าง: "จันทร์ใด" (ใ ไม้ม้วน) — อย่าอ่านเป็น "จันทร์ได" (ไ ไม้มลาย)

3. senderAccount / receiverAccount = เลขบัญชีหรือเบอร์พร้อมเพย์ (เก็บอักขระ x ที่ใช้ปิดบังไว้ด้วย)

4. bankName = ธนาคาร/แอปของ"ผู้โอน" ใช้ชื่อย่อภาษาไทยมาตรฐานเท่านั้น:
   กสิกรไทย, ไทยพาณิชย์, กรุงเทพ, กรุงไทย, กรุงศรีอยุธยา, ทหารไทยธนชาต (ttb),
   ออมสิน, ธ.ก.ส., เกียรตินาคินภัทร, ซีไอเอ็มบีไทย, ยูโอบี, ทิสโก้,
   แลนด์ แอนด์ เฮ้าส์, ไอซีบีซีไทย, ไทยเครดิต, เป๋าตัง, ทรูมันนี่, พร้อมเพย์
   - ดูจากโลโก้/สี/ชื่อบนสลิป ถ้าระบุไม่ได้ให้ใส่ null
   - แอปเป๋าตัง (G-Wallet ของกรุงไทย): มีคำว่า "เป๋าตัง"/"G-Wallet"/โลโก้ตัว "G" สีน้ำเงิน
     หรือเป็นโครงการรัฐ (คนละครึ่ง/ไทยช่วยไทย/เที่ยวด้วยกัน) → bankName = "เป๋าตัง"
   - ⚠️ ห้ามใส่ "พร้อมเพย์" เพียงเพราะหาชื่อธนาคารไม่เจอ — ใส่ "พร้อมเพย์" เฉพาะเมื่อมีคำว่า
     "พร้อมเพย์"/"PromptPay" ปรากฏบนสลิปจริง ๆ เท่านั้น มิฉะนั้นใส่ null

5. referenceNo = เลขที่อ้างอิง / รหัสอ้างอิง / Reference No (มักเป็นตัวเลขหรือตัวอักษรยาว)

6. fee = ค่าธรรมเนียม (ตัวเลข) ถ้าไม่มีให้ใส่ 0
   (วันที่/เวลา ใช้กฎร่วมด้านล่าง)

═══ ถ้า docKind = "receipt" (ใบเสร็จ/ใบกำกับภาษี/ตั๋วโดยสาร) — ใส่ sender/receiver/bank/fee = null ═══

R1. amount = ยอดเงิน "สุทธิที่จ่ายจริง" (ตัวเลขล้วน)
   - ใช้ยอด "รวมทั้งสิ้น / ยอดสุทธิ / รวมเงิน / Total / Net" (ยอดหลังหักส่วนลดแล้ว) เท่านั้น
   - ⚠️ ห้ามเอา: ยอดก่อนหักส่วนลด (Sub Total/ยอดรวม), "เงินสด/รับเงิน/Cash", "เงินทอน/Change", ยอด/แต้มสะสม
   - ตั๋ว (BTS/MRT/รถเมล์/รถไฟ/เรือ) = ค่าโดยสารที่พิมพ์บนตั๋ว
R2. merchant = ชื่อร้าน/ผู้ให้บริการ ตามหัวบิล/โลโก้ เช่น "7-Eleven", "Lotus's", "BTS", "แมคโดนัลด์"
R3. referenceNo = เลขที่ใบเสร็จ / เลขกำกับภาษี / เลขเครื่อง POS / เลขตั๋ว (ถ้ามี)
R4. paymentMethod = วิธีจ่ายถ้าระบุ: "เงินสด"/"บัตร"/"ทรูมันนี่"/"พร้อมเพย์"/"คิวอาร์" ไม่ระบุ = null
R5. category = เดาหมวดรายจ่าย เลือกจากชุดนี้เท่านั้น (ใกล้สุด) ไม่เข้าเลย = null:
   ค่าอาหาร, ค่าเดินทาง, ค่าของ, ค่าน้ำค่าไฟ, ค่าส่ง, สุขภาพ, ค่าเช่า
   แนวทาง: ร้านอาหาร/กาแฟ/ของกิน = ค่าอาหาร | สะดวกซื้อของใช้/เครื่องเขียน = ค่าของ |
   BTS/MRT/แท็กซี่/น้ำมัน = ค่าเดินทาง | ร้านยา/คลินิก/รพ. = สุขภาพ
R6. items = รายการสินค้าทีละชิ้น {name, price = ราคารวมของรายการนั้น} (ช่วยให้คำนวณยอดแม่นขึ้น)
   ตั๋ว/บริการที่ไม่มีรายการสินค้า ให้ items = []

═══ ร่วมทั้งสองชนิด ═══

6. transactionDate = วันที่ทำรายการ รูปแบบ YYYY-MM-DD เป็นปี ค.ศ. เท่านั้น
   ⚠️ สำคัญมาก: เอกสารไทยมักใช้ปี พ.ศ. ต้องลบ 543 เพื่อแปลงเป็น ค.ศ.
   - แบบ พ.ศ. เต็ม 4 หลัก: "8 มิ.ย. 2568" → "2025-06-08" | ค.ศ.อยู่แล้ว "2024-06-08" → คงเดิม
   - แบบ DD/MM/YY (พบบ่อยบนใบเสร็จ ปี พ.ศ. 2 หลัก): ปีเต็ม พ.ศ. = 2500 + YY แล้วลบ 543
     เช่น "04/02/65" → พ.ศ.2565 → "2022-02-04" | "11/11/56" → "2013-11-11" (ลำดับ วัน/เดือน/ปี ห้ามสลับ)
   - ⚠️ ใบเสร็จ: เอาวันที่ "ทำรายการ" (บรรทัดเดียวกับ R#/TID/เวลา) เท่านั้น ห้ามเอาวันหมดเขตคูปอง/วันสมาชิก
   ชื่อเดือนย่อไทย: ม.ค.=01 ก.พ.=02 มี.ค.=03 เม.ย.=04 พ.ค.=05 มิ.ย.=06 ก.ค.=07 ส.ค.=08 ก.ย.=09 ต.ค.=10 พ.ย.=11 ธ.ค.=12

7. transactionTime = เวลา รูปแบบ HH:mm แบบ 24 ชั่วโมง เช่น "14:30 น." → "14:30"

กฎสำคัญ:
- ห้ามเดาหรือสร้างข้อมูลที่ไม่ปรากฏในรูป ถ้าไม่พบให้ใส่ null
- ตอบเฉพาะข้อมูลที่อ่านได้จากรูปจริงเท่านั้น`

// Gemini บังคับโครงสร้างด้วย responseSchema อยู่แล้ว แต่ Groq (json_object mode) ต้องบอกคีย์ให้ชัด
const GROQ_JSON_HINT = `

ตอบกลับเป็น JSON object เท่านั้น ห้ามมีข้อความอื่นนอก JSON ใช้คีย์เหล่านี้ (ฟิลด์ที่ไม่เกี่ยวกับ docKind ให้ใส่ null):
{"docKind": "slip"|"receipt"|"other", "amount": number|null, "senderName": string|null, "senderAccount": string|null, "receiverName": string|null, "receiverAccount": string|null, "bankName": string|null, "referenceNo": string|null, "fee": number|null, "merchant": string|null, "category": string|null, "paymentMethod": string|null, "items": [{"name": string, "price": number}]|null, "transactionDate": "YYYY-MM-DD"|null, "transactionTime": "HH:mm"|null}`

// ───────────────────────── Helpers ─────────────────────────
// ฟังก์ชันแปลงวันที่/ตัวเลข/ชื่อธนาคาร ย้ายไปไว้ที่ parse.js (มีเทสคุม)

// ───────── คุมจังหวะเรียก ให้อยู่ใต้ลิมิต free tier ─────────
// แต่ละ backend มี sliding window ของตัวเอง (rpm ของมันเอง) + เวลา "พัก" (cooldown) เมื่อโดน 429
const WINDOW_MS = 60_000
const backendState = new Map(backends.map((b) => [b.id, { startTimes: [], cooldownUntil: 0 }]))
let chain = Promise.resolve() // คิวกลาง — กันหลาย request แย่งจองช่องพร้อมกัน

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// เลือก backend แบบ least-loaded: ในบรรดาตัวที่ยังมีช่องว่าง เลือกตัวที่ "เต็มน้อยสุด"
// เทียบสัดส่วนความจุของมันเอง (startTimes.length / rpm) → เกลี่ยโหลดให้คีย์ที่รับได้มากกว่า
// (เช่น Groq rpm สูง) ได้สัดส่วนมากกว่าโดยอัตโนมัติ ไม่ให้คีย์ใดเต็ม quota ก่อนเวลา
// โหลดเท่ากัน (เช่นทราฟฟิกน้อย ทุกตัวว่าง load=0) → ใช้ลำดับเดิม (Gemini ก่อน) รักษาคุณภาพ OCR
// ถ้าไม่มีตัวว่างเลย คืนเวลาที่ต้องรอจนกว่าช่องแรกสุดจะว่าง
function pickBackend() {
  const now = Date.now()
  let earliestWait = Infinity
  let best = null
  let bestLoad = Infinity
  for (const b of backends) {
    const st = backendState.get(b.id)
    if (now < st.cooldownUntil) {
      earliestWait = Math.min(earliestWait, st.cooldownUntil - now)
      continue
    }
    while (st.startTimes.length && now - st.startTimes[0] >= WINDOW_MS) st.startTimes.shift()
    if (st.startTimes.length < b.rpm) {
      const load = st.startTimes.length / b.rpm // < ใช้ strict ด้านล่าง → โหลดเท่ากันคงตัวลำดับแรกไว้
      if (load < bestLoad) { bestLoad = load; best = b }
    } else {
      earliestWait = Math.min(earliestWait, WINDOW_MS - (now - st.startTimes[0]))
    }
  }
  if (best) return { backend: best }
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
// schema ส่งต่อ payload ได้ (อ่านสลิป vs อ่านโน้ต ใช้คนละ schema) ดีฟอลต์ = schema สลิป
// อินพุตเป็นได้ทั้งรูป (imageBase64) หรือข้อความล้วน (userText) — โน้ตจากพิมพ์/พูดใช้ userText
async function callGemini(model, { promptText, imageBase64, mimeType, userText, schema = responseSchema }) {
  const m = genAI.getGenerativeModel({
    model,
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  })
  const parts = [{ text: promptText }]
  if (imageBase64) parts.push({ inlineData: { data: imageBase64, mimeType } })
  else if (userText) parts.push({ text: `ข้อความจริง: "${userText}"` })
  const result = await m.generateContent(parts)
  return result.response.text()
}

// เรียก Groq (OpenAI-compatible chat completions + vision) คืน "ข้อความ JSON ดิบ"
// groqHint บอกคีย์ JSON ที่ต้องการ (สลิป vs โน้ต ใช้คนละชุดคีย์) ดีฟอลต์ = คีย์สลิป
async function callGroq(model, apiKey, { promptText, imageBase64, mimeType, userText, groqHint = GROQ_JSON_HINT }) {
  // อินพุตรูป → ส่ง vision (text + image_url), อินพุตข้อความ → ส่ง text ล้วน (โน้ตพิมพ์/พูด)
  const content = imageBase64
    ? [
        { type: 'text', text: promptText + groqHint },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ]
    : promptText + groqHint + (userText ? `\n\nข้อความจริง: "${userText}"` : '')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
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

// หมวดรายจ่ายมาตรฐาน (ตรงกับ CATEGORIES ฝั่ง frontend) — บังคับค่าที่ AI เดามาให้อยู่ในชุดนี้
// ค่าที่อยู่นอกชุด → null (frontend dropdown จะได้ไม่เพี้ยน, ผู้ใช้เลือกเองได้)
const RECEIPT_CATEGORIES = new Set(['ค่าของ', 'ค่าส่ง', 'ค่าอาหาร', 'ค่าน้ำค่าไฟ', 'ค่าเช่า', 'ค่าเดินทาง', 'สุขภาพ'])
const normalizeCategory = (c) => (RECEIPT_CATEGORIES.has(c) ? c : null)

// สรุปชื่อสินค้าในใบเสร็จเป็นข้อความสั้น ๆ (ไว้เก็บใน note) — เอา 4 ชื่อแรก + "ฯลฯ" ถ้ามีต่อ
function summarizeItems(items) {
  const names = (Array.isArray(items) ? items : [])
    .map((it) => clean(it?.name))
    .filter(Boolean)
  if (!names.length) return null
  const head = names.slice(0, 4).join(', ')
  return names.length > 4 ? `${head} ฯลฯ (${names.length} รายการ)` : head
}

/**
 * อ่านเอกสารการเงิน (สลิป หรือ ใบเสร็จ/ตั๋ว) ด้วย Gemini/Groq — แยกชนิดด้วย docKind ใน call เดียว
 * หมุนหลาย backend อัตโนมัติเมื่อโควต้า free tier ของตัวหลักเต็ม — ดู backends ด้านบน
 * @returns {{
 *   docKind:'slip'|'receipt'|'other', amount:number|null, transactionAt:string|null, raw:object,
 *   senderName, senderAccount, receiverName, receiverAccount, bankName, referenceNo, fee,   // slip
 *   merchant, category, paymentMethod, itemsSummary                                          // receipt
 * }}
 */
export async function ocrDocument(imageBuffer, mimeType = 'image/jpeg') {
  const raw = await generateWithFallback({
    promptText: PROMPT,
    imageBase64: imageBuffer.toString('base64'),
    mimeType,
  })

  const docKind = raw.docKind === 'receipt' ? 'receipt' : raw.docKind === 'other' ? 'other' : 'slip'
  return {
    docKind,
    amount: toNumber(raw.amount),
    transactionAt: buildTransactionAt(raw.transactionDate, raw.transactionTime),
    // ── สลิป ──
    senderName: clean(raw.senderName),
    senderAccount: clean(raw.senderAccount),
    receiverName: clean(raw.receiverName),
    receiverAccount: clean(raw.receiverAccount),
    bankName: normalizeBank(clean(raw.bankName)),
    referenceNo: clean(raw.referenceNo),
    fee: toNumber(raw.fee) ?? 0,
    // ── ใบเสร็จ/ตั๋ว ──
    merchant: clean(raw.merchant),
    category: normalizeCategory(clean(raw.category)),
    paymentMethod: clean(raw.paymentMethod),
    itemsSummary: summarizeItems(raw.items),
    raw,
  }
}

// ───────────────────── อ่านโน้ตลายมือ → หลายรายการ ─────────────────────
// บังคับให้คืน array ของรายการ (description + amount + type) แตกจากโน้ตที่จดเอง
const noteSchema = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      description: 'รายการเงินที่อ่านได้จากโน้ต ทีละชิ้น',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          description: { type: SchemaType.STRING, nullable: true, description: 'รายละเอียดว่าเป็นค่าอะไร/รับจากอะไร' },
          amount: { type: SchemaType.NUMBER, description: 'จำนวนเงินของรายการนี้ ตัวเลขล้วน' },
          type: { type: SchemaType.STRING, nullable: true, description: '"income" = รายรับ, "expense" = รายจ่าย' },
        },
        required: ['amount'],
      },
    },
  },
  required: ['items'],
}

const NOTE_PROMPT = `คุณคือระบบอ่านสมุดบันทึกรายรับรายจ่ายที่เขียนด้วยลายมือ (ภาษาไทย) อย่างแม่นยำ
อ่านรูปแล้วแตกออกเป็น "รายการ" ทีละบรรทัด/ทีละชิ้น ตามกฎ:

1. แต่ละรายการประกอบด้วย:
   - description = สิ่งที่จ่ายหรือรับ เช่น "ค่าข้าว", "ค่าน้ำมัน", "ขายของ" เก็บข้อความสั้น ๆ ตามที่เขียน
   - amount = จำนวนเงินของรายการนั้น (ตัวเลขล้วน ไม่มีลูกน้ำ ไม่มีหน่วย)
   - type = "income" ถ้าเป็นเงินเข้า/รายรับ (ขายของ ได้เงิน รับเงิน ฝากเข้า),
            "expense" ถ้าเป็นเงินออก/รายจ่าย (ซื้อ จ่าย ค่า...) — ถ้าไม่แน่ใจให้เดาเป็น "expense"

2. ข้ามบรรทัดที่ไม่ใช่รายการเงิน เช่น หัวข้อ วันที่ ยอดรวม/รวมทั้งหมด เส้นขีด — เอาเฉพาะบรรทัดที่มีจำนวนเงินชัดเจน
3. ถ้าบรรทัดมีหลายตัวเลข ให้เอา "จำนวนเงินของรายการนั้น" ไม่ใช่ยอดสะสม/ยอดรวมท้ายตาราง
4. ห้ามสร้างรายการที่ไม่มีในรูป อ่านได้กี่รายการก็ใส่เท่านั้น ตามลำดับที่เขียนจากบนลงล่าง`

const NOTE_GROQ_HINT = `

ตอบกลับเป็น JSON object เท่านั้น ห้ามมีข้อความอื่นนอก JSON ใช้รูปแบบนี้:
{"items": [{"description": string|null, "amount": number, "type": "income"|"expense"}]}`

/**
 * อ่านโน้ตลายมือ แล้วแตกเป็นรายการธุรกรรมหลายชิ้น (หมุน backend อัตโนมัติเหมือน ocrSlip)
 * @returns {{ description:string|null, amount:number, type:'income'|'expense' }[]}
 */
export async function ocrNote(imageBuffer, mimeType = 'image/jpeg') {
  const raw = await generateWithFallback({
    promptText: NOTE_PROMPT,
    imageBase64: imageBuffer.toString('base64'),
    mimeType,
    schema: noteSchema,
    groqHint: NOTE_GROQ_HINT,
  })

  const list = Array.isArray(raw?.items) ? raw.items : []
  return list
    .map((it) => ({
      description: clean(it.description),
      amount: toNumber(it.amount),
      type: it.type === 'income' ? 'income' : 'expense',
    }))
    .filter((it) => it.amount != null && it.amount > 0)
}

// ───────────── แปลง "ข้อความ" (พิมพ์/พูดผ่านคีย์บอร์ด) → หลายรายการ ─────────────
// ใช้ schema เดียวกับโน้ต แต่ป้อนเป็นข้อความล้วน — prompt ผ่านการทดสอบเลขคำไทย/เลขควบ/แยกรายการแล้ว
const NOTE_TEXT_PROMPT = `คุณคือระบบแยก "รายการรับ-จ่าย" จากข้อความที่ผู้ใช้พิมพ์หรือพูดผ่านการบอกเสียง (ภาษาไทย)
ข้อความอาจเป็นประโยคยาวก้อนเดียว ไม่มีวรรค ไม่มีเครื่องหมายวรรคตอน และตัวเลขอาจเขียนเป็นคำ
อ่าน "ข้อความจริงที่ผู้ใช้ให้" แล้วแตกเป็นรายการ ตามกฎ:

1. แต่ละรายการ:
   - description = สิ่งที่จ่าย/รับ สั้น ๆ ตามที่พูด
   - amount = จำนวนเงิน เป็นตัวเลขล้วนเสมอ ถ้าเขียนเป็นคำไทยให้แปลงเป็นเลข
     (เจ็ดสิบ=70, สี่ร้อยหก=406, สองพัน=2000, สามหมื่น=30000)
   - อ่าน "กลุ่มคำตัวเลขที่ติดกัน" เป็นจำนวนเดียว จนกว่าจะเจอคำที่ "ไม่ใช่ตัวเลข"
     เลขควบแบบไทยห้อยหลักท้าย: ตัวเลขเดี่ยวที่ตามหน่วยใหญ่ทันที = หลักที่รองลงมา
     เช่น เก้าพันสาม=9300, สองพันสี่=2400, หมื่นสอง=12000, สี่หมื่นสอง=42000, พันหก=1600
     ⚠️ อย่าหยุดอ่านกลางจำนวนแล้วตัดเลขท้ายเป็นรายการใหม่ (กลุ่มเลขติดกัน = จำนวนเดียว)
   - type = "income" ถ้าเงินเข้า (ขาย/ได้/รับ/โบนัส/ฝากเข้า/เงินเดือน),
            "expense" ถ้าเงินออก (จ่าย/ซื้อ/ค่า/ผ่อน...) — ไม่แน่ใจให้เดา "expense"

2. ตัดรายการใหม่ "เฉพาะเมื่อ" เจอคำขึ้นต้นรายการหรือชื่อสิ่งของคั่น เช่น จ่าย/ซื้อ/ค่า/ได้/ขาย/รับ หรือชื่อของ
   ⚠️ ถ้าไม่มีคำพวกนี้คั่น ห้ามตัดกลุ่มตัวเลขออกเป็นหลายรายการ
   เช่น "น้ำยี่สิบ" กับ "ขนมสิบห้า" = คนละรายการ (มีชื่อของคั่น) แต่ "สองพันสี่" = รายการเดียว (ไม่มีคำคั่น)
3. ถ้าหลายอย่างใช้เงินก้อนเดียว "รวม" กัน ให้เป็น 1 รายการ amount = ยอดรวมนั้น และข้ามยอดรวมที่ซ้ำ
4. ถ้าระบุจำนวนหน่วย × ราคาต่อหน่วย ให้คิดเป็นยอดรวม = จำนวน × ราคา
5. ข้ามคำที่ไม่ใช่จำนวนเงิน (เช่น เช้านี้/วันนี้/แล้วก็/เอ่อ/มั้ง)
6. ถ้าข้อความไม่มีรายการเงินเลย ให้คืน items เป็น []
7. ใช้เฉพาะข้อมูลจาก "ข้อความจริง" ที่ส่งให้เท่านั้น ห้ามนำตัวอย่างในกฎมาตอบ`

/**
 * แปลงข้อความที่ผู้ใช้พิมพ์/พูด เป็นรายการธุรกรรมหลายชิ้น (หมุน backend อัตโนมัติเหมือน ocrNote)
 * @returns {{ description:string|null, amount:number, type:'income'|'expense' }[]}
 */
export async function parseNoteText(text) {
  const raw = await generateWithFallback({
    promptText: NOTE_TEXT_PROMPT,
    userText: text,
    schema: noteSchema,
    groqHint: NOTE_GROQ_HINT,
  })

  const list = Array.isArray(raw?.items) ? raw.items : []
  return list
    .map((it) => ({
      description: clean(it.description),
      amount: toNumber(it.amount),
      type: it.type === 'income' ? 'income' : 'expense',
    }))
    .filter((it) => it.amount != null && it.amount > 0)
}

// ───────────── อ่านใบหน้าจากเซลฟี่ → ลักษณะ (ไว้ประกอบอวตารการ์ตูน SVG ฝั่ง frontend) ─────────────
// เก็บเป็น "ลักษณะเชิงความหมาย" (enum) ไม่ใช่ค่าของไลบรารีโดยตรง — frontend เป็นคนแมปเป็นชิ้นส่วนอวตาร
// คุมค่าที่รับได้แน่นอน (normalize ใน analyzeFace) จะได้ไม่พังเวลาโมเดลตอบนอกชุด
const FACE_ENUMS = {
  skinTone: ['fair', 'light', 'medium', 'tan', 'brown', 'dark'],
  hairColor: ['black', 'darkBrown', 'brown', 'blonde', 'auburn', 'red', 'gray', 'white', 'dyed'],
  hairLength: ['bald', 'short', 'medium', 'long'],
  hairStyle: ['straight', 'wavy', 'curly', 'coily', 'bun', 'ponytail', 'covered'],
  facialHair: ['none', 'moustache', 'beard'],
  headwear: ['none', 'hat', 'hijab'],
  expression: ['smile', 'neutral'],
}

const faceSchema = {
  type: SchemaType.OBJECT,
  properties: {
    isFace: { type: SchemaType.BOOLEAN, description: 'true ถ้ารูปนี้มีใบหน้าคนชัดเจน, false ถ้าไม่มี' },
    skinTone: { type: SchemaType.STRING, nullable: true, description: 'โทนสีผิว: fair|light|medium|tan|brown|dark' },
    hairColor: { type: SchemaType.STRING, nullable: true, description: 'สีผม: black|darkBrown|brown|blonde|auburn|red|gray|white|dyed (dyed = ทำสีแฟชั่น เช่นชมพู/ฟ้า)' },
    hairLength: { type: SchemaType.STRING, nullable: true, description: 'ความยาวผม: bald|short|medium|long' },
    hairStyle: { type: SchemaType.STRING, nullable: true, description: 'ทรง/ลักษณะผม: straight|wavy|curly|coily|bun|ponytail|covered (covered = คลุมผม/โพกหัว)' },
    glasses: { type: SchemaType.BOOLEAN, nullable: true, description: 'ใส่แว่นตาหรือไม่' },
    facialHair: { type: SchemaType.STRING, nullable: true, description: 'หนวดเครา: none|moustache|beard' },
    headwear: { type: SchemaType.STRING, nullable: true, description: 'สิ่งสวมหัว: none|hat|hijab' },
    expression: { type: SchemaType.STRING, nullable: true, description: 'สีหน้า: smile (ยิ้ม) | neutral (เฉย)' },
  },
  required: ['isFace'],
}

const FACE_PROMPT = `คุณคือระบบอธิบายลักษณะใบหน้าจากรูปถ่าย เพื่อนำไปสร้าง "อวตารการ์ตูน" ที่หน้าตาคล้ายเจ้าของรูป
ดูรูปแล้วระบุลักษณะที่ "เห็นชัดที่สุด" ตามชุดค่าที่กำหนดเท่านั้น ห้ามคิดค่าใหม่นอกชุด:
- skinTone (โทนผิว): fair, light, medium, tan, brown, dark
- hairColor (สีผม): black, darkBrown, brown, blonde, auburn, red, gray, white, dyed
- hairLength (ความยาวผม): bald, short, medium, long
- hairStyle (ทรงผม): straight, wavy, curly, coily, bun, ponytail, covered
- glasses (แว่นตา): true / false
- facialHair (หนวดเครา): none, moustache, beard
- headwear (สวมหัว): none, hat, hijab
- expression (สีหน้า): smile, neutral

กฎ:
- เลือกค่าที่ใกล้เคียงที่สุดเสมอ ถ้าไม่แน่ใจให้เดาค่าที่เป็นไปได้มากสุด ห้ามปล่อยว่างถ้าเห็นใบหน้า
- ถ้าผมถูกคลุม/โพก ให้ hairStyle = covered และ headwear ตามที่เห็น
- ถ้ารูปไม่มีใบหน้าคนชัดเจน ให้ isFace = false
- อธิบายเฉพาะสิ่งที่เห็นจริงในรูป ไม่เพิ่มอคติเรื่องเพศ/เชื้อชาติเกินจากที่ปรากฏ`

const FACE_GROQ_HINT = `

ตอบกลับเป็น JSON object เท่านั้น ห้ามมีข้อความอื่นนอก JSON ใช้คีย์เหล่านี้ (ค่าต้องอยู่ในชุดที่กำหนด):
{"isFace": boolean, "skinTone": "fair|light|medium|tan|brown|dark", "hairColor": "black|darkBrown|brown|blonde|auburn|red|gray|white|dyed", "hairLength": "bald|short|medium|long", "hairStyle": "straight|wavy|curly|coily|bun|ponytail|covered", "glasses": boolean, "facialHair": "none|moustache|beard", "headwear": "none|hat|hijab", "expression": "smile|neutral"}`

// บังคับค่าให้อยู่ในชุด enum — ค่านอกชุด/ว่าง → ใช้ fallback (ปลอดภัยต่อการแมปฝั่ง frontend)
const pickEnum = (val, allowed, fallback) =>
  allowed.includes(val) ? val : fallback

/**
 * อ่านเซลฟี่ → ลักษณะใบหน้าเชิงความหมาย (หมุน backend อัตโนมัติเหมือน ocrSlip)
 * frontend เอาไปแมปเป็นชิ้นส่วนอวตาร DiceBear เอง
 * @returns {{ isFace:boolean, skinTone, hairColor, hairLength, hairStyle, glasses, facialHair, headwear, expression }}
 */
export async function analyzeFace(imageBuffer, mimeType = 'image/jpeg') {
  const raw = await generateWithFallback({
    promptText: FACE_PROMPT,
    imageBase64: imageBuffer.toString('base64'),
    mimeType,
    schema: faceSchema,
    groqHint: FACE_GROQ_HINT,
  })

  return {
    isFace: raw.isFace !== false,
    skinTone: pickEnum(raw.skinTone, FACE_ENUMS.skinTone, 'light'),
    hairColor: pickEnum(raw.hairColor, FACE_ENUMS.hairColor, 'black'),
    hairLength: pickEnum(raw.hairLength, FACE_ENUMS.hairLength, 'short'),
    hairStyle: pickEnum(raw.hairStyle, FACE_ENUMS.hairStyle, 'straight'),
    glasses: raw.glasses === true,
    facialHair: pickEnum(raw.facialHair, FACE_ENUMS.facialHair, 'none'),
    headwear: pickEnum(raw.headwear, FACE_ENUMS.headwear, 'none'),
    expression: pickEnum(raw.expression, FACE_ENUMS.expression, 'smile'),
  }
}
