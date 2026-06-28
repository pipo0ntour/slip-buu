import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Pencil, Trash2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/context/ToastContext'
import { apiGet } from '@/lib/api'
import { CATEGORIES } from '@/components/TransactionForm'
import {
  fmtBaht,
  fmtBahtShort,
  expenseByCategory,
  categoryMeta,
  categoryLabel,
  NO_CATEGORY,
} from '@/lib/finance'
import { bkkToday, anchorParam, anchorLabel } from '@/lib/period'
import { loadBudgets, saveBudgets, clearBudgets } from '@/lib/budgetStore'
import SessionExpiredCard from '@/components/SessionExpiredCard'

// ตั้งงบได้เฉพาะหมวด "รายจ่าย" — ตัด 'เงินเดือน' (รายรับ) ออก
const BUDGET_CATEGORIES = CATEGORIES.filter((c) => c !== 'เงินเดือน')

// สีแถบความคืบหน้าตามสัดส่วนที่ใช้ไป: เขียว (ยังโอเค) → ส้ม (ใกล้เต็ม) → แดง (เกินงบ)
function barColor(pct) {
  if (pct >= 1) return '#ef4444'
  if (pct >= 0.8) return '#f59e0b'
  return '#22c55e'
}

export default function Budget() {
  const toast = useToast()
  const navigate = useNavigate()
  const [budgets, setBudgets] = useState(loadBudgets)
  const [spentMap, setSpentMap] = useState({}) // { [category|__none__]: ยอดจ่ายเดือนนี้ }
  const [totalSpent, setTotalSpent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [editing, setEditing] = useState(false)

  // ดึงยอดจ่ายเดือนนี้แยกหมวดมาเทียบงบ — ตั้ง/แก้งบได้แม้ดึงไม่ได้ (เก็บในเครื่อง)
  async function load() {
    setLoading(true)
    try {
      const res = await apiGet(`/api/report?period=monthly&date=${anchorParam(bkkToday())}`)
      if (res.status === 401) { setSessionExpired(true); return }
      setSessionExpired(false)
      const j = res.ok ? await res.json() : null
      if (j) {
        const { rows } = expenseByCategory(j.slips || [])
        const map = {}
        for (const r of rows) map[r.category ?? NO_CATEGORY] = r.amount
        setSpentMap(map)
        setTotalSpent(Number(j.totalExpense) || 0)
      }
    } catch {
      /* network error → คงค่าเดิม */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleSave(next) {
    saveBudgets(next)
    setBudgets(loadBudgets())
    setEditing(false)
    toast?.({ message: 'ตั้งงบประมาณแล้ว', type: 'success' })
  }

  function handleClear() {
    clearBudgets()
    setBudgets({})
    setEditing(false)
    toast?.({ message: 'ล้างงบประมาณแล้ว', type: 'success' })
  }

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/me')
  }

  const budgetCats = Object.keys(budgets) // หมวดที่ตั้งงบไว้
  const hasBudget = budgetCats.length > 0
  const totalBudget = budgetCats.reduce((a, c) => a + (Number(budgets[c]) || 0), 0)
  const totalPct = totalBudget > 0 ? totalSpent / totalBudget : 0
  const overCats = budgetCats.filter((c) => (spentMap[c] || 0) > budgets[c])

  // หมวดที่ "มีการจ่ายเดือนนี้ แต่ยังไม่ตั้งงบ" — เตือนให้เห็น จะได้ไม่มีรายจ่ายตกหล่น
  const unbudgeted = Object.entries(spentMap)
    .filter(([k, v]) => v > 0 && !(k in budgets))
    .sort((a, b) => b[1] - a[1])

  // ข้อความสรุปสถานะภาพรวม
  let statusEmoji = '👍'
  let statusText = 'ยังอยู่ในงบ ทำได้ดีมาก'
  if (overCats.length) {
    statusEmoji = '⚠️'
    statusText = `เกินงบแล้ว ${overCats.length} หมวด ลองคุมหน่อยน้า`
  } else if (totalPct >= 0.8) {
    statusEmoji = '😬'
    statusText = 'ใกล้เต็มงบแล้ว ระวังการใช้จ่ายช่วงนี้'
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="mx-auto max-w-md px-5 pt-6">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="ย้อนกลับ"
            className="w-10 h-10 -ml-1 rounded-xl border border-border bg-card flex items-center justify-center shrink-0 active:bg-accent transition-colors"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">งบประมาณรายเดือน</h1>
            <p className="text-sm text-muted-foreground leading-tight">{anchorLabel(bkkToday(), 'monthly')}</p>
          </div>
        </header>

        {/* เซสชันหมดอายุ = ดึงยอดเดือนนี้ไม่ได้ แต่ตั้ง/แก้งบยังทำได้ (เก็บในเครื่อง) */}
        {sessionExpired && <div className="mb-4"><SessionExpiredCard onRetry={load} /></div>}

        {editing || !hasBudget ? (
          <BudgetForm budgets={budgets} onSave={handleSave} onCancel={hasBudget ? () => setEditing(false) : null} />
        ) : (
          <>
            {/* การ์ดภาพรวม: จ่ายไปแล้ว / งบรวม */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Wallet className="size-4 text-primary" /> งบรวมเดือนนี้
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(true)} aria-label="แก้ไข" className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center active:bg-accent">
                    <Pencil className="size-4 text-muted-foreground" />
                  </button>
                  <button onClick={handleClear} aria-label="ล้างงบ" className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center active:bg-accent">
                    <Trash2 className="size-4 text-red-600" />
                  </button>
                </div>
              </div>

              <p className="mt-3 text-3xl font-bold">
                {loading ? '...' : fmtBaht(totalSpent)}
                <span className="text-base font-normal text-muted-foreground"> / {fmtBaht(totalBudget)} ฿</span>
              </p>

              <div className="mt-3 h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(totalPct, 1) * 100}%`, backgroundColor: barColor(totalPct) }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {loading ? 'กำลังคำนวณ...' : `ใช้ไป ${Math.round(totalPct * 100)}% ของงบรวม • เหลือ ${fmtBahtShort(Math.max(totalBudget - totalSpent, 0))} ฿`}
              </p>
            </section>

            {/* สถานะให้กำลังใจ/เตือน */}
            <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-3">
              <span className="text-3xl shrink-0">{statusEmoji}</span>
              <p className="text-sm text-muted-foreground">{statusText}</p>
            </section>

            {/* งบรายหมวด */}
            <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground mb-3">งบแต่ละหมวด</p>
              {budgetCats
                .map((cat) => ({ cat, budget: budgets[cat], spent: spentMap[cat] || 0 }))
                .sort((a, b) => b.spent / b.budget - a.spent / a.budget)
                .map(({ cat, budget, spent }, i) => {
                  const meta = categoryMeta(cat, i)
                  const pct = budget > 0 ? spent / budget : 0
                  const over = spent > budget
                  return (
                    <div key={cat} className="py-1.5">
                      <div className="flex justify-between items-baseline text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span>{meta.emoji}</span>
                          <span className="truncate">{cat}</span>
                        </span>
                        <span className={`shrink-0 font-semibold ${over ? 'text-red-600' : ''}`}>
                          {fmtBahtShort(spent)}<span className="font-normal text-muted-foreground"> / {fmtBahtShort(budget)}</span>
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 1) * 100}%`, backgroundColor: barColor(pct) }} />
                      </div>
                      {over && <p className="mt-0.5 text-[11px] text-red-600">เกินงบ {fmtBahtShort(spent - budget)} ฿</p>}
                    </div>
                  )
                })}
            </section>

            {/* จ่ายแล้วแต่ยังไม่ได้ตั้งงบ — เตือนให้เห็น */}
            {unbudgeted.length > 0 && (
              <section className="mt-4 rounded-2xl border border-dashed border-border bg-card/50 p-5">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground mb-2">จ่ายแล้วแต่ยังไม่ได้ตั้งงบ</p>
                {unbudgeted.map(([key, amount], i) => {
                  const category = key === NO_CATEGORY ? null : key
                  const meta = categoryMeta(category, i)
                  return (
                    <div key={key} className="flex justify-between items-center text-sm py-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span>{meta.emoji}</span>
                        <span className="truncate text-muted-foreground">{categoryLabel(category)}</span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">{fmtBahtShort(amount)} ฿</span>
                    </div>
                  )
                })}
                <Button variant="outline" className="mt-3 w-full h-10 rounded-xl text-sm" onClick={() => setEditing(true)}>
                  ตั้งงบหมวดเหล่านี้
                </Button>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function BudgetForm({ budgets, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => {
    const init = {}
    for (const c of BUDGET_CATEGORIES) init[c] = budgets[c] ? String(budgets[c]) : ''
    return init
  })

  const setVal = (cat, v) => setDraft((d) => ({ ...d, [cat]: v }))
  const anyValid = BUDGET_CATEGORIES.some((c) => Number(draft[c]) > 0)

  function submit() {
    const next = {}
    for (const c of BUDGET_CATEGORIES) {
      const n = Number(draft[c])
      if (n > 0) next[c] = n
    }
    onSave(next)
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col items-center text-center mb-4">
        <span className="w-14 h-14 rounded-2xl bg-primary/12 flex items-center justify-center mb-2">
          <Wallet className="size-7 text-primary" />
        </span>
        <p className="text-sm text-muted-foreground">ตั้งวงเงินที่ตั้งใจจะใช้ในแต่ละหมวดต่อเดือน<br />(เว้นว่างไว้ = ไม่จำกัดงบหมวดนั้น)</p>
      </div>

      <div className="divide-y divide-border">
        {BUDGET_CATEGORIES.map((cat, i) => {
          const meta = categoryMeta(cat, i)
          return (
            <label key={cat} className="flex items-center gap-3 py-2.5">
              <span className="text-lg w-6 text-center shrink-0">{meta.emoji}</span>
              <span className="text-sm flex-1 min-w-0 truncate">{cat}</span>
              <input
                type="number"
                inputMode="decimal"
                value={draft[cat]}
                onChange={(e) => setVal(cat, e.target.value)}
                placeholder="0"
                className="w-28 h-11 rounded-xl border border-input bg-background px-3 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          )
        })}
      </div>

      <div className="flex gap-3 mt-5">
        {onCancel && (
          <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={onCancel}>
            ยกเลิก
          </Button>
        )}
        <Button className="flex-1 h-12 rounded-2xl" disabled={!anyValid} onClick={submit}>
          บันทึกงบประมาณ
        </Button>
      </div>
    </section>
  )
}
