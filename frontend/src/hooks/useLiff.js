import liff from '@line/liff'

const LINE_OA_ID = '@218eqenn'
const LINE_ADD_URL = `https://line.me/R/ti/p/${LINE_OA_ID}`

// โปรไฟล์จำลองสำหรับ dev ในเครื่อง (เปิดใน browser ปกติได้โดยไม่ติด LIFF guard)
// ใช้เฉพาะตอน `npm run dev` (import.meta.env.DEV) — ตอน build production ค่านี้ถูกตัดออก
const DEV_MOCK_PROFILE = {
  userId: 'U-dev-mock-0000000000000000000000000000',
  displayName: 'โหมดพัฒนา (Dev)',
  pictureUrl: '',
  statusMessage: '',
}

export async function initLiff(liffId) {
  // DEV เท่านั้น: ข้าม LIFF init + guard เพื่อพัฒนา UI ใน browser ปกติได้
  // (โค้ดส่วนนี้ถูก tree-shake ทิ้งตอน vite build → production ยัง guard เหมือนเดิม)
  if (import.meta.env.DEV) {
    console.info('[dev] LIFF mock เปิดอยู่ — ข้าม guard isInClient() (เฉพาะตอน dev เท่านั้น)')
    return DEV_MOCK_PROFILE
  }

  await liff.init({ liffId })

  if (!liff.isInClient()) {
    showAddLineOAPage()
    throw new Error('Not in LINE client')
  }

  if (!liff.isLoggedIn()) {
    liff.login()
    throw new Error('Not logged in')
  }

  return liff.getProfile()
}

function showAddLineOAPage() {
  document.body.style.cssText = 'margin:0;background:#f5f5f5;font-family:Sarabun,sans-serif'
  document.body.innerHTML = `
    <div style="
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;min-height:100vh;padding:32px;
      text-align:center;box-sizing:border-box
    ">
      <div style="
        width:88px;height:88px;background:#00B900;border-radius:26px;
        display:flex;align-items:center;justify-content:center;margin-bottom:28px;
        box-shadow:0 6px 20px rgba(0,185,0,0.35)
      ">
        <svg width="52" height="52" viewBox="0 0 48 48" fill="white">
          <path d="M24 4C13 4 4 11.6 4 21c0 6.4 4.2 12 10.5 15.2-.4 1.6-1.5 5.8-1.7 6.7-.3 1 .4 1 .8.7 1-.6 5.9-3.9 8.3-5.5.7.1 1.4.1 2.1.1 11 0 20-7.6 20-17S35 4 24 4z"/>
        </svg>
      </div>
      <h2 style="font-size:22px;margin:0 0 10px;color:#111;font-weight:700">
        ระบบนี้ใช้งานผ่าน LINE เท่านั้น
      </h2>
      <p style="font-size:15px;color:#666;margin:0 0 36px;line-height:1.8">
        กรุณาแอด LINE OA ของเรา<br>
        แล้วใช้งานผ่านเมนูในแอป LINE
      </p>
      <a
        href="${LINE_ADD_URL}"
        style="
          display:inline-block;background:#00B900;color:#fff;
          text-decoration:none;font-size:17px;font-weight:700;
          padding:16px 44px;border-radius:50px;
          box-shadow:0 4px 14px rgba(0,185,0,0.4)
        "
      >
        แอด LINE OA (Slip-BUU)
      </a>
      <p style="font-size:13px;color:#aaa;margin-top:14px">${LINE_OA_ID}</p>
    </div>
  `
}
