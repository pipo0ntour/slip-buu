import { Button } from '@/components/ui/button'

// การ์ด "เซสชันหมดอายุ" ใช้ร่วมทุกหน้าที่ดึงข้อมูลจาก backend — กดลองใหม่เพื่อดึงซ้ำ
export default function SessionExpiredCard({ onRetry }) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-8 shadow-sm text-center">
      <p className="text-3xl mb-2">🔒</p>
      <p className="text-sm text-muted-foreground mb-4">
        เซสชันหมดอายุ กรุณาปิดแล้วเปิดใหม่ผ่านเมนูใน LINE
      </p>
      <Button variant="outline" className="h-11 rounded-xl" onClick={onRetry}>
        ลองใหม่
      </Button>
    </section>
  )
}
