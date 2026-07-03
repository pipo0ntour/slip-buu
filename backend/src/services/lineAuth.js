// Middleware: ตรวจสอบ LINE access token (จาก liff.getAccessToken ฝั่ง frontend)
// แล้วดึง line_user_id จากฝั่ง server เอง — กัน client ปลอม lineUserId เป็นของคนอื่น (IDOR)
const PROFILE_URL = 'https://api.line.me/v2/profile'
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

// DEV เท่านั้น: ผู้ใช้จำลองสำหรับทดสอบครบวงในเครื่อง — userId ตรงกับ LIFF mock ฝั่ง frontend
const DEV_USER_ID = 'U-dev-mock-0000000000000000000000000000'

// ── Cache ผลยืนยัน token (in-memory) ──
// เดิมทุก request ยิง LINE API 1-2 ครั้ง: ช้า (เพิ่ม RTT ~200-500ms/req) และเสี่ยงโดน LINE จำกัด IP
// ของ server ถ้าโดนถล่ม token มั่ว ๆ → cache ผลไว้: token เดิมในช่วง TTL ไม่ต้องยิงซ้ำ
const OK_TTL_MS = 5 * 60 * 1000 // token ที่ผ่านแล้ว — LINE access token อายุจริงยาวกว่านี้มาก (ปลอดภัยที่จะเชื่อ 5 นาที)
const FAIL_TTL_MS = 60 * 1000 // token ที่ไม่ผ่าน — กันยิง token เดิมซ้ำรัว ๆ ให้เรา flood LINE API เอง
const MAX_CACHE = 5000 // เพดานจำนวน entry กัน memory โต (สเกลแอปนี้ ผู้ใช้ active พร้อมกันไม่ถึง)
const FETCH_TIMEOUT_MS = 5000 // LINE API ช้า/ค้าง → ตัดทิ้ง อย่าปล่อย connection สะสม

const tokenCache = new Map() // token -> { ok: boolean, user?: object, exp: number(ms) }

function cacheGet(token) {
  const hit = tokenCache.get(token)
  if (!hit) return null
  if (Date.now() > hit.exp) {
    tokenCache.delete(token)
    return null
  }
  return hit
}

function cacheSet(token, entry) {
  if (tokenCache.size >= MAX_CACHE) {
    // เต็ม: กวาดตัวหมดอายุก่อน ถ้ายังเต็มอยู่ (โดนถล่ม token ไม่ซ้ำ) ล้างทั้งหมด — โครงสร้างง่ายพอสำหรับสเกลนี้
    const now = Date.now()
    for (const [k, v] of tokenCache) if (now > v.exp) tokenCache.delete(k)
    if (tokenCache.size >= MAX_CACHE) tokenCache.clear()
  }
  tokenCache.set(token, entry)
}

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

    // เคยยืนยัน token นี้ในช่วง TTL แล้ว → ใช้ผลเดิม ไม่ยิง LINE API ซ้ำ
    const cached = cacheGet(token)
    if (cached) {
      if (!cached.ok) {
        return res.status(401).json({ status: 'error', message: 'เซสชันหมดอายุ กรุณาเปิดใหม่' })
      }
      req.lineUser = { ...cached.user }
      return next()
    }

    // ยืนยันว่า token ออกให้ channel ของเราจริง — production บังคับตั้ง LINE_LOGIN_CHANNEL_ID (ดู boot guard ใน app.js)
    // ไม่งั้น token จาก LINE Login channel "ไหนก็ได้" จะผ่านด่านโปรไฟล์ข้างล่างได้
    const channelId = process.env.LINE_LOGIN_CHANNEL_ID
    if (channelId) {
      const vr = await fetch(`${VERIFY_URL}?access_token=${encodeURIComponent(token)}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      const v = vr.ok ? await vr.json() : null
      if (!v || String(v.client_id) !== String(channelId)) {
        cacheSet(token, { ok: false, exp: Date.now() + FAIL_TTL_MS })
        return res.status(401).json({ status: 'error', message: 'เซสชันไม่ถูกต้อง กรุณาเปิดใหม่' })
      }
    }

    // ดึงโปรไฟล์ด้วย token เดียวกัน — ถ้า token หมดอายุ/ปลอม จะไม่ได้สถานะ 200
    const pr = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!pr.ok) {
      cacheSet(token, { ok: false, exp: Date.now() + FAIL_TTL_MS })
      return res.status(401).json({ status: 'error', message: 'เซสชันหมดอายุ กรุณาเปิดใหม่' })
    }
    const profile = await pr.json()
    if (!profile.userId) {
      cacheSet(token, { ok: false, exp: Date.now() + FAIL_TTL_MS })
      return res.status(401).json({ status: 'error', message: 'โทเคนไม่ถูกต้อง' })
    }

    const user = {
      userId: profile.userId,
      displayName: profile.displayName || null,
      pictureUrl: profile.pictureUrl || null,
    }
    cacheSet(token, { ok: true, user, exp: Date.now() + OK_TTL_MS })
    req.lineUser = { ...user }
    next()
  } catch (err) {
    console.error('lineAuth error:', err.message)
    res.status(401).json({ status: 'error', message: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' })
  }
}
