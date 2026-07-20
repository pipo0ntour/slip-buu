# Slip-Buu — ระบบสแกนสลิปผ่าน LINE LIFF

ระบบสแกนสลิปโอนเงินสำหรับลูกค้าผ่าน LINE Official Account โดยลูกค้าเข้าใช้งานผ่าน Rich Menu เท่านั้น ไม่สามารถเปิดผ่าน Browser โดยตรงได้

---

## Tech Stack

| Layer | เทคโนโลยี |
|---|---|
| Frontend (LIFF) | React + Vite + TailwindCSS |
| Backend API | Node.js + Express |
| ฐานข้อมูล | Supabase (PostgreSQL) |
| AI / OCR | Google Gemini 2.5 Flash (Vision) |
| Hosting Backend | Railway |
| Hosting Frontend | Vercel |
| LINE Integration | LINE LIFF SDK + Messaging API |

---

## สถาปัตยกรรมระบบ

```
[LINE OA Rich Menu]
        │
        ▼
[LINE LIFF App - React]  ←── ตรวจสอบ liff.isInClient() เสมอ
        │
        ├── อัพโหลด / ถ่ายรูปสลิป
        │
        ▼
[Node.js API Server]
        │
        ├── ส่งรูปไป Gemini 2.5 Flash → แยก OCR ข้อมูลสลิป
        ├── ตรวจสอบสลิปซ้ำ (image hash + reference no.)
        ├── บันทึกลง Supabase
        └── ส่งสรุปผ่าน LINE Messaging API (Target Picker)
```

---

## โครงสร้างโฟลเดอร์

```
slip-buu/
├── frontend/                  # LIFF React App
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx       # หน้าหลัก: ถ่าย/เลือกรูป + อัพโหลดหลายสลิป + สรุปผล inline
│   │   │   └── Report.jsx     # รายงาน + กดดูรายละเอียด/แก้ไขสลิป
│   │   ├── components/ui/
│   │   │   └── button.jsx
│   │   ├── context/
│   │   │   └── ToastContext.jsx   # ระบบ toast แจ้งเตือน
│   │   ├── hooks/
│   │   │   └── useLiff.js     # LIFF init + guard
│   │   ├── lib/
│   │   │   ├── api.js         # fetch helper + แนบ LINE access token
│   │   │   └── utils.js
│   │   └── App.jsx
│   └── package.json
│
├── backend/                   # Node.js API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── slip.js        # POST /api/slip/scan-batch → scan-save (อ่าน→ทวน→บันทึก), PATCH /api/slip/:id
│   │   │   └── report.js      # GET  /api/report
│   │   ├── services/
│   │   │   ├── gemini.js      # OCR ด้วย Gemini 2.5 Flash (structured output)
│   │   │   ├── duplicate.js   # ตรวจสลิปซ้ำ (image hash + reference no.)
│   │   │   ├── image.js       # บีบอัด/หมุนรูปด้วย sharp
│   │   │   ├── lineAuth.js    # middleware ยืนยัน LINE access token
│   │   │   ├── users.js       # upsert ข้อมูลผู้ใช้
│   │   │   ├── rateLimit.js   # จำกัด request ต่อผู้ใช้
│   │   │   └── supabase.js    # Supabase client
│   │   └── app.js
│   ├── migrations/
│   ├── .env
│   └── package.json
│
└── README.md
```

---

## Database Schema (Supabase)

### ตาราง `slips`

```sql
CREATE TABLE slips (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id     TEXT NOT NULL,
  amount           NUMERIC(12, 2),
  sender_name      TEXT,
  receiver_name    TEXT,
  bank_name        TEXT,
  reference_no     TEXT,
  transaction_at   TIMESTAMPTZ,
  image_url        TEXT,
  image_hash       TEXT UNIQUE,
  ocr_raw          JSONB,
  fee              NUMERIC(12, 2),
  sender_account   TEXT,
  receiver_account TEXT,
  note             TEXT,
  category         TEXT,
  type             TEXT NOT NULL DEFAULT 'income',   -- 'income' | 'expense'
  source           TEXT NOT NULL DEFAULT 'slip',      -- 'slip' | 'manual'
  status           TEXT DEFAULT 'success',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

> `status` มีค่าได้: `success` | `duplicate` | `failed`
> `type` = `income` (รายรับ) | `expense` (รายจ่าย) · `source` = `slip` (จาก OCR) | `manual` (สร้างเอง)
> `note` / `category` = โน้ตและหมวดหมู่ของรายการ (ระบุว่า "ค่าอะไร")
> `image_hash` ใช้ SHA256 ของไฟล์รูปเพื่อตรวจสลิปซ้ำ (รายการ `manual` ไม่มีรูป → null)

### ตาราง `users`

```sql
CREATE TABLE users (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  picture_url  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### Index

```sql
CREATE INDEX idx_slips_line_user_id  ON slips(line_user_id);
CREATE INDEX idx_slips_transaction_at ON slips(transaction_at);
```

---

## LINE Setup

### 1. LINE Developer Console
1. ไปที่ [LINE Developer Console](https://developers.line.biz/)
2. เข้า Channel ที่ผูกกับ LINE OA
3. ไปที่ **LIFF** → Add → ตั้งค่า:
   - Size: `Full`
   - Endpoint URL: URL ของ Vercel ที่ deploy แล้ว
4. คัดลอก **LIFF ID** ไปใช้ใน frontend

### 2. Rich Menu (LINE OA Manager)
1. ไปที่ [LINE Official Account Manager](https://manager.line.biz/)
2. สร้าง Rich Menu → ออกแบบให้มีปุ่ม "สแกนสลิป"
3. ตั้ง Action เป็น **URI**: `https://liff.line.me/{liffId}`

### 3. Environment Variables

`backend/.env`:
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx
GEMINI_API_KEY=xxx
LINE_LOGIN_CHANNEL_ID=xxx                 # ส่วนหน้าของ LIFF ID — ใช้ตรวจ access token
CORS_ORIGIN=https://your-app.vercel.app   # เว้นว่าง = อนุญาตทุก origin
```

`frontend/.env`:
```env
VITE_LIFF_ID=xxx
VITE_API_URL=https://your-backend.railway.app
```

---

## LIFF Guard (บังคับเปิดใน LINE เท่านั้น)

ถ้าเปิดลิงก์ใน browser ธรรมดา จะแสดงหน้าแนะนำให้แอด LINE OA แทน

`frontend/src/hooks/useLiff.js`:

```js
import liff from '@line/liff';

const LINE_OA_ID = '@218eqenn';
const LINE_ADD_URL = `https://line.me/R/ti/p/${LINE_OA_ID}`;

export async function initLiff(liffId) {
  await liff.init({ liffId });

  if (!liff.isInClient()) {
    showAddLineOAPage();
    throw new Error('Not in LINE client');
  }

  if (!liff.isLoggedIn()) {
    liff.login();
  }

  return liff.getProfile();
}

function showAddLineOAPage() {
  document.body.style.margin = '0';
  document.body.style.fontFamily = 'sans-serif';
  document.body.style.background = '#f0f0f0';
  document.body.innerHTML = `
    <div style="
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;min-height:100vh;padding:32px;
      text-align:center;
    ">
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/4/41/LINE_logo.svg"
        style="width:72px;margin-bottom:24px"
        alt="LINE"
      />
      <h2 style="font-size:20px;margin:0 0 8px;color:#111">
        ระบบนี้ใช้งานผ่าน LINE เท่านั้น
      </h2>
      <p style="font-size:15px;color:#555;margin:0 0 32px;line-height:1.6">
        กรุณาแอด LINE OA ของเรา<br>แล้วใช้งานผ่านเมนูในแอป LINE
      </p>
      <a
        href="${LINE_ADD_URL}"
        style="
          display:inline-block;background:#00B900;color:#fff;
          text-decoration:none;font-size:17px;font-weight:bold;
          padding:16px 40px;border-radius:50px;
        "
      >
        แอด LINE OA (Slip-BUU)
      </a>
      <p style="font-size:13px;color:#999;margin-top:16px">${LINE_OA_ID}</p>
    </div>
  `;
}
```

---

## User Flow

```
1. ลูกค้ากด Rich Menu → เปิด LIFF App
2. ระบบเช็ค liff.isInClient() → ถ้าไม่ใช่ LINE → แสดงหน้าแอด LINE OA พร้อมปุ่มลิงก์
3. หน้าหลัก: "ถ่ายรูป" หรือ "เลือกรูปจากคลัง" เลือกได้สูงสุด 10 สลิปต่อครั้ง
4. กด "อัพโหลด" → ส่งทั้งหมดไป Backend (แนบ LINE access token)
5. Backend ทำงานทีละสลิป:
   a. ยืนยัน access token → ดึง line_user_id + upsert ตาราง users
   b. คำนวณ SHA256 hash ของรูป → เช็คซ้ำในฐานข้อมูล
   c. บีบอัด/หมุนรูป → อัพโหลดไป Supabase Storage
   d. ส่งรูปให้ Gemini 2.5 Flash → OCR ดึงข้อมูล
   e. เช็คซ้ำด้วยเลขอ้างอิง → บันทึกลง Supabase
6. แสดงสรุปผล inline ในหน้าหลัก: สำเร็จ / ซ้ำ / ผิดพลาด กี่รายการ
7. รายการที่ไม่มีสลิป (เช่น จ่ายเงินสด): กด "เพิ่มรายการเอง" ในหน้าหลัก → กรอกจำนวนเงิน/รายรับ-จ่าย/หมวดหมู่/โน้ต (ไม่ใส่วันที่ = ใช้เวลาปัจจุบัน)
8. หน้า Report: ดูยอดรายวัน/เดือน/ปี แยกรายรับ/รายจ่าย/คงเหลือ, กดเข้าไปดูรายละเอียด แก้ไข/เพิ่มโน้ต/ลบรายการได้
9. เจ้าของร้านใช้ Target Picker ส่งสรุปเข้าแชทไลน์
```

---

## API Endpoints

> ทุก endpoint ต้องแนบ header `Authorization: Bearer <LINE access token>` (จาก `liff.getAccessToken()`)
> backend จะยืนยัน token กับ LINE แล้วดึง `line_user_id` เอง — client ส่ง user id เองไม่ได้

### สลิป/ใบเสร็จ: อ่าน → ทวน → บันทึก (flow หลัก)

หน้าแรกอ่านสลิปด้วย 2 ขั้น เพื่อให้ผู้ใช้ "ทวน/แก้ผลลัพธ์ OCR ก่อนบันทึก" (แบบเดียวกับถ่ายโน้ต):

**`POST /api/slip/scan-batch`** — OCR + เช็คซ้ำ แต่ **ยังไม่บันทึก/ไม่เก็บรูป**

```
Request: multipart/form-data
  - images: File[]        (สูงสุด 10 — frontend ส่งทีละใบเพื่อโชว์ความคืบหน้า)
  - type: 'income' | 'expense'   (ทิศทางเงินของสลิป; ใบเสร็จ backend บังคับ expense)
  - qrPayload: string     (ไม่บังคับ — QR ที่ client ถอด on-device ไว้เช็คซ้ำ)

Response:
{
  "results": [
    {
      "status": "success" | "duplicate" | "error",
      "message": "...",                       // เฉพาะ duplicate/error
      "data": {                               // เฉพาะ success — ฟิลด์พร้อมให้ผู้ใช้ทวน/แก้
        "docKind": "slip" | "receipt",
        "type": "income" | "expense",
        "amount": 1500.00,
        "sender_name", "receiver_name", "bank_name", "reference_no",
        "transaction_at", "category", "note", "fee",
        "sender_account", "receiver_account",
        "qrRef": "..."                        // ส่งกลับมาตอน scan-save
      }
    }
  ]
}
```

**`POST /api/slip/scan-save`** — บันทึกใบที่ผู้ใช้ทวน/แก้แล้ว (ส่งรูปกลับมาพร้อม `items[]` ลำดับตรงกัน)
> ระบบ**ไม่เก็บรูปสลิป** — รูปที่ส่งกลับมาใช้คำนวณ `image_hash` กันบันทึกซ้ำเท่านั้น แล้วปล่อยทิ้ง

```
Request: multipart/form-data
  - images: File[]        (รูปเดิม ลำดับตรงกับ items — ใช้คำนวณ image_hash กันซ้ำ ไม่เก็บลง storage)
  - items: string(JSON)   [{ docKind, type, amount, sender_name, ..., fee, qrRef }, ...]

Response: { "results": [ { status, message, data: { amount, type, senderName, bank, ... } } ] }
```

### `POST /api/slip/upload-batch` (legacy — OCR + บันทึกทันทีในสเต็ปเดียว)

คงไว้เผื่อ client เก่า — flow หลักปัจจุบันใช้ `scan-batch` → `scan-save` แทน

```
Request: multipart/form-data — images: File[] (สูงสุด 10), type, qrPayload
Response: { "results": [ { status, message, data: { amount, senderName, bank, referenceNo, transactionAt, fee } } ] }
```

### `PATCH /api/slip/:id`

แก้ไขข้อมูลรายการ (OCR อ่านผิด / เพิ่มโน้ต / เปลี่ยนประเภท) — แก้ได้เฉพาะรายการของตัวเอง

```
Request: application/json
  { amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, note, category, type }

Response:
{ "status": "success", "data": { ...ข้อมูลหลังแก้ไข } }
```

### `POST /api/slip/manual`

สร้างรายการธุรกรรมเอง (สำหรับรายการที่ไม่มีสลิป เช่น จ่ายเงินสด)

```
Request: application/json
  {
    amount,                        // จำเป็น (> 0)
    type,                          // 'income' | 'expense' (default: income)
    sender_name, receiver_name,    // ไม่บังคับ
    bank_name, note, category,     // ไม่บังคับ
    transaction_at                 // ไม่บังคับ — ถ้าไม่ส่ง ใช้เวลาปัจจุบัน
  }

Response:
{ "status": "success", "data": { ...ข้อมูลรายการที่สร้าง } }
```

### `DELETE /api/slip/:id`

ลบรายการ (ลบได้เฉพาะรายการของตัวเอง)

```
Response:
{ "status": "success", "message": "ลบรายการสำเร็จ" }
```

### `GET /api/report?period=daily|monthly|yearly`

นับยอดตามวันที่บนสลิป (`transaction_at`) — แยกรายรับ/รายจ่าย/คงเหลือ

```
Response:
{
  "totalIncome": 45000.00,   // รายรับรวม
  "totalExpense": 8000.00,   // รายจ่ายรวม
  "net": 37000.00,           // คงเหลือสุทธิ (income - expense)
  "count": 12,
  "slips": [ ... ]
}
```

---

## Gemini 2.5 Flash — OCR

`backend/src/services/gemini.js` ใช้ **structured output** (responseSchema) บังคับให้ Gemini ตอบ JSON ตาม schema เสมอ ไม่ต้อง parse เอง ดึงฟิลด์:
`isSlip, amount, senderName, senderAccount, receiverName, receiverAccount, bankName, referenceNo, transactionDate, transactionTime, fee`

จากนั้น normalize ต่อ: แปลงชื่อธนาคารเป็นชื่อย่อมาตรฐาน, แปลงปี พ.ศ. → ค.ศ., รวมวันที่+เวลาเป็น ISO (โซนไทย +07:00), กรองรูปที่ไม่ใช่สลิปออก

---

## การตรวจสลิปซ้ำ (Duplicate Detection)

ตรวจสอบ 2 ชั้น:

1. **Image Hash** — SHA256 ของไฟล์รูป ป้องกันการส่งรูปเดิมซ้ำ
2. **Reference Number** — เช็ค `reference_no` ซ้ำในฐานข้อมูล

```js
// backend/src/services/duplicate.js — ตรวจ 2 ชั้นแยกกัน (เลี่ยง error เมื่อ match หลายแถว)
checkByHash(imageHash)      // SHA256 ของไฟล์รูป
checkByRefNo(referenceNo)   // เลขอ้างอิง (ข้ามถ้าสั้นกว่า 6 ตัว กัน false positive)
```

---

## LINE Target Picker — ส่งสรุปเข้าแชท

```js
// frontend — ให้ผู้ใช้เลือกแชทหรือกลุ่มที่ต้องการส่ง
await liff.shareTargetPicker([
  {
    type: 'text',
    text: `สรุปยอดวันที่ ${date}\nรายรับทั้งหมด: ${total} บาท\nจำนวน: ${count} รายการ`
  }
]);
```

---

## UI/UX Guidelines

- ภาษาไทยทั้งหมด ไม่มีภาษาอังกฤษในหน้า UI
- สีหลัก: `#00B900` (LINE Green) + ขาว
- Font size ไม่น้อยกว่า 16px
- ปุ่มสูงไม่น้อยกว่า 56px กดง่าย
- ไม่เกิน 2 action ต่อหน้า
- แสดงสถานะชัดเจน: กำลังโหลด / สำเร็จ / ซ้ำ / ผิดพลาด

```
┌─────────────────────────┐
│    ส่งสลิปโอนเงิน        │
│                         │
│   [  ถ่ายรูปสลิป  ]     │
│   [ เลือกรูปจากคลัง ]   │
│                         │
│  ───────────────────    │
│  [ ดูรายงาน ] [ส่งสรุป] │
└─────────────────────────┘
```

---

## Security

- LIFF Guard ตรวจ `liff.isInClient()` ก่อน render ทุกครั้ง
- ทุก API ต้องแนบ LINE access token → backend ยืนยันกับ LINE แล้วดึง `line_user_id` เอง (กันปลอมเป็นคนอื่น)
- ตั้ง `LINE_LOGIN_CHANNEL_ID` ให้ backend ตรวจเพิ่มว่า token ออกให้ channel ของเราจริง
- จำกัดจำนวน request ต่อผู้ใช้ (rate limit) กันสแปม OCR ที่มีค่าใช้จ่าย
- จำกัด CORS ผ่าน `CORS_ORIGIN`
- Supabase ใช้ service key ฝั่ง backend (bypass RLS) — การจำกัดข้อมูลรายผู้ใช้ทำที่ชั้น API ผ่าน token

---

## ขั้นตอนการพัฒนา

### Phase 1 — Setup (วันที่ 1-2)
- [ ] `npm create vite@latest frontend -- --template react`
- [ ] ติดตั้ง `@line/liff`, `tailwindcss`
- [ ] สร้าง backend: `npm init` + ติดตั้ง `express`, `multer`, `@google/generative-ai`, `@supabase/supabase-js`
- [ ] สร้างตาราง Supabase + Storage bucket `slips`
- [ ] ทดสอบ LIFF init + ดึง profile

### Phase 2 — Core Feature (วันที่ 3-5)
- [ ] API: upload slip + Gemini OCR
- [ ] Duplicate detection (hash + reference_no)
- [ ] บันทึกลง Supabase
- [ ] หน้า Home (อัพโหลดหลายสลิป + สรุปผล inline)

### Phase 3 — Reports & LINE (วันที่ 6-7)
- [ ] API รายงานรายวัน/เดือน/ปี
- [ ] หน้า Report
- [ ] Target Picker ส่งสรุปเข้าไลน์

### Phase 4 — Deploy (วันที่ 8)
- [ ] Deploy backend → Railway
- [ ] Deploy frontend → Vercel
- [ ] ตั้งค่า LIFF Endpoint URL ใน LINE Developer Console
- [ ] ตั้ง Rich Menu ใน LINE OA Manager
- [ ] ทดสอบ end-to-end บน LINE จริง

---

## Deploy

### Backend (Railway)

```bash
# สร้างไฟล์ railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node src/app.js"
```

### Frontend (Vercel)

```bash
cd frontend
vercel --prod
# ได้ URL เช่น https://slip-buu.vercel.app
# → นำไปใส่ใน LINE Developer Console → LIFF → Endpoint URL
```

---

## การทดสอบ

1. เปิด LINE → กด Rich Menu → LIFF เปิดขึ้น
2. ลอง copy URL ไปวางใน browser → ต้องแสดง "กรุณาเปิดผ่าน LINE เท่านั้น"
3. เลือก/ถ่ายรูปสลิป (หลายรูปได้) → กด "อัพโหลด" → ได้ข้อมูล OCR ถูกต้อง + สรุปผล inline
4. ส่งสลิปเดิมซ้ำ → แจ้ง "สลิปนี้เคยส่งแล้ว"
5. หน้า Report แสดงยอดรายวัน/เดือน/ปี ถูกต้อง
6. กดที่รายการสลิป → เห็นรายละเอียด → กด "แก้ไข" → บันทึก → ข้อมูลอัปเดต
7. กด "ส่งสรุป" → Target Picker เปิด → เลือกแชท → ได้รับข้อความสรุป

---

## ผู้พัฒนา

- Ruangyot Jundai
