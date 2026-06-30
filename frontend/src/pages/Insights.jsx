import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { fmtBahtShort, categoryMeta, categoryLabel, buildAdvice } from '@/lib/finance'
import { loadBudgets } from '@/lib/budgetStore'
import { bkkToday, stepAnchor, anchorParam } from '@/lib/period'
import StatCard from '@/components/StatCard'
import SessionExpiredCard from '@/components/SessionExpiredCard'
import GradientHeader from '@/components/GradientHeader'

const MONTHS_BACK = 6

// สีพื้นการ์ดคำแนะนำตามระดับ: เตือน (แดง) / ข้อมูล (กลาง) / ดี (เขียว) — ใช้ opacity ต่ำ รองรับ dark mode
const ADVICE_TONE = {
  warn: 'bg-red-500/10 text-red-600',
  info: 'bg-muted/60 text-foreground',
  good: 'bg-green-500/10 text-green-700',
}

// ป้ายเดือนสั้น ๆ จาก anchor
function shortMonth(a) {
  return new Date(Date.UTC(a.y, a.mo, 1)).toLocaleDateString('th-TH', { timeZone: 'UTC', month: 'short' })
}

export default function Insights() {
  const [months, setMonths] = useState([]) // [{ label, income, expense, net }]
  const [topCats, setTopCats] = useState({ total: 0, rows: [] })
  const [advice, setAdvice] = useState([]) // คำแนะนำการใช้จ่ายแบบกฎ (เกินงบ/พุ่ง/ออม ฯลฯ)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  async function load() {
    setLoading(true)
    // anchor ของ 6 เดือนล่าสุด (เก่า→ใหม่) — ส่งให้ backend ครั้งเดียว แล้วรวบมาเป็น response เดียว
    const today = bkkToday()
    const anchors = []
    for (let i = MONTHS_BACK - 1; i >= 0; i--) anchors.push(stepAnchor(today, 'monthly', -i))
    try {
      const res = await apiGet(`/api/report/insights?months=${anchors.map(anchorParam).join(',')}`)
      if (res.status === 401) { setSessionExpired(true); return }
      setSessionExpired(false)
      const j = res.ok ? await res.json().catch(() => null) : null
      const data = j?.months || []
      setMonths(data.map((m, i) => ({
        label: shortMonth(anchors[i]),
        income: Number(m?.income) || 0,
        expense: Number(m?.expense) || 0,
        net: Number(m?.net) || 0,
      })))
      setTopCats(j?.topCategories || { total: 0, rows: [] }) // หมวดเด่นช่วง 6 เดือน (backend รวมมาให้)
      // คำแนะนำการใช้จ่าย — อิงข้อมูลรายเดือน (เก่า→ใหม่) + งบที่ตั้งไว้ (เก็บในเครื่อง)
      setAdvice(buildAdvice(data, loadBudgets()))
    } catch {
      /* network error → คงค่าเดิมไว้ */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const totalNet = months.reduce((a, m) => a + m.net, 0)
  const avgNet = months.length ? totalNet / months.length : 0
  const maxBar = Math.max(1, ...months.flatMap(m => [m.income, m.expense]))

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      <GradientHeader>
        <header>
          <h1 className="text-2xl font-bold leading-tight">สถิติเชิงลึก</h1>
          <p className="text-sm text-foreground/70 leading-tight">แนวโน้มรายรับ-รายจ่าย {MONTHS_BACK} เดือนล่าสุด</p>
        </header>
      </GradientHeader>

      <div className="mx-auto max-w-md px-5 -mt-5 pt-5 rounded-t-[2rem] bg-background">

        {sessionExpired ? (
          <SessionExpiredCard onRetry={load} />
        ) : loading ? (
          <div className="py-20 flex justify-center">
            <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* สรุปออมรวม */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={`ออมรวม ${MONTHS_BACK} เดือน`} value={fmtBahtShort(totalNet)} tone={totalNet < 0 ? 'expense' : 'income'} />
              <StatCard label="เฉลี่ย/เดือน" value={fmtBahtShort(Math.round(avgNet))} tone={avgNet < 0 ? 'expense' : 'default'} />
            </div>

            {/* คำแนะนำการใช้จ่าย (rule-based) — บอกว่าควรลด/จับตาอะไร */}
            {advice.length > 0 && (
              <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground mb-3">💡 คำแนะนำการใช้จ่าย</p>
                <div className="space-y-2">
                  {advice.map((a) => (
                    <div key={a.id} className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm ${ADVICE_TONE[a.tone] || ADVICE_TONE.info}`}>
                      <span className="shrink-0">{a.emoji}</span>
                      <span className="min-w-0">{a.text}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">อิงรายจ่ายเดือนนี้เทียบ 5 เดือนก่อน</p>
              </section>
            )}

            {/* กราฟแท่งรายเดือน (รายรับเขียว / รายจ่ายแดง) */}
            <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground">รายรับ vs รายจ่าย</p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />รับ
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-2 mr-1" />จ่าย
                </p>
              </div>

              <div className="mt-4 flex items-end justify-between gap-2 h-36">
                {months.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                    <div className="flex items-end gap-0.5 h-full w-full justify-center">
                      <div className="w-2.5 rounded-t bg-green-500 transition-all duration-500" style={{ height: `${(m.income / maxBar) * 100}%` }} />
                      <div className="w-2.5 rounded-t bg-red-500 transition-all duration-500" style={{ height: `${(m.expense / maxBar) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ออมสุทธิรายเดือน */}
            <section className="mt-4 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <p className="px-5 pt-4 pb-2 text-xs font-semibold tracking-wide text-muted-foreground">ยอดคงเหลือรายเดือน</p>
              <div className="divide-y divide-border">
                {months.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm">{m.label}</span>
                    <span className={`text-sm font-bold ${m.net < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {m.net < 0 ? '' : '+'}{fmtBahtShort(m.net)} ฿
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* หมวดจ่ายเด่นช่วง 6 เดือน */}
            {topCats.rows.length > 0 && (
              <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground mb-3">หมวดที่จ่ายเยอะสุด</p>
                {topCats.rows.slice(0, 5).map((row, i) => {
                  const meta = categoryMeta(row.category, i)
                  return (
                    <div key={i} className="py-1.5">
                      <div className="flex justify-between items-baseline text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span>{meta.emoji}</span>
                          <span className="truncate">{categoryLabel(row.category)}</span>
                        </span>
                        <span className="font-semibold shrink-0">{fmtBahtShort(row.amount)} ฿</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(row.pct * 100, 2)}%`, backgroundColor: meta.color }} />
                      </div>
                    </div>
                  )
                })}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
