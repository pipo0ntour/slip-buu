import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Target, Wallet, ChevronRight } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { apiGet } from '@/lib/api'
import { fmtBaht, categoryLabel } from '@/lib/finance'
import { bkkToday, anchorParam } from '@/lib/period'
import { derivePersona } from '@/lib/persona'
import PersonaCard from '@/components/PersonaCard'
import CartoonAvatar from '@/components/CartoonAvatar'
import StatCard from '@/components/StatCard'
import SessionExpiredCard from '@/components/SessionExpiredCard'
import GradientHeader from '@/components/GradientHeader'
import { loadAvatarFace } from '@/lib/avatarStore'

const AvatarMaker = lazy(() => import('@/components/AvatarMaker'))

const EMPTY_STATS = { totalIncome: 0, totalExpense: 0, net: 0, count: 0 }

// ช่วงเวลาของ "บุคลิกการเงิน" — คิดจากรายการจริงของช่วงที่เลือก
const PERSONA_PERIODS = [
  { key: 'monthly', label: 'เดือน', chip: 'เดือนนี้' },
  { key: 'yearly', label: 'ปี', chip: 'ปีนี้' },
  { key: 'all', label: 'ทั้งหมด', chip: 'ทั้งหมด' },
]

export default function Profile({ profile }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [avatarFace, setAvatarFace] = useState(loadAvatarFace)
  const [showAvatar, setShowAvatar] = useState(false)

  const [personaPeriod, setPersonaPeriod] = useState('yearly')
  const [personaSlips, setPersonaSlips] = useState([]) // รายการของช่วงที่เลือก (ใช้คิดบุคลิก)
  const [personaLoading, setPersonaLoading] = useState(true)

  const [stats, setStats] = useState(null) // ยอดรวม "ตลอดทั้งหมด"
  const [statsLoading, setStatsLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  // รายการของช่วงที่เลือก → คิดบุคลิก (เดือน/ปี = กรองวันที่, ทั้งหมด = period=all)
  async function loadPersona() {
    setPersonaLoading(true)
    try {
      const q = personaPeriod === 'all'
        ? 'period=all'
        : `period=${personaPeriod}&date=${anchorParam(bkkToday())}`
      const res = await apiGet(`/api/report?${q}`)
      if (res.status === 401) { setSessionExpired(true); return }
      setSessionExpired(false)
      const j = res.ok ? await res.json().catch(() => null) : null
      setPersonaSlips(j?.slips || [])
    } catch {
      setPersonaSlips([])
    } finally {
      setPersonaLoading(false)
    }
  }

  // ยอดรวมตลอดกาล (โหลดครั้งเดียว)
  async function loadStats() {
    setStatsLoading(true)
    try {
      const res = await apiGet('/api/report/summary')
      if (res.status === 401) { setSessionExpired(true); return }
      setSessionExpired(false)
      const j = res.ok ? await res.json().catch(() => null) : null
      setStats(j)
    } catch {
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => { loadStats() }, [])
  useEffect(() => { loadPersona() }, [personaPeriod])

  function retry() {
    setSessionExpired(false)
    loadStats()
    loadPersona()
  }

  const persona = personaSlips.length ? derivePersona(personaSlips, categoryLabel) : null
  const personaChip = PERSONA_PERIODS.find(p => p.key === personaPeriod)?.chip
  const st = stats || EMPTY_STATS

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      {/* การ์ดโปรไฟล์ + อวตาร — อยู่บนแถบไล่เฉด (ดูเป็นหน้า "ตัวตน") */}
      <GradientHeader className="flex flex-col items-center text-center">
        <button
          type="button"
          onClick={() => setShowAvatar(true)}
          className="relative active:scale-95 transition-transform"
          aria-label="สร้าง/เปลี่ยนอวตาร"
        >
          <CartoonAvatar face={avatarFace} fallbackUrl={profile?.pictureUrl} className="h-24 w-24 rounded-full ring-4 ring-white/40" />
          <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card text-primary flex items-center justify-center shadow ring-2 ring-white/70">
            <Sparkles className="size-4" />
          </span>
        </button>
        <h1 className="mt-3 text-xl font-bold">{profile?.displayName || 'ผู้ใช้ Slip-BUU'}</h1>
        <button
          type="button"
          onClick={() => setShowAvatar(true)}
          className="mt-1 text-sm font-medium text-foreground/70"
        >
          {avatarFace ? 'เปลี่ยนอวตารการ์ตูน' : 'แตะเพื่อสร้างอวตารการ์ตูน'}
        </button>
      </GradientHeader>

      <div className="mx-auto max-w-md px-5 -mt-5 pt-5 rounded-t-[2rem] bg-background">

        {sessionExpired ? (
          <SessionExpiredCard onRetry={retry} />
        ) : (
          <>
            {/* ช่วงเวลาของบุคลิก */}
            <div className="mt-4 flex gap-2">
              {PERSONA_PERIODS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPersonaPeriod(p.key)}
                  className={`flex-1 h-9 rounded-full text-sm font-medium border transition-colors ${
                    personaPeriod === p.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* บุคลิกการเงินตามช่วงที่เลือก */}
            {personaLoading ? (
              <div className="mt-4 rounded-2xl border border-border bg-card p-8 shadow-sm flex justify-center">
                <span className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : persona ? (
              <PersonaCard persona={persona} periodLabel={personaChip} />
            ) : (
              <div className="mt-4 rounded-2xl border border-border bg-card p-8 shadow-sm text-center">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm text-muted-foreground">ยังไม่มีรายการในช่วงนี้</p>
              </div>
            )}

            {/* สถิติรวมตลอดทั้งหมด (ต่างจากหน้ารายงานที่อิงช่วงเวลา) */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <StatCard label="รายรับทั้งหมด" size="md" tone="income" value={statsLoading ? '...' : fmtBaht(st.totalIncome)} />
              <StatCard label="รายจ่ายทั้งหมด" size="md" tone="expense" value={statsLoading ? '...' : fmtBaht(st.totalExpense)} />
              <StatCard label="คงเหลือทั้งหมด" size="md" tone={st.net < 0 ? 'expense' : 'default'} value={statsLoading ? '...' : fmtBaht(st.net)} />
              <StatCard label="บันทึกทั้งหมด" size="md" value={statsLoading ? '...' : String(st.count)} />
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

        {/* ลิงก์ไปหน้างบประมาณรายเดือน */}
        <button
          type="button"
          onClick={() => navigate('/budget')}
          className="mt-3 w-full rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-3 active:bg-accent transition-colors"
        >
          <span className="w-11 h-11 rounded-xl bg-primary/12 flex items-center justify-center shrink-0">
            <Wallet className="size-5 text-primary" />
          </span>
          <div className="text-left min-w-0 flex-1">
            <p className="text-sm font-semibold">งบประมาณรายเดือน</p>
            <p className="text-xs text-muted-foreground">ตั้งวงเงินแต่ละหมวดและเช็กว่าใช้เกินไหม</p>
          </div>
          <ChevronRight className="size-5 text-muted-foreground shrink-0" />
        </button>
      </div>

      {showAvatar && (
        <Suspense fallback={null}>
          <AvatarMaker
            toast={toast}
            hasAvatar={!!avatarFace}
            initialFace={avatarFace}
            onSaved={setAvatarFace}
            onClose={() => setShowAvatar(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
