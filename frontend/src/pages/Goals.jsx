import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, Pencil, Trash2, PiggyBank, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/context/ToastContext'
import { apiGet } from '@/lib/api'
import { fmtBaht } from '@/lib/finance'
import { bkkToday, anchorParam } from '@/lib/period'
import { loadGoal, saveGoal, clearGoal } from '@/lib/goalStore'
import SessionExpiredCard from '@/components/SessionExpiredCard'

// เลือกมาสคอต/ข้อความตามความคืบหน้าของเป้า (เงินออมเดือนนี้เทียบเป้า)
function mascotFor(pct) {
  if (pct >= 1) return { emoji: '🎉', text: 'ถึงเป้าแล้ว! เก่งมาก ตั้งเป้าใหม่ที่ท้าทายกว่าเดิมได้เลย' }
  if (pct >= 0.5) return { emoji: '💪', text: 'มาได้ครึ่งทางแล้ว ลุยต่ออีกนิดเดียว!' }
  if (pct > 0) return { emoji: '🌱', text: 'เริ่มแล้วก็ดีแล้ว ค่อย ๆ เก็บไปเรื่อย ๆ นะ' }
  return { emoji: '😵', text: 'เดือนนี้ยังจ่ายมากกว่ารับ ลองคุมรายจ่ายดูหน่อยน้า' }
}

export default function Goals() {
  const toast = useToast()
  const navigate = useNavigate()
  const [goal, setGoal] = useState(loadGoal)
  const [saved, setSaved] = useState(0) // เงินออมเดือนนี้ (รายรับ − รายจ่าย)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [editing, setEditing] = useState(false)

  // ดึงยอดคงเหลือเดือนนี้มาเทียบเป้า — เป้าตั้ง/แก้ได้แม้ดึงไม่ได้ (เก็บใน localStorage)
  async function load() {
    setLoading(true)
    try {
      const res = await apiGet(`/api/report?period=monthly&date=${anchorParam(bkkToday())}`)
      if (res.status === 401) { setSessionExpired(true); return }
      setSessionExpired(false)
      const j = res.ok ? await res.json() : null
      if (j) setSaved(Number(j.net) || 0)
    } catch {
      /* network error → คงค่าเดิม */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleSave(next) {
    saveGoal(next)
    setGoal(next)
    setEditing(false)
    toast?.({ message: 'ตั้งเป้าหมายแล้ว', type: 'success' })
  }

  function handleClear() {
    clearGoal()
    setGoal(null)
    setEditing(false)
    toast?.({ message: 'ลบเป้าหมายแล้ว', type: 'success' })
  }

  // ย้อนกลับไปหน้าก่อนหน้า (ปกติคือ "ฉัน") — ถ้าเปิดหน้านี้ตรงๆ ไม่มีประวัติ ก็ไป /me แทน
  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/me')
  }

  const pct = goal?.target > 0 ? saved / goal.target : 0
  const clamped = Math.max(0, Math.min(pct, 1))
  const mascot = mascotFor(pct)

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
            <h1 className="text-2xl font-bold leading-tight">เป้าหมายออมเงิน</h1>
            <p className="text-sm text-muted-foreground leading-tight">ตั้งเป้าเก็บเงินของเดือนนี้</p>
          </div>
        </header>

        {/* เซสชันหมดอายุ = ดึงยอดเดือนนี้ไม่ได้ แต่ตั้ง/แก้เป้ายังทำได้ (เก็บในเครื่อง) */}
        {sessionExpired && <div className="mb-4"><SessionExpiredCard onRetry={load} /></div>}

        {editing || !goal ? (
          <GoalForm goal={goal} onSave={handleSave} onCancel={goal ? () => setEditing(false) : null} />
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Target className="size-4 text-primary" /> {goal.label || 'เป้าหมายของฉัน'}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(true)} aria-label="แก้ไข" className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center active:bg-accent">
                    <Pencil className="size-4 text-muted-foreground" />
                  </button>
                  <button onClick={handleClear} aria-label="ลบ" className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center active:bg-accent">
                    <Trash2 className="size-4 text-red-600" />
                  </button>
                </div>
              </div>

              <p className="mt-3 text-3xl font-bold">
                {loading ? '...' : fmtBaht(Math.max(saved, 0))}
                <span className="text-base font-normal text-muted-foreground"> / {fmtBaht(goal.target)} ฿</span>
              </p>

              {/* แถบความคืบหน้า */}
              <div className="mt-3 h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${clamped * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {loading ? 'กำลังคำนวณ...' : `ออมได้ ${Math.round(pct * 100)}% ของเป้า (จากยอดคงเหลือเดือนนี้)`}
              </p>

              {goal.deadline && (
                <p className="mt-1 text-xs text-muted-foreground">
                  🗓️ ภายใน {new Date(goal.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </section>

            {/* มาสคอตให้กำลังใจตามความคืบหน้า */}
            <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm flex items-center gap-4 animate-pop">
              <span className="text-4xl shrink-0">{mascot.emoji}</span>
              <p className="text-sm text-muted-foreground">{mascot.text}</p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function GoalForm({ goal, onSave, onCancel }) {
  const [target, setTarget] = useState(goal?.target ? String(goal.target) : '')
  const [label, setLabel] = useState(goal?.label || '')
  const [deadline, setDeadline] = useState(goal?.deadline || '')

  const valid = Number(target) > 0

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col items-center text-center mb-4">
        <span className="w-14 h-14 rounded-2xl bg-primary/12 flex items-center justify-center mb-2">
          <PiggyBank className="size-7 text-primary" />
        </span>
        <p className="text-sm text-muted-foreground">ตั้งยอดที่อยากเก็บให้ได้ในเดือนนี้</p>
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">ยอดเป้าหมาย (บาท)</span>
        <input
          type="number"
          inputMode="decimal"
          value={target}
          onChange={e => setTarget(e.target.value)}
          placeholder="เช่น 5000"
          className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label className="block mt-3">
        <span className="text-xs font-semibold text-muted-foreground">ชื่อเป้าหมาย (ไม่บังคับ)</span>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="เช่น เก็บไปเที่ยว"
          className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label className="block mt-3">
        <span className="text-xs font-semibold text-muted-foreground">กำหนดเสร็จ (ไม่บังคับ)</span>
        <input
          type="date"
          value={deadline}
          onChange={e => setDeadline(e.target.value)}
          className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <div className="flex gap-3 mt-5">
        {onCancel && (
          <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={onCancel}>
            ยกเลิก
          </Button>
        )}
        <Button
          className="flex-1 h-12 rounded-2xl"
          disabled={!valid}
          onClick={() => onSave({ target: Number(target), label: label.trim(), deadline: deadline || null })}
        >
          บันทึกเป้าหมาย
        </Button>
      </div>
    </section>
  )
}
