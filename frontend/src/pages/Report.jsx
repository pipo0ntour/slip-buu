import { useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, X, MessageCircle, Share2, Copy } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { apiGet } from '@/lib/api'
import iconExcel from '@/assets/icon-excel.png'
import iconPdf from '@/assets/icon-pdf.png'
import SlipModal from '@/components/SlipModal'
import SessionExpiredCard from '@/components/SessionExpiredCard'
import StatCard from '@/components/StatCard'
import { PERIODS, bkkToday, stepAnchor, isAtPresent, anchorParam, anchorLabel } from '@/lib/period'
import {
  fmtBaht, fmtBahtShort, summarize, NO_CATEGORY,
  categoryKey, categoryLabel, categoryMeta, expenseByCategory,
} from '@/lib/finance'
import liff from '@line/liff'

// แสดงรายการทีละ 10 แล้วค่อยกด "แสดงเพิ่ม" — กัน render DOM ทีเดียวเยอะตอนช่วงรายปี
const PAGE_SIZE = 10

// ไอคอน "แชร์/ส่งออก" — ลูกศรโค้งหนาพุ่งออกทางขวา (outline, ไม่มีกล่อง)
function ShareIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"
    >
      <path d="M22 9.5 13.5 2v4.5C10 6.5 6.5 7.5 4 10.5c-.7 2-1 4-1 6 2-3.7 6-4 10.5-4V17z" />
    </svg>
  )
}

// ข้อความสรุปที่ใช้ร่วมกันทั้ง 3 ช่องทางแชร์ (ส่งไลน์ / share sheet / คัดลอก) — จะได้ format ตรงกัน
function buildSummaryText(data, anchor, period) {
  // หมวดจ่ายเด่นสุด 3 อันดับ — ให้ข้อความสรุปบอกได้ว่าเงินหมดไปกับอะไร ไม่ใช่แค่ยอดรวม
  const { rows } = expenseByCategory(data.slips || [])
  const topExpense = rows
    .slice(0, 3)
    .map(r => `  • ${categoryMeta(r.category).emoji} ${categoryLabel(r.category)}: ${fmtBaht(r.amount)} บาท`)
    .join('\n')

  return (
    `📊 สรุปยอด ${anchorLabel(anchor, period)}\n` +
    `รายรับ: ${fmtBaht(data.totalIncome)} บาท\n` +
    `รายจ่าย: ${fmtBaht(data.totalExpense)} บาท\n` +
    `คงเหลือ: ${fmtBaht(data.net)} บาท\n` +
    `จำนวน: ${data.count || 0} รายการ` +
    (topExpense ? `\n\nรายจ่ายเด่น:\n${topExpense}` : '')
  )
}

// คัดลอกข้อความลงคลิปบอร์ด — ใช้ Clipboard API ก่อน, ถ้าเว็บวิวเก่าไม่รองรับค่อย fallback ไป execCommand
async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  if (!ok) throw new Error('copy failed')
}

export default function Report() {
  const toast = useToast()
  const [period, setPeriod] = useState('daily')
  const [anchor, setAnchor] = useState(bkkToday) // วันอ้างอิงสำหรับดูย้อนหลัง (เริ่มที่วันนี้)
  const [showDropdown, setShowDropdown] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedSlip, setSelectedSlip] = useState(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [activeKey, setActiveKey] = useState(null) // หมวดที่กำลังกรองดูรายการ (null = ไม่กรอง)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE) // จำนวนรายการที่แสดง (กด "แสดงเพิ่ม" เพิ่มทีละ PAGE_SIZE)

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
    setActiveKey(null) // เปลี่ยนช่วงเวลา = ล้างตัวกรองหมวด (ข้อมูลชุดใหม่)
    fetchReport()
  }, [period, anchor])

  // เปลี่ยนตัวกรองหมวด (หรือโหลดข้อมูลใหม่) = ลิสต์เปลี่ยน → ย้อนกลับไปแสดงหน้าแรก
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [activeKey, data])

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
        {/* แถบควบคุม: เลือก granularity (ซ้าย) + ปุ่มส่งออก (ขวา) — เห็นตลอดทั้งสองแท็บ */}
        <div className="flex items-center justify-between gap-2 mb-3">
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
                <div className="absolute left-0 top-full mt-1 z-20 rounded-xl border border-border bg-card shadow-md overflow-hidden min-w-[120px]">
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
          <div className="flex items-center gap-2">
            <ExportMenu
              data={data}
              periodLabel={periodLabel}
              rangeLabel={anchorLabel(anchor, period)}
              period={period}
              disabled={loading || !data?.slips?.length}
              toast={toast}
            />
            {/* แชร์สรุป — เมนูเลือกช่องทาง: แชตไลน์ / แอปอื่น (share sheet) / คัดลอกข้อความ */}
            <ShareMenu
              data={data}
              anchor={anchor}
              period={period}
              disabled={loading || !data?.slips?.length}
              toast={toast}
            />
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

        {/* รายจ่ายตามหมวดหมู่ — เห็นว่าเงินหมดไปกับอะไรเยอะสุด + แตะเพื่อกรองรายการด้านล่าง */}
        {!loading && data?.slips?.length > 0 && (
          <CategoryBreakdown
            slips={data.slips}
            prevByCategory={data.prevExpenseByCategory}
            activeKey={activeKey}
            onSelect={setActiveKey}
          />
        )}

        {/* Slip list */}
        {!loading && data?.slips?.length > 0 && (() => {
          const matchedSlips = activeKey
            ? data.slips.filter(s => s.type === 'expense' && categoryKey(s.category) === activeKey)
            : data.slips
          const visibleSlips = matchedSlips.slice(0, visibleCount)
          const remaining = matchedSlips.length - visibleSlips.length
          return (
          <section className="mt-6 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">
                {activeKey ? 'รายการในหมวด' : 'รายการทั้งหมด'}
              </p>
              {activeKey && (
                <button
                  type="button"
                  onClick={() => setActiveKey(null)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                >
                  {categoryMeta(activeKey === NO_CATEGORY ? null : activeKey).emoji}{' '}
                  {categoryLabel(activeKey === NO_CATEGORY ? null : activeKey)}
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="divide-y divide-border">
              {visibleSlips.map((slip, i) => {
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
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="w-full px-5 py-3 text-sm font-medium text-primary border-t border-border active:bg-accent transition-colors"
              >
                แสดงเพิ่ม (เหลืออีก {remaining})
              </button>
            )}
          </section>
          )
        })()}

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
    </div>
  )
}

// โดนัทสัดส่วนรายจ่าย — วาดด้วย SVG ล้วน (ไม่พึ่งไลบรารี) ใช้ stroke-dasharray ต่อ segment
function Donut({ rows, total, size = 104, stroke = 16 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted" />
          {rows.map((row, i) => {
            const len = total ? (row.amount / total) * circ : 0
            const seg = (
              <circle
                key={categoryKey(row.category)}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={categoryMeta(row.category, i).color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-acc}
              />
            )
            acc += len
            return seg
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] text-muted-foreground leading-none">รายจ่าย</span>
        <span className="text-sm font-bold leading-tight">{fmtBahtShort(total)}</span>
      </div>
    </div>
  )
}

// ลูกศรเทียบช่วงก่อนหน้า — รายจ่าย: เพิ่ม = แดง (จ่ายมากขึ้น), ลด = เขียว
function Trend({ amount, prevAmount }) {
  if (prevAmount == null) return null // ไม่มีข้อมูลช่วงก่อน → ไม่โชว์
  if (prevAmount <= 0) return <span className="text-[10px] text-amber-600 font-medium">ใหม่</span>
  const delta = (amount - prevAmount) / prevAmount
  if (Math.abs(delta) < 0.005) return <span className="text-[10px] text-muted-foreground">—</span>
  const up = delta > 0
  return (
    <span className={`text-[10px] font-semibold ${up ? 'text-red-600' : 'text-green-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}%
    </span>
  )
}

function CategoryBreakdown({ slips, prevByCategory = {}, activeKey, onSelect }) {
  const { total, rows } = expenseByCategory(slips)
  if (!rows.length) return null // ไม่มีรายจ่ายในช่วงนี้ → ไม่ต้องแสดง

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-baseline justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">รายจ่ายตามหมวดหมู่</p>
        <p className="text-xs text-muted-foreground">แตะหมวดเพื่อดูรายการ</p>
      </div>

      <div className="px-5 pb-2 flex justify-center">
        <Donut rows={rows} total={total} />
      </div>

      <div className="px-3 pb-3">
        {rows.map((row, i) => {
          const meta = categoryMeta(row.category, i)
          const key = categoryKey(row.category)
          const active = activeKey === key
          const prevAmount = prevByCategory[key]
          const avg = row.count ? row.amount / row.count : 0
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(active ? null : key)}
              className={`w-full text-left rounded-xl px-2 py-2 transition-colors ${active ? 'bg-accent' : 'active:bg-accent'}`}
            >
              <div className="flex justify-between items-baseline gap-2 text-sm">
                <span className="font-medium truncate flex items-center gap-1.5 min-w-0">
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                  <span className="shrink-0">{meta.emoji}</span>
                  <span className="truncate">{categoryLabel(row.category)}</span>
                </span>
                <span className="shrink-0 font-semibold">{fmtBahtShort(row.amount)} ฿</span>
              </div>
              <div className="mt-0.5 flex justify-between items-baseline gap-2 pl-[18px]">
                {/* จำนวน/เฉลี่ย โชว์เฉพาะตอนกดดูหมวดนั้น — ปกติให้ดูแค่ยอด/สัดส่วน */}
                <span className="text-[11px] text-muted-foreground truncate">
                  {active ? `${row.count} รายการ · เฉลี่ย ${fmtBahtShort(Math.round(avg))} ฿` : ''}
                </span>
                <span className="shrink-0 flex items-center gap-2">
                  <Trend amount={row.amount} prevAmount={prevAmount} />
                  <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round(row.pct * 100)}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                {/* อย่างน้อย 2% เพื่อให้หมวดที่ยอดน้อยมากยังเห็นแถบ */}
                <div className="h-full rounded-full" style={{ width: `${Math.max(row.pct * 100, 2)}%`, backgroundColor: meta.color }} />
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// เมนูแชร์สรุป — ปุ่มไอคอนเขียว กดแล้วเปิดเมนูเลือกช่องทาง
//   • ส่งไปแชตไลน์ (shareTargetPicker — ได้เฉพาะในแอป LINE)
//   • แชร์ไปแอปอื่น (Web Share API → share sheet มือถือ มี IG/FB/ฯลฯ; โชว์เฉพาะเครื่องที่รองรับ)
//   • คัดลอกข้อความ (fallback ที่ชัวร์สุด เอาไปแปะที่ไหนก็ได้)
function ShareMenu({ data, anchor, period, disabled, toast }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false) // true เฉพาะตอนรอ shareTargetPicker (โชว์ spinner ที่ปุ่ม)
  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function shareToLine() {
    setOpen(false)
    if (!data) return
    setBusy(true)
    try {
      await liff.shareTargetPicker([{ type: 'text', text: buildSummaryText(data, anchor, period) }])
    } catch {
      // ผู้ใช้กดยกเลิก หรือไม่ได้อยู่ในแอป LINE
    } finally {
      setBusy(false)
    }
  }

  async function shareToApps() {
    setOpen(false)
    if (!data) return
    try {
      await navigator.share({ title: 'สรุปยอด Slip-BUU', text: buildSummaryText(data, anchor, period) })
    } catch {
      // ผู้ใช้กดยกเลิก share sheet — ไม่ต้องแจ้ง error
    }
  }

  async function copyText() {
    setOpen(false)
    if (!data) return
    try {
      await copyToClipboard(buildSummaryText(data, anchor, period))
      toast?.({ message: 'คัดลอกข้อความแล้ว', type: 'success' })
    } catch {
      toast?.({ message: 'คัดลอกไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled || busy}
        aria-label="แชร์สรุป"
        aria-haspopup="menu"
        aria-expanded={open}
        title="แชร์สรุป"
        className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center active:opacity-90 transition-opacity disabled:opacity-40"
      >
        {busy ? (
          <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
        ) : (
          <ShareIcon className="size-5" />
        )}
      </button>
      {open && (
        <>
          {/* ชั้นโปร่งใสคลุมทั้งจอ — แตะที่ไหนก็ได้นอกเมนูเพื่อปิด (pattern เดียวกับ dropdown ช่วงเวลา) */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-20 rounded-xl border border-border bg-card shadow-md overflow-hidden min-w-[180px]"
          >
            <ShareMenuItem icon={<MessageCircle className="size-4" />} label="ส่งไปแชตไลน์" onClick={shareToLine} />
            {canWebShare && (
              <ShareMenuItem icon={<Share2 className="size-4" />} label="แชร์ไปแอปอื่น…" onClick={shareToApps} />
            )}
            <ShareMenuItem icon={<Copy className="size-4" />} label="คัดลอกข้อความ" onClick={copyText} />
          </div>
        </>
      )}
    </div>
  )
}

function ShareMenuItem({ icon, label, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent active:bg-accent transition-colors"
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      {label}
    </button>
  )
}

// ปุ่มส่งออกแบบไอคอนเล็ก — Excel (CSV) / PDF กดแล้วสร้างไฟล์จากข้อมูลช่วงที่โหลดมาแล้ว (ไม่ยิง API ซ้ำ)
function ExportMenu({ data, periodLabel, rangeLabel, period, disabled, toast }) {
  const [busy, setBusy] = useState(null) // 'csv' | 'pdf' | null = ชนิดที่กำลังสร้าง (โชว์ spinner ปุ่มนั้น)

  async function run(kind) {
    if (busy || !data?.slips?.length) return
    setBusy(kind)
    try {
      const payload = {
        slips: data.slips,
        totalIncome: data.totalIncome,
        totalExpense: data.totalExpense,
        net: data.net,
        count: data.count,
        periodLabel,
        rangeLabel,
        period,
      }
      // โหลดโมดูล export แบบ lazy — jsPDF + ฟอนต์ไทยก้อนใหญ่ จะดาวน์โหลดเฉพาะตอนกดส่งออกจริง
      // (ไม่ถ่วงโหลดหน้าแรกของแอปบนมือถือ)
      const { exportCsv, exportPdf } = await import('@/lib/export')
      if (kind === 'csv') exportCsv(payload)
      else exportPdf(payload)
      toast?.({ message: `ส่งออก ${kind.toUpperCase()} แล้ว`, type: 'success' })
    } catch {
      toast?.({ message: 'ส่งออกไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <ExportIconButton
        label="ส่งออก Excel (CSV)"
        onClick={() => run('csv')}
        disabled={disabled || !!busy}
        loading={busy === 'csv'}
        icon={<img src={iconExcel} alt="" className="size-6 object-contain" />}
      />
      <ExportIconButton
        label="ส่งออก PDF"
        onClick={() => run('pdf')}
        disabled={disabled || !!busy}
        loading={busy === 'pdf'}
        icon={<img src={iconPdf} alt="" className="size-6 object-contain" />}
      />
    </div>
  )
}

function ExportIconButton({ label, onClick, disabled, loading, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center active:bg-accent transition-colors disabled:opacity-40"
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
    </button>
  )
}

