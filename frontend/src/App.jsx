import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { initLiff } from './hooks/useLiff'
import { ToastProvider } from './context/ToastContext'
import Home from './pages/Home'
import Report from './pages/Report'

const LIFF_ID = import.meta.env.VITE_LIFF_ID

export default function App() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initLiff(LIFF_ID)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <SplashScreen />

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home profile={profile} />} />
          <Route path="/report" element={<Report />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

function SplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background animate-fade-in gap-5">
      <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center shadow-lg">
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="10" width="36" height="28" rx="4" stroke="white" strokeWidth="3" fill="none"/>
          <path d="M14 20h20M14 26h12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="36" cy="34" r="8" fill="hsl(var(--primary))" stroke="white" strokeWidth="2.5"/>
          <path d="M33 34l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Slip-BUU</h1>
        <p className="text-sm text-muted-foreground mt-1">ระบบส่งสลิปโอนเงิน</p>
      </div>
      <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin mt-2" />
    </div>
  )
}
