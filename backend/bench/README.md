# OCR Benchmark — เทียบหลายค่ายบนสลิปไทยชุดเดียวกัน

ยิงสลิป/ใบเสร็จชุดเดียวกันเข้า **10 ค่าย/โมเดล** แล้ววัด **ความแม่นรายฟิลด์ · latency · ราคาเมื่อจ่าย**
ทุกค่ายใช้ **prompt เดียวกัน** (ก็อปจาก `gemini.js`) เพื่อเทียบกันตรง ๆ — ค่ายที่เป็น OCR ธรรมดาจะต่อ
**hybrid** (OCR ได้ข้อความ → LLM แตกเป็นฟิลด์) ให้อัตโนมัติ

## ค่ายที่รองรับ (key-gated — ใส่เฉพาะที่อยากเทส ที่เหลือข้ามให้เอง)

| id | ชนิด | ต้องมี env | ทดลองฟรี |
|---|---|---|---|
| `gemini` | vision | `GEMINI_API_KEY` | ~1,500 req/วัน |
| `groq` | vision | `GROQ_API_KEYS` | ~1,000 req/วัน |
| `cloudflare` | ocr+hybrid¹ | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | 10k Neurons/วัน |
| `openrouter` | vision | `OPENROUTER_API_KEY` | โมเดล `:free` |
| `nvidia` | vision | `NVIDIA_API_KEY` | เครดิตฟรี (NIM) |
| `mistral` | vision | `MISTRAL_API_KEY` | tier ฟรี |
| `ocrspace` | ocr+hybrid | `OCR_SPACE_API_KEY` | 25k req/เดือน |
| `googlevision` | ocr+hybrid | `GOOGLE_VISION_API_KEY` | 1k/เดือน |
| `azure` | ocr+hybrid | `AZURE_DI_ENDPOINT`, `AZURE_DI_KEY` | 500 หน้า/เดือน |
| `github` | vision | `GITHUB_TOKEN` (PAT, Models:Read) | ฟรีสำหรับ dev — เข้าถึง GPT-4o/4o-mini/Phi-4 |
| `huggingface` | vision | `HF_TOKEN` (สิทธิ์ Inference Providers) | เครดิตฟรีรายเดือน — Qwen3-VL ฯลฯ |
| `zhipu` | vision | `ZHIPU_API_KEY` (id.secret) | glm-4v-flash ฟรี — default `glm-5v-turbo` (ปิด thinking ให้แล้ว) |

> โมเดลของแต่ละค่ายปรับได้ผ่าน env เช่น `OPENROUTER_MODEL`, `CLOUDFLARE_MODEL`, `BENCH_GEMINI_MODEL` ฯลฯ
> ขั้น hybrid ใช้ Gemini Flash-Lite ถ้ามีคีย์ ไม่งั้นใช้ Groq
>
> ¹ Cloudflare Llama-3.2 vision ตอบ JSON ตาม schema ไม่คงเส้นคงวา จึงใช้เป็น "ถอดข้อความ → hybrid" แทน
>   และต้อง **กด agree license ครั้งเดียว** ก่อนใช้ (ยิง `{prompt:"agree"}` ไปที่ `ai/run/<model>` หรือกดใน dashboard)

## ครอบคลุม 4 ฟังก์ชันของแอป

| หมวด (โฟลเดอร์) | task | ดึงอะไร | ค่ายที่เทสได้ |
|---|---|---|---|
| `receipts/` ใบเสร็จ | document | ยอด·ร้าน·วันที่·เลขใบเสร็จ | ทุกค่าย |
| `slips/` สลิปโอน | document | ยอด·ผู้โอน/รับ·ธนาคาร·ref·วันที่ | ทุกค่าย |
| `products/` รูปสินค้า | product | ชื่อ·หมวด·ราคา (ป้ายราคา) | **เฉพาะ vision** (OCR ระบุสินค้าไม่ได้ — ข้ามอัตโนมัติ) |
| `notes/` โน้ตลายมือ | note | รายการหลายชิ้น {รายละเอียด, ยอด, รับ/จ่าย} | ทุกค่าย |

## วิธีใช้ (3 ขั้น)

```bash
cd backend

# 0) ใส่คีย์ค่ายที่อยากเทสใน backend/.env (ดู .env.example ท้ายไฟล์)

# 1) วางรูปลง bench/dataset/{receipts,slips,products,notes}/  (หมวดละ ~20, jpg/png/webp/heic)

# 2) ทำ "เฉลย" (ground truth) — แยกไฟล์ต่อหมวด: labels.<หมวด>.json
node bench/predraft.mjs                  # Gemini ร่างเฉลยรูปที่ยังไม่มี → labels.<หมวด>.draft.json
#   → เปิดรูปตรวจร่างทีละใบ แก้ให้ถูก แล้วรวมเข้า labels.<หมวด>.json (ห้ามเชื่อร่างดิบ ๆ ไม่งั้นลำเอียงเข้า Gemini)

# 3) รัน benchmark (ขนานต่อค่าย — เร็วกว่าเดิมมาก)
node bench/run.mjs                        # ทุกค่าย ทุกหมวด
node bench/run.mjs --cats slips,notes     # เฉพาะบางหมวด
node bench/run.mjs --only gemini,groq     # เฉพาะบางค่าย
node bench/run.mjs --limit 5              # จำกัดจำนวนรูปต่อหมวด (ทดสอบเร็ว)
```

## ผลลัพธ์

- ตาราง console: แยกหมวด 4 ตาราง + ตารางรวม provider × หมวด (เรียงตาม overall)
- `bench/out/summary.csv` — เปิดใน Excel/Sheets (long format: category,provider,field,score)
- `bench/out/report.html` — ตารางสวย ๆ เปิดในเบราว์เซอร์
- `bench/out/raw.json` — ค่าที่แต่ละค่ายอ่านได้ **รายใบ** (ไว้ไล่ดูว่าพลาดตรงไหน)

## การให้คะแนน

- เทียบเฉพาะฟิลด์ที่ **มีเฉลย** — ฟิลด์ไหนเว้นว่างในเฉลย จะไม่ถูกนับ
- **document**: `amount` เทียบตรง (±0.01), `referenceNo`/`bankName`/`date` normalize,
  ชื่อให้เครดิตบางส่วน 0.5 ถ้า "อยู่ใน" กัน — overall ถ่วงน้ำหนัก amount สูงสุด (`WEIGHTS`)
- **product**: name (เครดิตบางส่วนแบบชื่อ) · category (ชุดมาตรฐาน 7 หมวด) · unitPrice
  (เฉลย null = ต้องตอบ null ถึงถูก — จับ hallucinate ราคา) — น้ำหนัก `PRODUCT_WEIGHTS`
- **note**: จับคู่รายการ pred↔เฉลยแบบ greedy แล้วคิด ยอดตรง 0.55 · รายละเอียด 0.30 · รับ/จ่าย 0.15
  หารด้วย max(จำนวนเฉลย, จำนวนที่อ่าน) → โดนหักทั้ง "อ่านตก" และ "แต่งรายการเกิน" (`scoreNote`)

## หมายเหตุ
- รูปสลิปมี PII — `bench/dataset/` และ `bench/out/` ถูก gitignore แล้ว **ห้าม commit**
- ราคาใน `PRICING` (lib.mjs) เป็น **ค่าประมาณ** ต้องเช็คหน้า pricing จริงก่อนตัดสินใจ
