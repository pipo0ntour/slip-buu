import { useEffect, useState } from 'react'

// แสดงอวตารการ์ตูนจาก "ลักษณะ" (face) โดยโหลดตัว render DiceBear แบบ lazy
// → ไลบรารีอวตารก้อนใหญ่ไม่ถูกรวมใน bundle หน้าแรก โหลดเฉพาะตอนมีอวตารจริง
// ระหว่างรอ (หรือไม่มี face) จะ fallback ไปรูป LINE / พื้นหลังจาง
export default function CartoonAvatar({ face, fallbackUrl, className = '' }) {
  const [uri, setUri] = useState(null)

  useEffect(() => {
    if (!face) { setUri(null); return }
    let alive = true
    import('@/lib/avatar')
      .then(({ avatarDataUri }) => { if (alive) setUri(avatarDataUri(face)) })
      .catch(() => {})
    return () => { alive = false }
  }, [face])

  if (uri) return <img src={uri} className={`${className} object-cover bg-muted`} alt="" />
  if (fallbackUrl) return <img src={fallbackUrl} className={`${className} object-cover`} alt="" />
  return <div className={`${className} bg-primary/10`} />
}
