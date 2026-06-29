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
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-secondary/95 backdrop-blur-lg rounded-t-3xl shadow-[0_-6px_24px_rgba(2,34,36,0.08)] pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      {/* แถบมินต์เต็มกว้าง ไอคอนล้วน — แท็บที่เลือก = สี่เหลี่ยมมนเขียวทึบ (ตามดีไซน์ FinWise) */}
      <div className="mx-auto max-w-md grid grid-cols-5 px-4 pt-2.5">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = isActive(to)
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              className="flex items-center justify-center py-1 transition-transform active:scale-90"
            >
              <span
                className={`flex items-center justify-center h-11 w-11 rounded-2xl transition-all ${
                  active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground'
                }`}
              >
                <Icon className="size-[22px]" />
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
