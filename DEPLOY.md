# 🚀 Deploy Runbook — Slip-BUU

คู่มือ deploy ระบบขึ้น production ทีละขั้น ทำตามลำดับนี้เป๊ะๆ ได้เลย

> **สัญลักษณ์**
> - 🟢 `[คุณทำ]` = ต้อง login / กดในเว็บเอง (ผมทำแทนไม่ได้)
> - 🔵 `[รันได้]` = คำสั่งที่รันใน terminal — ผมช่วยรันให้ได้หลังคุณ login CLI แล้ว
>
> **เวลาโดยรวม:** ~30–45 นาที (ครั้งแรก)

---

## 📋 ลำดับภาพรวม (ทำไมต้องเรียงแบบนี้)

มีการพึ่งพากันแบบลูกโซ่ — ต้องทำตามลำดับ ไม่งั้นจะติดเรื่องค่าที่ยังไม่มี:

```
1. Supabase      → ได้ SUPABASE_URL + SERVICE_KEY + สร้าง bucket
2. Gemini        → ได้ GEMINI_API_KEY
3. LINE (LIFF)   → ได้ LIFF_ID + LINE_LOGIN_CHANNEL_ID   (ใส่ endpoint ชั่วคราวไปก่อน)
4. Railway       → ได้ URL backend  (ใช้ค่าจาก 1,2,3)
5. Vercel        → ได้ URL frontend (ใช้ LIFF_ID + URL backend)
6. ย้อนกลับไป LINE → แก้ LIFF Endpoint = URL Vercel
7. ย้อนกลับไป Railway → ตั้ง CORS_ORIGIN = URL Vercel
8. Rich Menu + ทดสอบจริง
```

---

## 1️⃣ Supabase (ฐานข้อมูล + Storage)

### 1.1 สร้างโปรเจกต์ 🟢 `[คุณทำ]`
1. ไป https://supabase.com → **New project**
2. ตั้งชื่อ + รหัสผ่าน DB + เลือก region **Southeast Asia (Singapore)** (ใกล้ไทยสุด)
3. รอ ~2 นาทีให้ provision เสร็จ

### 1.2 รัน Schema 🔵 `[รันได้ผ่าน MCP]` หรือ 🟢 `[ทำเองก็ได้]`
**ทำเอง:** เปิด **SQL Editor** → New query → วางเนื้อหาจาก [`supabase/schema.sql`](supabase/schema.sql) → **Run**
จากนั้นวางเนื้อหาจาก [`backend/migrations/002_add_slip_columns.sql`](backend/migrations/002_add_slip_columns.sql) → **Run** อีกครั้ง

> หรือบอกผม "จัดการ Supabase ให้" — ผมรันให้ผ่าน Supabase MCP ได้ (ถ้าเชื่อมโปรเจกต์ไว้)

### 1.3 สร้าง Storage Bucket 🟢 `[คุณทำ]` *(dashboard เท่านั้น)*
1. **Storage** → **New bucket**
2. ชื่อ: `slips` (ต้องตรงเป๊ะ — โค้ดอ้างชื่อนี้)
3. **ปล่อยเป็น Private** (อย่าเปิด Public) — รูปสลิปมีชื่อคน/เลขบัญชี
   โค้ดเก็บแค่ path แล้วออก **signed URL อายุจำกัด** ตอนอ่าน (ดู `backend/src/services/storage.js`)
4. **Create**

### 1.4 เก็บค่า key 🟢 `[คุณทำ]`
ไป **Project Settings → API** คัดลอก 2 ค่า:
- **Project URL** → `SUPABASE_URL`
- **service_role** key (secret ⚠️ อย่าเอาไปฝั่ง frontend) → `SUPABASE_SERVICE_KEY`

---

## 2️⃣ Gemini API Key 🟢 `[คุณทำ]`

1. ไป https://aistudio.google.com/apikey
2. **Create API key** → คัดลอกไว้ → `GEMINI_API_KEY`

---

## 3️⃣ LINE — สร้าง LIFF 🟢 `[คุณทำ]`

> ทำที่ https://developers.line.biz/console/

### 3.1 เตรียม Channel
- ต้องมี **Provider** + **LINE Login channel** (ถ้ายังไม่มี สร้างใหม่)
- ใน LINE Login channel → แท็บ **Basic settings** → จด **Channel ID** (ตัวเลข) → นี่คือ `LINE_LOGIN_CHANNEL_ID`

### 3.2 สร้าง LIFF app
1. แท็บ **LIFF** → **Add**
2. ตั้งค่า:
   - **Size:** `Full`
   - **Endpoint URL:** ใส่ชั่วคราวไปก่อน เช่น `https://example.com` (เดี๋ยวขั้นที่ 6 ค่อยกลับมาแก้เป็น URL Vercel จริง)
   - **Scopes:** ✅ `profile` ✅ `openid`
   - **Share target picker:** เปิด ✅ (จำเป็นสำหรับปุ่ม "ส่งสรุปไปไลน์")
3. **Add** → คัดลอก **LIFF ID** (รูปแบบ `1234567890-abcdABCD`) → `VITE_LIFF_ID`
   - หมายเหตุ: เลขหน้า `-` ของ LIFF ID = Channel ID เดียวกับข้อ 3.1

---

## 4️⃣ Backend → Railway

### 4.1 ติดตั้ง + login CLI 🟢 `[คุณทำ]`
```bash
npm install -g @railway/cli
railway login          # เปิด browser ให้ยืนยันตัวตน — ผ่านแล้วบอกผมได้เลย
```

### 4.2 สร้างโปรเจกต์ + deploy 🔵 `[รันได้]`
```bash
cd backend
railway init           # ตั้งชื่อโปรเจกต์ เช่น slip-buu-api
railway up             # build + deploy (อ่าน railway.toml อัตโนมัติ)
```

### 4.3 ตั้ง Environment Variables 🔵 `[รันได้]`
> ⚠️ **อย่า** ตั้ง `PORT` เอง — Railway กำหนดให้อัตโนมัติ (โค้ดอ่าน `process.env.PORT`)
> `CORS_ORIGIN` เว้นว่างไว้ก่อน เดี๋ยวขั้นที่ 7 ค่อยใส่ URL Vercel

```bash
railway variables \
  --set "SUPABASE_URL=https://xxxx.supabase.co" \
  --set "SUPABASE_SERVICE_KEY=<service_role key>" \
  --set "GEMINI_API_KEY=<gemini key>" \
  --set "LINE_LOGIN_CHANNEL_ID=<channel id>"
```

### 4.4 เปิด public URL 🟢 `[คุณทำ]`
1. Railway dashboard → service → **Settings → Networking → Generate Domain**
2. คัดลอก URL ที่ได้ (เช่น `https://slip-buu-api.up.railway.app`) → `VITE_API_URL`

### 4.5 เช็คว่า backend ตื่น 🔵 `[รันได้]`
```bash
curl https://<railway-url>/        # ต้องได้ {"ok":true,"service":"slip-buu-backend"}
```

---

## 5️⃣ Frontend → Vercel

### 5.1 ติดตั้ง + login CLI 🟢 `[คุณทำ]`
```bash
npm install -g vercel
vercel login           # ยืนยันตัวตนทาง email/browser
```

### 5.2 ตั้ง Environment Variables 🔵 `[รันได้]`
> ⚠️ ตัวแปร `VITE_*` ถูกฝังตอน **build** — ต้องตั้งให้ครบ**ก่อน** deploy

```bash
cd frontend
vercel link            # ผูกโฟลเดอร์นี้กับโปรเจกต์ Vercel (สร้างใหม่ได้เลย)
vercel env add VITE_LIFF_ID production     # วางค่า LIFF ID
vercel env add VITE_API_URL production     # วาง URL Railway จากข้อ 4.4
```

### 5.3 Deploy 🔵 `[รันได้]`
```bash
vercel --prod          # ได้ URL เช่น https://slip-buu.vercel.app
```
คัดลอก URL production นี้ไว้ → ใช้ในขั้น 6 และ 7

---

## 6️⃣ ย้อนกลับไปแก้ LIFF Endpoint 🟢 `[คุณทำ]`

1. LINE Console → LIFF app เดิม → **Edit**
2. **Endpoint URL:** เปลี่ยนจาก placeholder เป็น **URL Vercel จริง** (จากข้อ 5.3)
3. Save

---

## 7️⃣ ย้อนกลับไปตั้ง CORS ที่ Railway 🔵 `[รันได้]`

```bash
cd backend
railway variables --set "CORS_ORIGIN=https://slip-buu.vercel.app"   # ใส่ domain Vercel จริง (ไม่มี / ท้าย)
railway up          # redeploy ให้ค่าใหม่มีผล
```
> ถ้ามีหลาย domain คั่นด้วย comma เช่น `https://a.vercel.app,https://b.vercel.app`
> Preview deployment ของ Vercel จะมี subdomain ต่างกัน — ถ้าจะทดสอบ preview ต้องเพิ่ม domain นั้นด้วย หรือเทสบน production domain อย่างเดียว

---

## 8️⃣ Rich Menu (LINE OA) 🟢 `[คุณทำ]`

1. ไป https://manager.line.biz/ → เลือก OA ของคุณ
2. **Rich menu** → สร้างใหม่ → ออกแบบให้มีปุ่ม "สแกนสลิป"
3. ตั้ง Action เป็น **Link (URI):**
   ```
   https://liff.line.me/<LIFF_ID>
   ```
4. เปิดใช้งาน (Display)

---

## ✅ 9. ทดสอบ End-to-End

| # | ขั้นตอน | ผลที่คาดหวัง |
|---|---|---|
| 1 | เปิด LINE → กด Rich Menu | LIFF เปิดขึ้น เห็นหน้าหลัก + ชื่อ/รูปโปรไฟล์ |
| 2 | copy URL ไปเปิดใน browser ปกติ | เด้งหน้า "ใช้งานผ่าน LINE เท่านั้น" |
| 3 | ถ่าย/เลือกสลิป → อัพโหลด | ได้ข้อมูล OCR + สรุปผล inline |
| 4 | ส่งสลิปเดิมซ้ำ | แจ้ง "สลิปนี้เคยส่งมาแล้ว" |
| 5 | หน้า Report | ยอดรายวัน/เดือน/ปี ถูกต้อง |
| 6 | กดสลิป → แก้ไข → บันทึก | ข้อมูลอัปเดต |
| 7 | กด "ส่งสรุปไปไลน์" | Target Picker เปิด → ส่งข้อความได้ |

---

## 🔧 Troubleshooting

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| หน้าเว็บโหลดแต่ขาว / error LIFF | `VITE_LIFF_ID` ผิด หรือ Endpoint URL ใน LIFF ไม่ตรงกับ domain Vercel |
| อัพโหลดแล้ว 401 | `LINE_LOGIN_CHANNEL_ID` ไม่ตรงกับ channel ของ LIFF |
| อัพโหลดแล้วโดน CORS block | `CORS_ORIGIN` ไม่ตรงกับ domain Vercel (เช็คมี `https://` ไม่มี `/` ท้าย) แล้ว `railway up` ใหม่ |
| OCR error | `GEMINI_API_KEY` ผิด / หมดโควต้า — ดู log: `railway logs` |
| รูปสลิปในหน้า Report ไม่ขึ้น | ยังไม่ได้สร้าง bucket `slips` / signed URL หมดอายุ — ลองรีเฟรชหน้า (ออก signed URL ใหม่) |
| insert DB fail | ยังไม่ได้รัน `schema.sql` หรือ migration 002 |

ดู log backend แบบ realtime: `railway logs`

---

## 📌 สรุป Environment Variables ทั้งหมด

**Railway (backend)**
| Key | ค่า |
|---|---|
| `SUPABASE_URL` | จาก Supabase Settings → API |
| `SUPABASE_SERVICE_KEY` | service_role key (secret) |
| `GEMINI_API_KEY` | จาก Google AI Studio |
| `LINE_LOGIN_CHANNEL_ID` | Channel ID ของ LINE Login channel |
| `CORS_ORIGIN` | URL Vercel (ตั้งทีหลังในขั้น 7) |

**Vercel (frontend)**
| Key | ค่า |
|---|---|
| `VITE_LIFF_ID` | LIFF ID จาก LINE Console |
| `VITE_API_URL` | URL Railway |
