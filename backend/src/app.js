import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import slipRoute from './routes/slip.js'
import reportRoute from './routes/report.js'
import { lineAuth } from './services/lineAuth.js'

const app = express()

// จำกัด CORS เฉพาะโดเมนที่กำหนดใน CORS_ORIGIN (คั่นด้วย comma) — ถ้าไม่ตั้งไว้จะอนุญาตทุก origin
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(
  cors(
    allowedOrigins.length
      ? {
          origin(origin, cb) {
            // อนุญาต request ที่ไม่มี origin (health check / curl) และ origin ใน allowlist
            // origin อื่นๆ: ไม่ใส่ CORS header (browser บล็อกเอง) แทนการ throw เป็น 500
            cb(null, !origin || allowedOrigins.includes(origin))
          },
        }
      : undefined
  )
)
app.use(express.json())

app.use('/api/slip', lineAuth, slipRoute)
app.use('/api/report', lineAuth, reportRoute)

app.get('/', (_req, res) => res.json({ ok: true, service: 'slip-buu-backend', version: '1.2.0' }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
