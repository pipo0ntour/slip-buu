// ── ตัวช่วยกลางของ benchmark: prompt ร่วม, normalize ฟิลด์, ให้คะแนน, ตารางราคา ──
// ใช้ parse.js ตัวเดียวกับ production เพื่อทำความสะอาดค่า (ชื่อธนาคาร/ตัวเลข/วันที่) ให้ยุติธรรมทุกค่าย
import { toNumber, normalizeBank, buildTransactionAt, clean } from '../src/services/parse.js'

// PROMPT + คีย์ JSON — คัดลอกจาก gemini.js (ให้ทุก provider อ่านด้วยโจทย์เดียวกัน เทียบกันตรง ๆ)
// ⚠️ ถ้าแก้ prompt ใน gemini.js ควรซิงก์ที่นี่ด้วย (ตั้งใจ copy เพื่อ decouple จาก init ของ gemini.js)
export const PROMPT = `คุณคือระบบอ่านเอกสารการเงินของไทยที่แม่นยำสูง รองรับ 2 ชนิด อ่านรูปอย่างละเอียดแล้ว
กำหนด docKind ก่อน: "slip"=สลิปโอนเงิน, "receipt"=ใบเสร็จ/ตั๋ว, "other"=ไม่ใช่ทั้งสอง (amount=null)

ถ้า slip: amount=จำนวนที่โอนจริง (ระวังสับสนกับยอดคงเหลือ/ค่าธรรมเนียม; สลิปรัฐใช้ยอดสุทธิที่จ่ายจริง),
senderName/receiverName=ผู้โอน(บน)/ผู้รับ(ล่าง) ห้ามสลับ, bankName=ธนาคารผู้โอน ใช้ชื่อย่อไทยมาตรฐาน,
referenceNo=เลขที่อ้างอิงการโอน, fee=ค่าธรรมเนียม (ไม่มี=0), senderAccount/receiverAccount=เลขบัญชี/พร้อมเพย์

ถ้า receipt: amount=ยอดสุทธิที่จ่ายจริง (Total/รวมทั้งสิ้น หลังหักส่วนลด — ห้ามเอา Subtotal/เงินสด/เงินทอน),
merchant=ชื่อร้าน, referenceNo=เลขใบเสร็จ/POS/ตั๋ว, category=[ค่าอาหาร,ค่าเดินทาง,ค่าของ,ค่าน้ำค่าไฟ,ค่าส่ง,สุขภาพ,ค่าเช่า] หรือ null

ร่วม: transactionDate=YYYY-MM-DD เป็น ค.ศ. (เอกสารไทยมักเป็น พ.ศ. ต้องลบ 543), transactionTime=HH:mm (24 ชม.)
กฎ: ห้ามเดา ไม่พบใส่ null อ่านจากรูปจริงเท่านั้น`

// บอกคีย์ JSON ให้โมเดลที่ไม่มี structured-output (Groq/OpenRouter/ฯลฯ json mode)
export const JSON_HINT = `

ตอบเป็น JSON object เท่านั้น ห้ามมีข้อความอื่น ใช้คีย์:
{"docKind":"slip"|"receipt"|"other","amount":number|null,"senderName":string|null,"senderAccount":string|null,"receiverName":string|null,"receiverAccount":string|null,"bankName":string|null,"referenceNo":string|null,"fee":number|null,"merchant":string|null,"category":string|null,"paymentMethod":string|null,"transactionDate":"YYYY-MM-DD"|null,"transactionTime":"HH:mm"|null}`

// ── prompt งานโน้ตลายมือ + รูปสินค้า — คัดลอกจาก gemini.js (NOTE_PROMPT / PRODUCT_PROMPT) ──
export const NOTE_PROMPT = `คุณคือระบบอ่านสมุดบันทึกรายรับรายจ่ายที่เขียนด้วยลายมือ (ภาษาไทย) อย่างแม่นยำ
อ่านรูปแล้วแตกออกเป็น "รายการ" ทีละบรรทัด/ทีละชิ้น ตามกฎ:

1. แต่ละรายการประกอบด้วย:
   - description = สิ่งที่จ่ายหรือรับ เช่น "ค่าข้าว", "ค่าน้ำมัน", "ขายของ" เก็บข้อความสั้น ๆ ตามที่เขียน
   - amount = จำนวนเงินของรายการนั้น (ตัวเลขล้วน ไม่มีลูกน้ำ ไม่มีหน่วย)
   - type = "income" ถ้าเป็นเงินเข้า/รายรับ (ขายของ ได้เงิน รับเงิน ฝากเข้า),
            "expense" ถ้าเป็นเงินออก/รายจ่าย (ซื้อ จ่าย ค่า...) — ถ้าไม่แน่ใจให้เดาเป็น "expense"

2. ข้ามบรรทัดที่ไม่ใช่รายการเงิน เช่น หัวข้อ วันที่ ยอดรวม/รวมทั้งหมด เส้นขีด — เอาเฉพาะบรรทัดที่มีจำนวนเงินชัดเจน
3. ถ้าบรรทัดมีหลายตัวเลข ให้เอา "จำนวนเงินของรายการนั้น" ไม่ใช่ยอดสะสม/ยอดรวมท้ายตาราง
4. ห้ามสร้างรายการที่ไม่มีในรูป อ่านได้กี่รายการก็ใส่เท่านั้น ตามลำดับที่เขียนจากบนลงล่าง`

export const NOTE_HINT = `

ตอบกลับเป็น JSON object เท่านั้น ห้ามมีข้อความอื่นนอก JSON ใช้รูปแบบนี้:
{"items": [{"description": string|null, "amount": number, "type": "income"|"expense"}]}`

export const PRODUCT_PROMPT = `คุณคือระบบดูรูปสินค้าแล้วบอกว่าคืออะไร เพื่อช่วยกรอกรายการซื้อของ ดูรูปแล้ว:
- isProduct = true ถ้ามีสินค้า/สิ่งของชัดเจน, false ถ้าไม่ใช่ (วิว/คน/อื่น ๆ)
- name = ชื่อสินค้าโดยย่อ เป็นภาษาไทย กระชับ (เช่น "น้ำตาลทราย", "กล่องพัสดุ", "ผงซักฟอก", "กาแฟ 3in1")
  เห็นยี่ห้อชัดใส่สั้น ๆ ได้ แต่ไม่ต้องยาว
- category = เดาหมวดรายจ่ายจากชุดนี้เท่านั้น (ใกล้สุด) ไม่เข้าเลย = null:
  ค่าของ, ค่าอาหาร, ค่าเดินทาง, ค่าน้ำค่าไฟ, ค่าส่ง, สุขภาพ, ค่าเช่า
  แนวทาง: ของกิน/เครื่องดื่ม = ค่าอาหาร | ของใช้/วัสดุ/บรรจุภัณฑ์/เครื่องเขียน = ค่าของ | ยา/อุปกรณ์สุขภาพ = สุขภาพ
- unitPrice = ราคาต่อชิ้น เฉพาะเมื่อเห็น "ป้ายราคา" ชัดเจนในรูปเท่านั้น ไม่เห็นให้ null (ห้ามเดา)
ตอบเฉพาะที่เห็นจริงในรูป`

export const PRODUCT_HINT = `

ตอบกลับเป็น JSON object เท่านั้น ห้ามมีข้อความอื่นนอก JSON:
{"isProduct": boolean, "name": string|null, "category": string|null, "unitPrice": number|null}`

// ── นิยาม "งาน" ทั้ง 3 แบบ (สลิป/ใบเสร็จใช้ document ร่วมกัน) — provider เอา prompt+hint ไปยิง,
//    runner เอา canon+score ไปตรวจ. ocrHybrid=false = งานที่ OCR ธรรมดาทำไม่ได้ (เช่น ระบุสินค้าจากภาพ)
export const TASKS = {
  document: { prompt: PROMPT, hint: JSON_HINT, canon: canonFields, ocrHybrid: true },
  note: { prompt: NOTE_PROMPT, hint: NOTE_HINT, canon: canonNote, ocrHybrid: true },
  product: { prompt: PRODUCT_PROMPT, hint: PRODUCT_HINT, canon: canonProduct, ocrHybrid: false },
}

// prompt สำหรับขั้น "hybrid" — ป้อนข้อความที่ OCR อ่านได้ (แทนรูป) ให้ LLM แตกเป็นฟิลด์ตามงานนั้น ๆ
export const hybridPrompt = (ocrText, taskId = 'document') => {
  const t = TASKS[taskId] || TASKS.document
  return `${t.prompt}${t.hint}\n\nข้อความที่ OCR อ่านได้จากเอกสาร (อาจมีอักขระเพี้ยนบ้าง):\n"""\n${ocrText}\n"""`
}

// ── ดึง JSON ออกจากข้อความที่โมเดลตอบ (เผื่อห่อ ```json หรือมีข้อความนำ) ──
export function parseJsonLoose(text) {
  if (!text) return null
  let s = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(s)
  } catch {
    // เผื่อมีข้อความหุ้ม — คว้าเฉพาะช่วง { ... } แรกสุดถึงท้ายสุด
    const a = s.indexOf('{')
    const b = s.lastIndexOf('}')
    if (a >= 0 && b > a) {
      try { return JSON.parse(s.slice(a, b + 1)) } catch { return null }
    }
    return null
  }
}

// วันที่ให้เป็น YYYY-MM-DD (โซนไทย) — ผ่าน buildTransactionAt เพื่อจัดการ พ.ศ./รูปแบบไทยแบบเดียวกับ production
export function canonDate(dateStr, timeStr) {
  const iso = buildTransactionAt(dateStr, timeStr)
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) // 'YYYY-MM-DD'
}

// แปลง raw JSON (ตาม schema PROMPT) ของ provider ใด ๆ → ฟิลด์มาตรฐานที่ใช้เทียบคะแนน
export function canonFields(raw) {
  if (!raw || typeof raw !== 'object') return null
  const docKind = raw.docKind === 'receipt' ? 'receipt' : raw.docKind === 'other' ? 'other' : 'slip'
  return {
    docKind,
    amount: toNumber(raw.amount),
    senderName: clean(raw.senderName),
    receiverName: clean(raw.receiverName ?? raw.merchant), // ใบเสร็จเก็บร้านที่ merchant
    bankName: normalizeBank(clean(raw.bankName)),
    referenceNo: clean(raw.referenceNo),
    transactionDate: canonDate(raw.transactionDate, raw.transactionTime),
  }
}

// ── การให้คะแนนรายฟิลด์ (0..1) ──
const stripTitle = (s) =>
  s.replace(/^(นาย|นาง(?:สาว)?|น\.?ส\.?|คุณ|ด\.?ช\.?|ด\.?ญ\.?|mr\.?|mrs\.?|ms\.?|miss)\s*/i, '')
const normName = (s) => stripTitle(String(s).toLowerCase().replace(/\s+/g, ' ').trim())
const normRef = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '')

// เทียบ 1 ฟิลด์ — คืน 0..1 (ชื่อให้เครดิตบางส่วนถ้า "อยู่ใน" กันและกัน เพราะ OCR ชื่อไทยพลาดง่าย)
export function scoreField(field, pred, truth) {
  if (truth == null || truth === '') return null // ไม่มีเฉลย → ไม่นับฟิลด์นี้
  if (pred == null || pred === '') return 0
  switch (field) {
    case 'amount': {
      const a = toNumber(pred), b = toNumber(truth)
      return a != null && b != null && Math.abs(a - b) < 0.01 ? 1 : 0
    }
    case 'referenceNo':
      return normRef(pred) === normRef(truth) ? 1 : 0
    case 'bankName':
      return normalizeBank(pred) === normalizeBank(truth) ? 1 : 0
    case 'docKind':
      return String(pred) === String(truth) ? 1 : 0
    case 'transactionDate':
      return String(pred) === String(truth) ? 1 : 0
    case 'senderName':
    case 'receiverName': {
      const a = normName(pred), b = normName(truth)
      if (!a || !b) return 0
      if (a === b) return 1
      return a.includes(b) || b.includes(a) ? 0.5 : 0 // เครดิตบางส่วน
    }
    default:
      return String(pred) === String(truth) ? 1 : 0
  }
}

// ฟิลด์ที่ให้คะแนน + น้ำหนักสำหรับ "overall" (amount สำคัญสุด)
export const SCORE_FIELDS = ['amount', 'referenceNo', 'bankName', 'transactionDate', 'senderName', 'receiverName', 'docKind']
export const WEIGHTS = {
  amount: 0.35, referenceNo: 0.20, bankName: 0.12, transactionDate: 0.11,
  senderName: 0.10, receiverName: 0.10, docKind: 0.02,
}

// ═════════════ งานสินค้า (product) ═════════════
const CATEGORIES = ['ค่าของ', 'ค่าอาหาร', 'ค่าเดินทาง', 'ค่าน้ำค่าไฟ', 'ค่าส่ง', 'สุขภาพ', 'ค่าเช่า']
const normCategory = (s) => {
  const v = clean(s)
  if (!v) return null
  return CATEGORIES.find((c) => c === v.replace(/\s+/g, '')) ?? null // นอกชุดมาตรฐาน = null (เหมือน production)
}

export function canonProduct(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    isProduct: raw.isProduct !== false,
    name: clean(raw.name),
    category: normCategory(raw.category),
    unitPrice: toNumber(raw.unitPrice),
  }
}

// คะแนนสินค้า: name เหมือนการเทียบชื่อ (เครดิตบางส่วน), category เทียบตรงในชุดมาตรฐาน,
// unitPrice นับ "null==null" เป็นถูก (ไม่เห็นป้ายราคาแล้วไม่เดา = พฤติกรรมที่ต้องการ ห้าม hallucinate)
export const PRODUCT_FIELDS = ['name', 'category', 'unitPrice']
export const PRODUCT_WEIGHTS = { name: 0.45, category: 0.25, unitPrice: 0.30 }

const normText = (s) => String(s).toLowerCase().replace(/\s+/g, '')
export function scoreProduct(field, pred, truth) {
  if (field === 'unitPrice') {
    const a = toNumber(pred), b = toNumber(truth)
    if (b == null) return a == null ? 1 : 0 // เฉลยไม่มีป้ายราคา → ตอบ null ถึงถูก
    return a != null && Math.abs(a - b) < 0.01 ? 1 : 0
  }
  if (truth == null || truth === '') return null
  if (pred == null || pred === '') return 0
  if (field === 'category') return normCategory(pred) === normCategory(truth) ? 1 : 0
  // name: ตรงเป๊ะ=1, มีคำหลักอยู่ในกัน=0.5 (เช่น "โค้ก" vs "โค้กซีโร่ 325ml")
  const a = normText(pred), b = normText(truth)
  if (!a || !b) return 0
  if (a === b) return 1
  return a.includes(b) || b.includes(a) ? 0.5 : 0
}

// ═════════════ งานโน้ตลายมือ (note) — เทียบ "รายการหลายชิ้น" ═════════════
export function canonNote(raw) {
  if (!raw || typeof raw !== 'object') return null
  const list = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : []
  return {
    items: list
      .map((it) => ({
        description: clean(it?.description),
        amount: toNumber(it?.amount),
        type: it?.type === 'income' ? 'income' : 'expense',
      }))
      .filter((it) => it.amount != null),
  }
}

// จับคู่รายการ pred↔truth แบบ greedy (คะแนนคู่สูงสุดก่อน) แล้วคิดคะแนน:
//   คู่ที่จับได้: amount ตรง 0.55 · description 0.30 (เครดิตบางส่วน) · type 0.15
//   หารด้วย max(จำนวนเฉลย, จำนวนที่อ่านได้) → โดนหักทั้ง "อ่านตก" และ "แต่งรายการเกิน"
export function scoreNote(pred, truth) {
  const T = truth?.items || [], P = pred?.items || []
  if (!T.length) return null
  if (!P.length) return { overall: 0, amount: 0, description: 0, type: 0, countAcc: 0, matched: 0, nTruth: T.length, nPred: 0 }

  const pairScore = (p, t) => {
    const amt = p.amount != null && t.amount != null && Math.abs(p.amount - t.amount) < 0.01 ? 1 : 0
    let desc = 0
    if (p.description && t.description) {
      const a = normText(p.description), b = normText(t.description)
      desc = a === b ? 1 : a.includes(b) || b.includes(a) ? 0.5 : 0
    }
    const typ = p.type === t.type ? 1 : 0
    return { amt, desc, typ, total: 0.55 * amt + 0.3 * desc + 0.15 * typ }
  }

  // สร้างทุกคู่ → เลือกคู่คะแนนสูงสุดก่อน (ห้ามใช้ item ซ้ำ)
  const cand = []
  T.forEach((t, ti) => P.forEach((p, pi) => cand.push({ ti, pi, s: pairScore(p, t) })))
  cand.sort((a, b) => b.s.total - a.s.total)
  const usedT = new Set(), usedP = new Set(), pairs = []
  for (const c of cand) {
    if (usedT.has(c.ti) || usedP.has(c.pi)) continue
    if (c.s.total <= 0) break // คู่ที่ไม่เหมือนกันเลย ไม่นับว่าจับคู่ได้
    usedT.add(c.ti); usedP.add(c.pi); pairs.push(c.s)
  }

  const denom = Math.max(T.length, P.length)
  const sum = (k) => pairs.reduce((a, s) => a + s[k], 0)
  return {
    overall: pairs.reduce((a, s) => a + s.total, 0) / denom,
    amount: sum('amt') / denom,       // สัดส่วนรายการที่ "ยอดตรง"
    description: sum('desc') / denom, // สัดส่วนรายละเอียดที่อ่านถูก
    type: sum('typ') / denom,         // สัดส่วน รับ/จ่าย ถูก
    countAcc: Math.min(T.length, P.length) / denom, // อ่านครบทุกรายการไหม
    matched: pairs.length, nTruth: T.length, nPred: P.length,
  }
}

// ── ตารางราคา (ประมาณ กลางปี 2026 — ต้องเช็คหน้าจริงก่อนใช้งานจริง) ──
// per1000 = ค่าใช้จ่ายเมื่อจ่ายเงินต่อ 1,000 ใบ (USD, คร่าว ๆ); free = สรุป free tier/trial
export const PRICING = {
  gemini:       { per1000: '~$0.3–0.5', free: 'ฟรี ~1,500 req/วัน (Flash) ไม่ต้องผูกบัตร' },
  groq:         { per1000: '~$0.1–0.3', free: 'ฟรี ~1,000 req/วัน, 30 RPM (Llama 4 Scout vision)' },
  cloudflare:   { per1000: '~$0.1–0.3', free: 'ฟรี 10,000 Neurons/วัน ถาวร ไม่ต้องผูกบัตร' },
  openrouter:   { per1000: '$0 (โมเดล :free) / แล้วแต่รุ่น', free: 'มีโมเดล :free + เครดิตแรกเข้า' },
  nvidia:       { per1000: 'แล้วแต่รุ่น', free: 'เครดิตฟรีเริ่มต้น (NIM) ไม่ต้องผูกบัตร' },
  mistral:      { per1000: '~$0.2 (Pixtral) / OCR $2/1,000', free: 'มี tier ฟรีบน API (le Chat trial เลิกแล้ว)' },
  ocrspace:     { per1000: '~$0.5–1 (PRO)', free: 'ฟรี 25,000 req/เดือน (คีย์ของตัวเอง)' },
  googlevision: { per1000: '~$1.5', free: 'ฟรี 1,000 units/เดือน ถาวร' },
  azure:        { per1000: '~$1.5 (Read) / $10 (receipt)', free: 'ฟรี 500 หน้า/เดือน (Doc Intelligence)' },
  github:       { per1000: 'ฟรี (dev) / จ่ายผ่าน Azure', free: 'GitHub Models — ฟรีสำหรับ dev (rate limit ต่ำ)' },
  huggingface:  { per1000: 'แล้วแต่ provider', free: 'HF Inference — เครดิตฟรีรายเดือน (rate limit)' },
  zhipu:        { per1000: '~$0.1–0.3 (glm-5v-turbo) · glm-4v-flash ฟรี', free: 'glm-4v-flash ฟรี + เครดิตแรกเข้า (BigModel/z.ai)' },
}

export const round = (n, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d)
export const pct = (n) => (n == null ? '-' : `${Math.round(n * 100)}%`)
