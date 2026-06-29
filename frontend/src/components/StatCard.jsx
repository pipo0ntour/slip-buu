// การ์ดสถิติ 1 ช่อง — ใช้ร่วมหลายหน้า (รายงาน/ฉัน/สถิติ)
// tone: income=เขียว, expense=แดง, default=สีปกติ | size: lg=2xl (ดีฟอลต์), md=xl
export default function StatCard({ label, value, tone = 'default', size = 'lg' }) {
  const color = tone === 'income' ? 'text-green-600' : tone === 'expense' ? 'text-red-600' : 'text-foreground'
  const valueSize = size === 'md' ? 'text-xl' : 'text-2xl'
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 ${valueSize} font-bold ${color}`}>{value}</p>
    </div>
  )
}
