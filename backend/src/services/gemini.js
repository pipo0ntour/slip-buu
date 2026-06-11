import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const MODEL = 'gemini-2.5-flash'

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

// ───────────────────────── Helpers ─────────────────────────

const THAI_MONTHS = {
  'ม.ค.': 1, 'มกราคม': 1, 'ก.พ.': 2, 'กุมภาพันธ์': 2, 'มี.ค.': 3, 'มีนาคม': 3,
  'เม.ย.': 4, 'เมษายน': 4, 'พ.ค.': 5, 'พฤษภาคม': 5, 'มิ.ย.': 6, 'มิถุนายน': 6,
  'ก.ค.': 7, 'กรกฎาคม': 7, 'ส.ค.': 8, 'สิงหาคม': 8, 'ก.ย.': 9, 'กันยายน': 9,
  'ต.ค.': 10, 'ตุลาคม': 10, 'พ.ย.': 11, 'พฤศจิกายน': 11, 'ธ.ค.': 12, 'ธันวาคม': 12,
}

// ชื่อธนาคารมาตรฐาน — จับคำสำคัญแล้วแปลงให้เป็นชื่อย่อเดียวกันเสมอ
const BANK_MAP = [
  [/kbank|กสิกร|kasikorn/i, 'กสิกรไทย'],
  [/scb|ไทยพาณิชย์|siam commercial/i, 'ไทยพาณิชย์'],
  [/bbl|กรุงเทพ|bangkok bank/i, 'กรุงเทพ'],
  [/ktb|กรุงไทย|krungthai/i, 'กรุงไทย'],
  [/bay|krungsri|กรุงศรี/i, 'กรุงศรีอยุธยา'],
  [/ttb|ทหารไทย|ธนชาต|thanachart/i, 'ทหารไทยธนชาต'],
  [/gsb|ออมสิน|government savings/i, 'ออมสิน'],
  [/baac|ธ.?ก.?ส|เกษตร/i, 'ธ.ก.ส.'],
  [/kkp|เกียรตินาคิน|kiatnakin/i, 'เกียรตินาคินภัทร'],
  [/cimb|ซีไอเอ็มบี/i, 'ซีไอเอ็มบีไทย'],
  [/uob|ยูโอบี/i, 'ยูโอบี'],
  [/tisco|ทิสโก้/i, 'ทิสโก้'],
  [/lh ?bank|แลนด์.?แอนด์.?เฮ้?าส์/i, 'แลนด์ แอนด์ เฮ้าส์'],
  [/icbc|ไอซีบีซี/i, 'ไอซีบีซีไทย'],
  [/promptpay|พร้อมเพย์/i, 'พร้อมเพย์'],
]

function toNumber(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const cleaned = String(v).replace(/[^\d.]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function normalizeBank(name) {
  if (!name) return null
  for (const [pattern, canonical] of BANK_MAP) {
    if (pattern.test(name)) return canonical
  }
  return name.trim() || null
}

// แปลง transactionDate (YYYY-MM-DD) + time เป็น ISO string โซนไทย (+07:00)
// มี safety net: ถ้าปียังเป็น พ.ศ. (มากกว่าปีปัจจุบัน+1) ให้ลบ 543 ให้อัตโนมัติ
function buildTransactionAt(dateStr, timeStr) {
  let y, mo, d

  if (dateStr && /^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr.trim())) {
    ;[y, mo, d] = dateStr.trim().split('-').map(Number)
  } else if (dateStr) {
    // เผื่อ Gemini ตอบรูปแบบไทย เช่น "8 มิ.ย. 2568"
    const parsed = parseThaiDate(dateStr)
    if (!parsed) return null
    ;({ y, mo, d } = parsed)
  } else {
    return null
  }

  if (!y || !mo || !d) return null

  // safety: ปี พ.ศ. → ค.ศ.
  const nowYear = new Date().getFullYear()
  if (y > nowYear + 1) y -= 543

  let hh = 0, mm = 0
  if (timeStr && /^\d{1,2}:\d{2}/.test(timeStr.trim())) {
    ;[hh, mm] = timeStr.trim().split(':').map(Number)
  }

  const iso = `${pad4(y)}-${pad2(mo)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00+07:00`
  const dt = new Date(iso)
  return isNaN(dt.getTime()) ? null : dt.toISOString()
}

function parseThaiDate(str) {
  // จับรูปแบบ "8 มิ.ย. 2568" หรือ "8 มิถุนายน 2568"
  const m = str.match(/(\d{1,2})\s*([ก-ฮ.]+)\s*(\d{2,4})/)
  if (!m) return null
  const d = Number(m[1])
  const mo = THAI_MONTHS[m[2]] || null
  let y = Number(m[3])
  if (y < 100) y += y > 50 ? 2400 : 2500 // ปีย่อ 2 หลัก → พ.ศ.
  if (!mo) return null
  return { y, mo, d }
}

const pad2 = (n) => String(n).padStart(2, '0')
const pad4 = (n) => String(n).padStart(4, '0')

async function generateWithRetry(model, parts, retries = 2) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await model.generateContent(parts)
    } catch (err) {
      lastErr = err
      const retriable = /429|500|503|timeout|fetch failed/i.test(err.message || '')
      if (attempt === retries || !retriable) break
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  throw lastErr
}

// ───────────────────────── Main ─────────────────────────

/**
 * อ่านสลิปด้วย Gemini 2.5 Flash (structured output + normalization)
 * @returns {{
 *   isSlip:boolean, amount:number|null, senderName, senderAccount,
 *   receiverName, receiverAccount, bankName, referenceNo,
 *   transactionAt:string|null, fee:number|null, raw:object
 * }}
 */
export async function ocrSlip(imageBuffer, mimeType = 'image/jpeg') {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema,
    },
  })

  const result = await generateWithRetry(model, [
    { text: PROMPT },
    { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
  ])

  const raw = JSON.parse(result.response.text())

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

function clean(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s && s.toLowerCase() !== 'null' ? s : null
}
