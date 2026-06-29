// หัวหน้าจอ "เขียวทึบ" ตามดีไซน์ FinWise — เต็มความกว้างจอ ไม่มีมุมโค้งล่าง
// แผงเนื้อหาด้านล่าง (bg-background, rounded-t) จะเลื่อนขึ้นมาทับด้วย -mt → เผยเขียวที่มุมบนโค้ง
// ตัวอักษร/ไอคอนข้างในเป็นสีเข้ม (inherit text-foreground) เพราะเขียว #00D09E สว่างพอให้อ่านชัด
// ยอดเงินที่อยากเด่นค่อยกำหนด text-white เฉพาะจุด
export default function GradientHeader({ children, className = '' }) {
  return (
    <div className="bg-primary">
      <div className={`mx-auto max-w-md px-5 pt-7 pb-12 ${className}`}>
        {children}
      </div>
    </div>
  )
}
