// Middleware: ตรวจสอบ LINE access token (จาก liff.getAccessToken ฝั่ง frontend)
// แล้วดึง line_user_id จากฝั่ง server เอง — กัน client ปลอม lineUserId เป็นของคนอื่น (IDOR)
const PROFILE_URL = 'https://api.line.me/v2/profile'
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

// DEV เท่านั้น: ผู้ใช้จำลองสำหรับทดสอบครบวงในเครื่อง — userId ตรงกับ LIFF mock ฝั่ง frontend
const DEV_USER_ID = 'U-dev-mock-0000000000000000000000000000'

export async function lineAuth(req, res, next) {
  try {
    // DEV bypass: ข้ามการยืนยัน LINE token เพื่อทดสอบในเครื่อง (เปิดด้วย DEV_FAKE_LINE_USER=true)
    // กัน 2 ชั้น: ต้องไม่ใช่ production และต้องตั้ง flag ชัดเจน — ห้ามเปิดบน production เด็ดขาด
    if (process.env.NODE_ENV !== 'production' && process.env.DEV_FAKE_LINE_USER === 'true') {
      console.warn('[dev] lineAuth bypass เปิดอยู่ — ใช้ผู้ใช้จำลอง (ต้องไม่ใช้บน production)')
      req.lineUser = { userId: DEV_USER_ID, displayName: 'โหมดพัฒนา (Dev)', pictureUrl: null }
      return next()
    }

    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'กรุณาเปิดใช้งานผ่าน LINE' })
    }

    // (ออปชัน) ยืนยันว่า token ออกให้ channel ของเราจริง — เปิดใช้เมื่อกำหนด LINE_LOGIN_CHANNEL_ID
    const channelId = process.env.LINE_LOGIN_CHANNEL_ID
    if (channelId) {
      const vr = await fetch(`${VERIFY_URL}?access_token=${encodeURIComponent(token)}`)
      const v = vr.ok ? await vr.json() : null
      if (!v || String(v.client_id) !== String(channelId)) {
        return res.status(401).json({ status: 'error', message: 'เซสชันไม่ถูกต้อง กรุณาเปิดใหม่' })
      }
    }

    // ดึงโปรไฟล์ด้วย token เดียวกัน — ถ้า token หมดอายุ/ปลอม จะไม่ได้สถานะ 200
    const pr = await fetch(PROFILE_URL, { headers: { Authorization: `Bearer ${token}` } })
    if (!pr.ok) {
      return res.status(401).json({ status: 'error', message: 'เซสชันหมดอายุ กรุณาเปิดใหม่' })
    }
    const profile = await pr.json()
    if (!profile.userId) {
      return res.status(401).json({ status: 'error', message: 'โทเคนไม่ถูกต้อง' })
    }

    req.lineUser = {
      userId: profile.userId,
      displayName: profile.displayName || null,
      pictureUrl: profile.pictureUrl || null,
    }
    next()
  } catch (err) {
    console.error('lineAuth error:', err.message)
    res.status(401).json({ status: 'error', message: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' })
  }
}
