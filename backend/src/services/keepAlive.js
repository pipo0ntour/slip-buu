import { supabase } from './supabase.js'

// กัน Supabase free tier "หยุดโปรเจกต์อัตโนมัติเมื่อไม่มี activity 7 วัน"
// โดยแตะ DB เบาสุด (นับแถวแบบ head — ไม่ดึงข้อมูลกลับมา) เป็นรอบ ถือเป็น activity ให้ตัวจับเวลา reset
// ตั้งรอบผ่าน KEEPALIVE_HOURS (ดีฟอลต์ 24 ชม. — ห่างจากเส้น 7 วันมากพอเผื่อ restart/พลาดบางรอบ)
const HOURS = Math.max(1, Number(process.env.KEEPALIVE_HOURS) || 24)
const INTERVAL_MS = HOURS * 60 * 60 * 1000

async function ping() {
  try {
    const { error } = await supabase.from('users').select('*', { head: true, count: 'exact' })
    if (error) console.warn('keep-alive query error:', error.message)
  } catch (err) {
    console.warn('keep-alive failed:', err.message)
  }
}

/**
 * เริ่มแตะ DB เป็นรอบ — แตะครั้งแรก 30 วิหลังบูต (ให้ server พร้อมก่อน) แล้วทุก ๆ HOURS ชั่วโมง
 * ใช้ .unref() เพื่อไม่ให้ timer กันไม่ให้ process ปิดเอง (express server เป็นตัวคุม lifecycle อยู่แล้ว)
 */
export function startKeepAlive() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.warn('keep-alive ปิดอยู่ — ไม่พบ SUPABASE_URL/SUPABASE_SERVICE_KEY')
    return
  }
  setTimeout(ping, 30_000).unref?.()
  setInterval(ping, INTERVAL_MS).unref?.()
  console.log(`Keep-alive เปิดอยู่ — แตะ DB ทุก ${HOURS} ชม.`)
}
