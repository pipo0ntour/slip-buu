import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { toNumber, normalizeBank, buildTransactionAt, clean } from './parse.js'

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
// ฟังก์ชันแปลงวันที่/ตัวเลข/ชื่อธนาคาร ย้ายไปไว้ที่ parse.js (มีเทสคุม)

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
