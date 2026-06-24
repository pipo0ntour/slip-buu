import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import slipRoute from './routes/slip.js'
import reportRoute from './routes/report.js'
import avatarRoute from './routes/avatar.js'
import { lineAuth } from './services/lineAuth.js'
import { startKeepAlive } from './services/keepAlive.js'

const app = express()

// จำกัด CORS เฉพาะโดเมนที่กำหนดใน CORS_ORIGIN (คั่นด้วย comma) — ถ้าไม่ตั้งไว้จะอนุญาตทุก origin
// แต่ละ entry เป็นได้ทั้ง origin เป๊ะ (https://app.vercel.app) หรือ pattern ที่มี * เช่น
// https://frontend-*.vercel.app — ครอบคลุม URL ใหม่ที่ Vercel ออกให้ทุกครั้งที่ deploy (กัน CORS พังหลัง redeploy)
const allowRules = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((entry) =>
    entry.includes('*')
      ? new RegExp('^' + entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]*') + '$')
      : entry
  )

const isAllowedOrigin = (origin) =>
  allowRules.some((rule) => (rule instanceof RegExp ? rule.test(origin) : rule === origin))

app.use(
  cors(
    allowRules.length
      ? {
          origin(origin, cb) {
            // อนุญาต request ที่ไม่มี origin (health check / curl) และ origin ที่เข้ากับ allowlist
            // origin อื่นๆ: ไม่ใส่ CORS header (browser บล็อกเอง) แทนการ throw เป็น 500
            cb(null, !origin || isAllowedOrigin(origin))
          },
        }
      : undefined
  )
)
app.use(express.json())

app.use('/api/slip', lineAuth, slipRoute)
app.use('/api/report', lineAuth, reportRoute)
app.use('/api/avatar', lineAuth, avatarRoute)

app.get('/', (_req, res) => res.json({ ok: true, service: 'slip-buu-backend', version: '1.2.0' }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  startKeepAlive() // แตะ DB เป็นรอบ กัน Supabase free tier pause
})
