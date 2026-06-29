import { useEffect, useMemo, useState } from 'react'
import { Search as SearchIcon, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { apiGet } from '@/lib/api'
import { categoryMeta } from '@/lib/finance'
import { bkkToday, stepAnchor, isAtPresent, anchorParam } from '@/lib/period'
import SlipModal from '@/components/SlipModal'
import SessionExpiredCard from '@/components/SessionExpiredCard'
import GradientHeader from '@/components/GradientHeader'

const TYPE_FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'income', label: 'รายรับ' },
  { key: 'expense', label: 'รายจ่าย' },
]

// ข้อความที่ใช้ค้นในแต่ละรายการ (ชื่อ/โน้ต/หมวด/ธนาคาร/ยอด)
function haystack(s) {
  return [s.sender_name, s.receiver_name, s.note, s.category, s.bank_name, String(s.amount ?? '')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export default function Search() {
  const toast = useToast()
  const [anchor, setAnchor] = useState(bkkToday) // ปีอ้างอิง (ค้นทีละปี)
  const [slips, setSlips] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [selectedSlip, setSelectedSlip] = useState(null)

  const atPresent = isAtPresent(anchor, 'yearly')

  async function fetchSlips() {
    setLoading(true)
    try {
      const res = await apiGet(`/api/report?period=yearly&date=${anchorParam(anchor)}`)
      if (res.status === 401) { setSessionExpired(true); setSlips([]); return }
      setSessionExpired(false)
      const j = res.ok ? await res.json() : null
      setSlips(j?.slips || [])
    } catch {
      setSlips([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSlips() }, [anchor])

  // แก้/ลบในชีต → อัปเดตลิสต์ในเครื่องทันที ไม่ต้องโหลดใหม่
  function handleSaved(updated) {
    setSlips(prev => prev.map(s => (s.id === updated.id ? { ...s, ...updated } : s)))
    setSelectedSlip(prev => (prev ? { ...prev, ...updated } : prev))
  }
  function handleDeleted(id) {
    setSlips(prev => prev.filter(s => s.id !== id))
    setSelectedSlip(null)
  }

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return slips.filter(s => {
      if (type === 'income' && s.type === 'expense') return false
      if (type === 'expense' && s.type !== 'expense') return false
      if (needle && !haystack(s).includes(needle)) return false
      return true
    })
  }, [slips, q, type])

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      <GradientHeader>
        <header>
          <h1 className="text-2xl font-bold leading-tight">ค้นหา</h1>
          <p className="text-sm text-foreground/70 leading-tight">ค้นรายการย้อนหลังตามชื่อ/หมวด/ยอด</p>
        </header>
      </GradientHeader>

      <div className="mx-auto max-w-md px-5 -mt-5 pt-5 rounded-t-[2rem] bg-background">

        {sessionExpired ? (
          <SessionExpiredCard onRetry={fetchSlips} />
        ) : (
        <>
        {/* ช่องค้นหา — แถว flex เดียว: ไอคอนกึ่งกลางซ้าย ต่อด้วยช่องพิมพ์ แล้วปุ่มล้าง */}
        <div className="flex items-center gap-2 h-12 rounded-xl border border-input bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
          <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="พิมพ์ชื่อ ร้าน หมวด หรือยอดเงิน..."
            className="flex-1 min-w-0 bg-transparent text-base focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="ล้าง" className="shrink-0 text-muted-foreground active:text-foreground">
              <X className="size-5" />
            </button>
          )}
        </div>

        {/* ฟิลเตอร์ประเภท */}
        <div className="flex gap-2 mt-3">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setType(f.key)}
              className={`h-9 px-4 rounded-full text-sm font-medium border transition-colors ${
                type === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* เลื่อนปี */}
        <div className="flex items-center justify-between gap-2 mt-3">
          <button onClick={() => setAnchor(a => stepAnchor(a, 'yearly', -1))} aria-label="ปีก่อนหน้า"
            className="w-9 h-9 rounded-xl border border-border bg-card flex items-center justify-center active:bg-accent">
            <ChevronLeft className="size-5" />
          </button>
          <p className="text-sm font-semibold">ปี {anchor.y + 543}</p>
          <button onClick={() => !atPresent && setAnchor(a => stepAnchor(a, 'yearly', 1))} disabled={atPresent} aria-label="ปีถัดไป"
            className="w-9 h-9 rounded-xl border border-border bg-card flex items-center justify-center active:bg-accent disabled:opacity-30">
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* สรุปผลค้น — โชว์แค่จำนวนรายการ */}
        <p className="mt-4 text-xs text-muted-foreground">
          {loading ? 'กำลังโหลด...' : `พบ ${results.length} รายการ`}
        </p>

        {/* ผลลัพธ์ — แตะแถวเพื่อดู/แก้/ลบ */}
        {!loading && results.length > 0 && (
          <section className="mt-2 rounded-2xl border border-border bg-card shadow-sm overflow-hidden divide-y divide-border">
            {results.map((s, i) => {
              const isExpense = s.type === 'expense'
              const meta = categoryMeta(s.category)
              const dateText = s.transaction_at
                ? new Date(s.transaction_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
                : '-'
              return (
                <button
                  key={s.id || i}
                  type="button"
                  onClick={() => setSelectedSlip(s)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left active:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">{meta.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{s.sender_name || s.category || s.note || 'ไม่ระบุชื่อ'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {(s.category || s.note || s.bank_name || '-')} · {dateText}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <p className={`text-sm font-bold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                      {isExpense ? '-' : '+'}{Number(s.amount || 0).toLocaleString('th-TH')} ฿
                    </p>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </button>
              )
            })}
          </section>
        )}

        {!loading && results.length === 0 && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-8 shadow-sm text-center">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-sm text-muted-foreground">{q || type !== 'all' ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีรายการในปีนี้'}</p>
          </section>
        )}
        </>
        )}
      </div>

      {selectedSlip && (
        <SlipModal
          slip={selectedSlip}
          toast={toast}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setSelectedSlip(null)}
        />
      )}
    </div>
  )
}
