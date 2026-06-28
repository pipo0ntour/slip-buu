import { Link, useLocation } from 'react-router-dom'
import { Home, Search, BarChart3, TrendingUp, User } from 'lucide-react'

// แถบแท็บล่าง — ปลายทางหลัก 5 แท็บ (เป้าหมายออมเงิน /goals ถือเป็นหน้าย่อยของ "ฉัน")
const TABS = [
  { to: '/', label: 'หลัก', icon: Home },
  { to: '/search', label: 'ค้นหา', icon: Search },
  { to: '/report', label: 'รายงาน', icon: BarChart3 },
  { to: '/insights', label: 'สถิติ', icon: TrendingUp },
  { to: '/me', label: 'ฉัน', icon: User },
]

export default function TabBar() {
  const { pathname } = useLocation()

  // /goals, /budget เป็นหน้าย่อยของ "ฉัน" → ให้แท็บฉันสว่างค้างไว้ ไม่ให้ดูเหมือนหลุดหน้า
  const isActive = (to) => {
    if (to === '/') return pathname === '/'
    if (to === '/me') return pathname === '/me' || pathname === '/goals' || pathname === '/budget'
    return pathname === to
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md grid grid-cols-5">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = isActive(to)
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center justify-center gap-0.5 py-2 active:bg-accent transition-colors"
            >
              <Icon className={`size-[22px] ${active ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
