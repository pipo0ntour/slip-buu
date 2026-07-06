import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { initLiff } from './hooks/useLiff'
import { setStorageUser } from './lib/userScope'
import { ToastProvider } from './context/ToastContext'
import TabBar from './components/TabBar'
import Home from './pages/Home'

// หน้ารองโหลดแบบ lazy — หน้าแรก (Home) เบาไว้ก่อน หน้าอื่นค่อยโหลดตอนสลับแท็บ
const Report = lazy(() => import('./pages/Report'))
const Search = lazy(() => import('./pages/Search'))
const Insights = lazy(() => import('./pages/Insights'))
const Profile = lazy(() => import('./pages/Profile'))
const Goals = lazy(() => import('./pages/Goals'))
const Budget = lazy(() => import('./pages/Budget'))

const LIFF_ID = import.meta.env.VITE_LIFF_ID

export default function App() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initLiff(LIFF_ID)
      .then((p) => {
        // ผูก localStorage (งบ/เป้า/อวตาร) กับบัญชีนี้ "ก่อน" เรนเดอร์หน้าใด ๆ —
        // เครื่องเดียวกันสลับหลายบัญชี LINE จะไม่เห็นข้อมูลของกันและกัน
        setStorageUser(p?.userId)
        setProfile(p)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <SplashScreen />

  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Home profile={profile} />} />
            <Route path="/report" element={<Report />} />
            <Route path="/search" element={<Search />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/me" element={<Profile profile={profile} />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/budget" element={<Budget />} />
          </Routes>
        </Suspense>
        <TabBar />
      </BrowserRouter>
    </ToastProvider>
  )
}

// fallback ระหว่างโหลด chunk ของหน้ารอง — เว้นที่ด้านล่างให้แถบแท็บ
function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background pb-24" role="status" aria-label="กำลังโหลด">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-dot" />
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-dot [animation-delay:0.15s]" />
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-dot [animation-delay:0.3s]" />
      </div>
    </div>
  )
}

function SplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background animate-fade-in gap-6 px-6">
      {/* โลโก้ใบสลิป (ขอบล่างหยัก) + เครื่องหมายถูก — สื่อ "บันทึกสลิปสำเร็จ" ตรง ๆ */}
      <div className="w-24 h-24 rounded-[1.75rem] bg-primary flex items-center justify-center shadow-lg shadow-primary/25 animate-pop">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 7h22v33l-3.7-2.8-3.6 2.8-3.7-2.8-3.6 2.8-3.7-2.8L13 40V7z" stroke="white" strokeWidth="3" strokeLinejoin="round" fill="none"/>
          <path d="M19 15h10M19 21h6" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M19 29l3.5 3.5L29 26" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Slip-BUU</h1>
        <p className="text-base text-muted-foreground mt-1.5">ระบบส่งสลิปโอนเงิน</p>
      </div>
      <div className="flex items-center gap-2 mt-2" role="status" aria-label="กำลังโหลด">
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-dot" />
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-dot [animation-delay:0.15s]" />
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-dot [animation-delay:0.3s]" />
      </div>
    </div>
  )
}
