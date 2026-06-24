import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Target, ChevronRight } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { apiGet } from '@/lib/api'
import { fmtBaht, categoryLabel } from '@/lib/finance'
import { bkkToday, anchorParam } from '@/lib/period'
import { derivePersona } from '@/lib/persona'
import PersonaCard from '@/components/PersonaCard'
import CartoonAvatar from '@/components/CartoonAvatar'
import StatCard from '@/components/StatCard'
import SessionExpiredCard from '@/components/SessionExpiredCard'
import { loadAvatarFace } from '@/lib/avatarStore'

const AvatarMaker = lazy(() => import('@/components/AvatarMaker'))

const EMPTY_STATS = { totalIncome: 0, totalExpense: 0, net: 0, count: 0 }

export default function Profile({ profile }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [avatarFace, setAvatarFace] = useState(loadAvatarFace)
  const [showAvatar, setShowAvatar] = useState(false)
  const [slips, setSlips] = useState([]) // รายการ "ปีนี้" ใช้คำนวณบุคลิก
  const [stats, setStats] = useState(null) // ยอดรวม "ตลอดทั้งหมด" (จาก /api/report/summary)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  // ดึง 2 อย่างพร้อมกัน: รายการปีนี้ (บุคลิก) + ยอดรวมตลอดกาล (สถิติ)
  async function load() {
    setLoading(true)
    try {
      const [rRep, rSum] = await Promise.all([
        apiGet(`/api/report?period=yearly&date=${anchorParam(bkkToday())}`),
        apiGet('/api/report/summary'),
      ])
      if (rRep.status === 401 || rSum.status === 401) { setSessionExpired(true); return }
      setSessionExpired(false)
      const rep = rRep.ok ? await rRep.json().catch(() => null) : null
      const sum = rSum.ok ? await rSum.json().catch(() => null) : null
      setSlips(rep?.slips || [])
      setStats(sum)
    } catch {
      setSlips([]); setStats(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const persona = slips.length ? derivePersona(slips, categoryLabel) : null
  const st = stats || EMPTY_STATS

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="mx-auto max-w-md px-5 pt-6">
        {/* การ์ดโปรไฟล์ + อวตาร */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => setShowAvatar(true)}
            className="relative active:scale-95 transition-transform"
            aria-label="สร้าง/เปลี่ยนอวตาร"
          >
            <CartoonAvatar face={avatarFace} fallbackUrl={profile?.pictureUrl} className="h-24 w-24 rounded-full" />
            <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow ring-2 ring-card">
              <Sparkles className="size-4" />
            </span>
          </button>
          <h1 className="mt-3 text-xl font-bold">{profile?.displayName || 'ผู้ใช้ Slip-BUU'}</h1>
          <button
            type="button"
            onClick={() => setShowAvatar(true)}
            className="mt-1 text-sm font-medium text-primary"
          >
            {avatarFace ? 'เปลี่ยนอวตารการ์ตูน' : 'แตะเพื่อสร้างอวตารการ์ตูน'}
          </button>
        </section>

        {sessionExpired ? (
          <SessionExpiredCard onRetry={load} />
        ) : (
          <>
            {/* บุคลิกการเงินปีนี้ */}
            {!loading && persona && <PersonaCard persona={persona} periodLabel="ปีนี้" />}

            {/* สถิติรวมตลอดทั้งหมด (ต่างจากหน้ารายงานที่อิงช่วงเวลา) */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <StatCard label="รายรับทั้งหมด" size="md" tone="income" value={loading ? '...' : fmtBaht(st.totalIncome)} />
              <StatCard label="รายจ่ายทั้งหมด" size="md" tone="expense" value={loading ? '...' : fmtBaht(st.totalExpense)} />
              <StatCard label="คงเหลือทั้งหมด" size="md" tone={st.net < 0 ? 'expense' : 'default'} value={loading ? '...' : fmtBaht(st.net)} />
              <StatCard label="บันทึกทั้งหมด" size="md" value={loading ? '...' : String(st.count)} />
            </div>
          </>
        )}

        {/* ลิงก์ไปหน้าเป้าหมายออมเงิน */}
        <button
          type="button"
          onClick={() => navigate('/goals')}
          className="mt-4 w-full rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-3 active:bg-accent transition-colors"
        >
          <span className="w-11 h-11 rounded-xl bg-primary/12 flex items-center justify-center shrink-0">
            <Target className="size-5 text-primary" />
          </span>
          <div className="text-left min-w-0 flex-1">
            <p className="text-sm font-semibold">เป้าหมายออมเงิน</p>
            <p className="text-xs text-muted-foreground">ตั้งเป้าเก็บเงินและดูความคืบหน้า</p>
          </div>
          <ChevronRight className="size-5 text-muted-foreground shrink-0" />
        </button>
      </div>

      {showAvatar && (
        <Suspense fallback={null}>
          <AvatarMaker
            toast={toast}
            hasAvatar={!!avatarFace}
            onSaved={setAvatarFace}
            onClose={() => setShowAvatar(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
