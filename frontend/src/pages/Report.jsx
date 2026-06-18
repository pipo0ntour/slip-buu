import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Send, X, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '../context/ToastContext'
import { apiGet, apiPatchJson, apiDelete } from '@/lib/api'
import { CATEGORIES } from '@/components/TransactionForm'
import liff from '@line/liff'

const PERIODS = [
  { key: 'daily', label: 'รายวัน' },
  { key: 'monthly', label: 'รายเดือน' },
  { key: 'yearly', label: 'รายปี' },
]

// ───────── ตัวช่วยเลื่อนช่วงเวลา (วันอ้างอิงตามปฏิทินไทย Asia/Bangkok) ─────────
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000

// วันนี้ตามเวลาไทย → { y, mo, d } (mo เริ่มที่ 0)
function bkkToday() {
  const n = new Date(Date.now() + TZ_OFFSET_MS)
  return { y: n.getUTCFullYear(), mo: n.getUTCMonth(), d: n.getUTCDate() }
}

// เลื่อนวันอ้างอิงทีละ วัน/เดือน/ปี (dir = -1 ย้อน, +1 ถัดไป) — Date.UTC จัดการ overflow ให้เอง
function stepAnchor(a, period, dir) {
  let ms
  if (period === 'daily') ms = Date.UTC(a.y, a.mo, a.d + dir)
  else if (period === 'monthly') ms = Date.UTC(a.y, a.mo + dir, 1)
  else ms = Date.UTC(a.y + dir, 0, 1)
  const t = new Date(ms)
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate() }
}

// อยู่ที่ช่วงปัจจุบันแล้วหรือยัง (ใช้ปิดปุ่ม "ถัดไป" กันเลื่อนไปอนาคต)
function isAtPresent(a, period) {
  const t = bkkToday()
  if (period === 'yearly') return a.y >= t.y
  if (period === 'monthly') return a.y > t.y || (a.y === t.y && a.mo >= t.mo)
  return a.y > t.y || (a.y === t.y && (a.mo > t.mo || (a.mo === t.mo && a.d >= t.d)))
}

// แปลงวันอ้างอิงเป็น YYYY-MM-DD (เกรกอเรียน) ส่งให้ backend
function anchorParam(a) {
  const pad = n => String(n).padStart(2, '0')
  return `${a.y}-${pad(a.mo + 1)}-${pad(a.d)}`
}

// ป้ายช่วงเวลา (พ.ศ. ตาม locale ไทย ให้สอดคล้องกับส่วนอื่นของแอป)
function anchorLabel(a, period) {
  const dt = new Date(Date.UTC(a.y, a.mo, a.d))
  if (period === 'daily') return dt.toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  if (period === 'monthly') return dt.toLocaleDateString('th-TH', { timeZone: 'UTC', month: 'long', year: 'numeric' })
  return `ปี ${a.y + 543}`
}

// คำนวณยอดรายรับ/รายจ่าย/คงเหลือจากลิสต์สลิป (ใช้หลังแก้ไขข้อมูลในเครื่อง)
function summarize(slips) {
  const totalIncome = slips
    .filter(s => s.type !== 'expense')
    .reduce((a, s) => a + (Number(s.amount) || 0), 0)
  const totalExpense = slips
    .filter(s => s.type === 'expense')
    .reduce((a, s) => a + (Number(s.amount) || 0), 0)
  return { totalIncome, totalExpense, net: totalIncome - totalExpense, count: slips.length }
}

// จัดกลุ่มรายจ่ายตามหมวดหมู่ (เรียงมาก→น้อย) + สัดส่วนของแต่ละหมวด — ดูว่าเงินหมดไปกับอะไรเยอะสุด
function expenseByCategory(slips) {
  const map = new Map()
  let total = 0
  for (const s of slips) {
    if (s.type !== 'expense') continue
    const amount = Number(s.amount) || 0
    if (amount <= 0) continue
    const key = s.category || 'อื่นๆ'
    map.set(key, (map.get(key) || 0) + amount)
    total += amount
  }
  const rows = [...map.entries()]
    .map(([category, amount]) => ({ category, amount, pct: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
  return { total, rows }
}

const fmtBaht = n => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

export default function Report() {
  const navigate = useNavigate()
  const toast = useToast()
  const [period, setPeriod] = useState('daily')
  const [anchor, setAnchor] = useState(bkkToday) // วันอ้างอิงสำหรับดูย้อนหลัง (เริ่มที่วันนี้)
  const [showDropdown, setShowDropdown] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [selectedSlip, setSelectedSlip] = useState(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  // อัปเดต state หลังแก้ไขสลิปสำเร็จ — รายการในลิสต์ + ยอดรวม + modal ที่เปิดอยู่
  function handleSaved(updated) {
    setData(prev => {
      if (!prev) return prev
      const slips = prev.slips.map(s => (s.id === updated.id ? { ...s, ...updated } : s))
      return { ...prev, slips, ...summarize(slips) }
    })
    setSelectedSlip(prev => (prev ? { ...prev, ...updated } : prev))
  }

  // อัปเดต state หลังลบสลิป — เอาออกจากลิสต์ + คำนวณยอดใหม่ + ปิด modal
  function handleDeleted(id) {
    setData(prev => {
      if (!prev) return prev
      const slips = prev.slips.filter(s => s.id !== id)
      return { ...prev, slips, ...summarize(slips) }
    })
    setSelectedSlip(null)
  }

  useEffect(() => {
    fetchReport()
  }, [period, anchor])

  const atPresent = isAtPresent(anchor, period)
  const goPrev = () => setAnchor(a => stepAnchor(a, period, -1))
  const goNext = () => { if (!atPresent) setAnchor(a => stepAnchor(a, period, 1)) }
  const goToday = () => setAnchor(bkkToday())

  async function fetchReport() {
    setLoading(true)
    try {
      const res = await apiGet(`/api/report?period=${period}&date=${anchorParam(anchor)}`)
      if (res.status === 401) { setSessionExpired(true); setData(null); return }
      if (!res.ok) throw new Error()
      setSessionExpired(false)
      setData(await res.json())
    } catch {
      setData({ totalAmount: 0, count: 0, saved: 0, needsCheck: 0, slips: [] })
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!data) return
    setSending(true)
    try {
      const text =
        `📊 สรุปยอด ${anchorLabel(anchor, period)}\n` +
        `รายรับ: ${fmtBaht(data.totalIncome)} บาท\n` +
        `รายจ่าย: ${fmtBaht(data.totalExpense)} บาท\n` +
        `คงเหลือ: ${fmtBaht(data.net)} บาท\n` +
        `จำนวน: ${data.count || 0} รายการ`
      await liff.shareTargetPicker([{ type: 'text', text }])
    } catch {
      // user cancelled
    } finally {
      setSending(false)
    }
  }

  const periodLabel = PERIODS.find(p => p.key === period)?.label

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="mx-auto max-w-md px-5 pt-6">

        <header className="mb-6">
          <h1 className="text-2xl font-bold leading-tight">รายงาน</h1>
          <p className="text-sm text-muted-foreground leading-tight">สรุปยอดสลิปโอนเงิน</p>
        </header>

        {sessionExpired ? (
          <SessionExpiredCard onRetry={fetchReport} />
        ) : (
        <>
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">สรุปยอด</h2>
            <div className="relative">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium"
                onClick={() => setShowDropdown(v => !v)}
              >
                {periodLabel}
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
              {showDropdown && (
                <>
                  {/* ชั้นโปร่งใสคลุมทั้งจอ — แตะที่ไหนก็ได้นอกเมนูเพื่อปิด */}
                  <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 rounded-xl border border-border bg-card shadow-md overflow-hidden min-w-[120px]">
                    {PERIODS.map(p => (
                      <button
                        key={p.key}
                        className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-accent ${period === p.key ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                        onClick={() => { setPeriod(p.key); setShowDropdown(false) }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* แถบเลื่อนช่วงเวลา — ดูย้อนหลังได้ (◀ ▶ เลื่อนตาม granularity ที่เลือก) */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <button
              type="button"
              onClick={goPrev}
              aria-label="ช่วงก่อนหน้า"
              className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center shrink-0 active:bg-accent transition-colors"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="text-center min-w-0">
              <p className="text-base font-semibold truncate">{anchorLabel(anchor, period)}</p>
              {!atPresent && (
                <button type="button" onClick={goToday} className="text-xs text-primary mt-0.5">
                  กลับช่วงปัจจุบัน
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={goNext}
              disabled={atPresent}
              aria-label="ช่วงถัดไป"
              className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center shrink-0 active:bg-accent transition-colors disabled:opacity-30 disabled:active:bg-card"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="รายรับ (บาท)" tone="income" value={loading ? '...' : fmtBaht(data?.totalIncome)} />
            <StatCard label="รายจ่าย (บาท)" tone="expense" value={loading ? '...' : fmtBaht(data?.totalExpense)} />
            <StatCard
              label="คงเหลือ (บาท)"
              tone={Number(data?.net ?? 0) < 0 ? 'expense' : 'default'}
              value={loading ? '...' : fmtBaht(data?.net)}
            />
            <StatCard label="จำนวนรายการ" value={loading ? '...' : String(data?.count ?? 0)} />
          </div>
        </section>

        {/* รายจ่ายตามหมวดหมู่ — เห็นว่าเงินหมดไปกับอะไรเยอะสุด */}
        {!loading && data?.slips?.length > 0 && (
          <CategoryBreakdown slips={data.slips} />
        )}

        {/* Slip list */}
        {!loading && data?.slips?.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">รายการล่าสุด</p>
            </div>
            <div className="divide-y divide-border">
              {data.slips.map((slip, i) => {
                const isExpense = slip.type === 'expense'
                const sub = slip.category || slip.note || slip.bank_name || '-'
                const dateText = slip.transaction_at
                  ? new Date(slip.transaction_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
                  : '-'
                return (
                  <button
                    key={slip.id || i}
                    className="w-full flex justify-between items-center gap-3 px-5 py-3 text-left active:bg-accent transition-colors"
                    onClick={() => setSelectedSlip(slip)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {slip.sender_name || slip.category || slip.note || 'ไม่ระบุชื่อ'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub} · {dateText}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <p className={`text-sm font-bold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                        {isExpense ? '-' : '+'}{Number(slip.amount || 0).toLocaleString('th-TH')} ฿
                      </p>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {!loading && data?.slips?.length === 0 && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-8 shadow-sm text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm text-muted-foreground">ยังไม่มีรายการ</p>
          </section>
        )}
        </>
        )}

        {/* Slip detail / edit modal */}
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

      <div className="fixed bottom-0 inset-x-0 border-t border-border bg-background/95 backdrop-blur px-5 py-3">
        <div className="mx-auto max-w-md flex gap-3">
          <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => navigate('/')}>
            กลับหน้าหลัก
          </Button>
          <Button className="flex-1 h-12 rounded-2xl" onClick={handleSend} disabled={!data || sending}>
            <Send className="size-4" />
            {sending ? 'กำลังส่ง...' : 'ส่งสรุปไปไลน์'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function CategoryBreakdown({ slips }) {
  const { total, rows } = expenseByCategory(slips)
  if (!rows.length) return null // ไม่มีรายจ่ายในช่วงนี้ → ไม่ต้องแสดง

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-baseline justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">รายจ่ายตามหมวดหมู่</p>
        <p className="text-xs text-muted-foreground">รวม {fmtBaht(total)} บาท</p>
      </div>
      <div className="px-5 pb-4 space-y-3">
        {rows.map(r => (
          <div key={r.category}>
            <div className="flex justify-between items-baseline gap-2 text-sm">
              <span className="font-medium truncate">{r.category}</span>
              <span className="shrink-0">
                <span className="font-semibold text-red-600">{Number(r.amount).toLocaleString('th-TH')} ฿</span>
                <span className="text-xs text-muted-foreground ml-1.5">{Math.round(r.pct * 100)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
              {/* อย่างน้อย 2% เพื่อให้หมวดที่ยอดน้อยมากยังเห็นแถบ */}
              <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(r.pct * 100, 2)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function StatCard({ label, value, tone = 'default' }) {
  const color = tone === 'income' ? 'text-green-600' : tone === 'expense' ? 'text-red-600' : 'text-foreground'
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function SessionExpiredCard({ onRetry }) {
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

// แปลง ISO → ค่าสำหรับ <input type="datetime-local"> (ตามเวลาเครื่องผู้ใช้)
function toDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function SlipModal({ slip, toast, onSaved, onDeleted, onClose }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function startEdit() {
    setForm({
      amount: slip.amount ?? '',
      type: slip.type === 'expense' ? 'expense' : 'income',
      sender_name: slip.sender_name ?? '',
      receiver_name: slip.receiver_name ?? '',
      bank_name: slip.bank_name ?? '',
      reference_no: slip.reference_no ?? '',
      category: slip.category ?? '',
      note: slip.note ?? '',
      transaction_at: toDatetimeLocal(slip.transaction_at),
    })
    setEditing(true)
  }

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        amount: form.amount === '' ? null : Number(form.amount),
        type: form.type,
        sender_name: form.sender_name.trim() || null,
        receiver_name: form.receiver_name.trim() || null,
        bank_name: form.bank_name.trim() || null,
        reference_no: form.reference_no.trim() || null,
        category: form.category || null,
        note: form.note.trim() || null,
        transaction_at: form.transaction_at ? new Date(form.transaction_at).toISOString() : null,
      }
      const res = await apiPatchJson(`/api/slip/${slip.id}`, payload)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'แก้ไขไม่สำเร็จ')
      onSaved(json.data)
      toast?.({ message: 'แก้ไขข้อมูลสำเร็จ', type: 'success' })
      setEditing(false)
    } catch (e) {
      toast?.({ message: e.message || 'แก้ไขไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await apiDelete(`/api/slip/${slip.id}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'ลบไม่สำเร็จ')
      toast?.({ message: 'ลบรายการแล้ว', type: 'success' })
      onDeleted?.(slip.id)
    } catch (e) {
      toast?.({ message: e.message || 'ลบไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
      setDeleting(false)
    }
  }

  const dateText = slip.transaction_at
    ? new Date(slip.transaction_at).toLocaleString('th-TH', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '-'
  const isExpense = slip.type === 'expense'

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center animate-fade-in"
      onClick={saving || deleting ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* ขีดจับ — บอกว่าเป็นแผ่นที่เลื่อนขึ้นมา ปิดได้ */}
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 border-b border-border">
          <div className="min-w-0">
            <p className="font-bold truncate">
              {editing ? 'แก้ไขรายละเอียด' : slip.sender_name || slip.category || slip.note || 'ไม่ระบุชื่อ'}
            </p>
            {!editing && (
              <p className="text-sm truncate">
                <span className={isExpense ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                  {isExpense ? 'รายจ่าย' : 'รายรับ'}
                </span>
                <span className="text-muted-foreground">
                  {' · '}{slip.bank_name || (slip.source === 'manual' ? 'สร้างเอง' : '-')}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {editing ? (
            <div className="space-y-3">
              {/* ประเภท: รายรับ / รายจ่าย */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setField('type', 'income')}
                  className={`h-11 rounded-xl text-sm font-semibold border transition-colors ${form.type !== 'expense' ? 'bg-green-600 text-white border-green-600' : 'bg-card text-muted-foreground border-border'}`}
                >
                  รายรับ
                </button>
                <button
                  type="button"
                  onClick={() => setField('type', 'expense')}
                  className={`h-11 rounded-xl text-sm font-semibold border transition-colors ${form.type === 'expense' ? 'bg-red-600 text-white border-red-600' : 'bg-card text-muted-foreground border-border'}`}
                >
                  รายจ่าย
                </button>
              </div>

              <Field label="จำนวนเงิน (บาท)" type="number" inputMode="decimal" value={form.amount} onChange={v => setField('amount', v)} />

              {/* หมวดหมู่ลัด */}
              <div>
                <span className="text-xs font-semibold text-muted-foreground">หมวดหมู่</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setField('category', form.category === c ? '' : c)}
                      className={`h-9 px-3 rounded-full text-sm font-medium border transition-colors ${form.category === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="โน้ต (ค่าอะไร)" value={form.note} onChange={v => setField('note', v)} />
              <Field label="ผู้โอน" value={form.sender_name} onChange={v => setField('sender_name', v)} />
              <Field label="ผู้รับ" value={form.receiver_name} onChange={v => setField('receiver_name', v)} />
              <Field label="ธนาคาร" value={form.bank_name} onChange={v => setField('bank_name', v)} />
              <Field label="เลขอ้างอิง" value={form.reference_no} onChange={v => setField('reference_no', v)} />
              <Field label="วันที่ทำรายการ" type="datetime-local" value={form.transaction_at} onChange={v => setField('transaction_at', v)} />
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                <DetailRow
                  label="จำนวนเงิน"
                  big
                  value={`${isExpense ? '-' : '+'}${Number(slip.amount || 0).toLocaleString('th-TH')} บาท`}
                  valueClass={isExpense ? 'text-red-600' : 'text-green-600'}
                />
                <DetailRow label="ประเภท" value={isExpense ? 'รายจ่าย' : 'รายรับ'} />
                {slip.category && <DetailRow label="หมวดหมู่" value={slip.category} />}
                {slip.note && <DetailRow label="โน้ต" value={slip.note} />}
                <DetailRow label="ผู้โอน" value={slip.sender_name} />
                <DetailRow label="ผู้รับ" value={slip.receiver_name} />
                <DetailRow label="ธนาคาร" value={slip.bank_name} />
                <DetailRow label="เลขอ้างอิง" value={slip.reference_no} />
                {slip.sender_account && <DetailRow label="บัญชีผู้โอน" value={slip.sender_account} />}
                {slip.receiver_account && <DetailRow label="บัญชีผู้รับ" value={slip.receiver_account} />}
                {slip.fee != null && Number(slip.fee) > 0 && (
                  <DetailRow label="ค่าธรรมเนียม" value={`${Number(slip.fee).toLocaleString('th-TH')} บาท`} />
                )}
                <DetailRow label="วันที่ทำรายการ" value={dateText} />
              </div>

              {slip.image_url && (
                <img
                  src={slip.image_url}
                  alt="สลิป"
                  className="mt-4 w-full rounded-2xl object-contain max-h-[50vh] border border-border"
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 pb-6 flex gap-3">
          {editing ? (
            <>
              <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => setEditing(false)} disabled={saving}>
                ยกเลิก
              </Button>
              <Button className="flex-1 h-12 rounded-2xl" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <><span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> กำลังบันทึก...</>
                ) : 'บันทึก'}
              </Button>
            </>
          ) : confirmDelete ? (
            <>
              <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                ยกเลิก
              </Button>
              <Button
                className="flex-1 h-12 rounded-2xl bg-red-600 text-white hover:bg-red-600"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> กำลังลบ...</>
                ) : 'ยืนยันลบ'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={startEdit}>
                <Pencil className="size-4" /> แก้ไข
              </Button>
              <Button
                variant="outline"
                className="h-12 px-4 rounded-2xl text-red-600"
                onClick={() => setConfirmDelete(true)}
                aria-label="ลบรายการ"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, big, valueClass }) {
  return (
    <div className="flex justify-between items-start gap-4 py-3">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={`font-semibold text-right break-words ${big ? 'text-lg' : 'text-sm'} ${valueClass || 'text-foreground'}`}>
        {value || '-'}
      </span>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', inputMode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}
