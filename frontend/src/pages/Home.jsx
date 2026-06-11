import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ImagePlus, BarChart3, X, CheckCircle, AlertTriangle, XCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/context/ToastContext'
import { apiPostForm } from '@/lib/api'
import TransactionForm from '@/components/TransactionForm'

const MAX_FILES = 10

export default function Home({ profile }) {
  const navigate = useNavigate()
  const toast = useToast()
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [showManual, setShowManual] = useState(false)

  function addFiles(fileList) {
    setResults(null) // เริ่มชุดใหม่ ล้างผลเดิม
    const incoming = Array.from(fileList)
    setItems(prev => {
      const slots = MAX_FILES - prev.length
      if (slots <= 0) return prev
      return [
        ...prev,
        ...incoming.slice(0, slots).map(f => ({ file: f, imageUrl: URL.createObjectURL(f) })),
      ]
    })
  }

  function removeItem(index) {
    setItems(prev => {
      URL.revokeObjectURL(prev[index].imageUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  // รายการที่ผู้ใช้เพิ่มเอง (ไม่มีสลิป) — แปลงให้เข้ารูปแบบเดียวกับผลอัพโหลด แล้วเติมบนสุดของ "ผลล่าสุด"
  function handleManualSaved(data) {
    const isExpense = data.type === 'expense'
    const item = {
      status: 'success',
      data: {
        senderName: data.note || data.sender_name || data.category || (isExpense ? 'รายจ่าย' : 'รายรับ'),
        bank: data.category || (isExpense ? 'รายจ่าย' : 'รายรับ'),
        amount: data.amount,
      },
    }
    setResults(prev => [item, ...(prev || [])])
  }

  async function handleUpload() {
    if (!items.length || loading) return
    setLoading(true)
    try {
      const form = new FormData()
      items.forEach(item => form.append('images', item.file))

      const res = await apiPostForm('/api/slip/upload-batch', form)
      if (res.status === 401) {
        toast({ message: 'เซสชันหมดอายุ กรุณาปิดแล้วเปิดใหม่ผ่านเมนูใน LINE', type: 'error' })
        return
      }
      if (res.status === 429) {
        toast({ message: 'ทำรายการถี่เกินไป กรุณารอสักครู่', type: 'warning' })
        return
      }
      if (!res.ok) throw new Error()
      const data = await res.json()
      const list = data.results || []

      items.forEach(item => URL.revokeObjectURL(item.imageUrl))
      setItems([])
      setResults(list)

      const ok = list.filter(r => r.status === 'success').length
      const fail = list.length - ok
      toast({
        message: fail === 0
          ? `บันทึกสำเร็จ ${ok} สลิป`
          : `สำเร็จ ${ok} · ซ้ำ/ผิดพลาด ${fail}`,
        type: fail === 0 ? 'success' : 'warning',
      })
    } catch {
      toast({ message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="mx-auto max-w-md px-5 pt-6">

        {/* Header */}
        <header className="flex items-center gap-3 mb-6">
          {profile?.pictureUrl ? (
            <img src={profile.pictureUrl} className="h-12 w-12 rounded-full object-cover" alt="" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-primary/10" />
          )}
          <div>
            <h1 className="text-2xl font-bold leading-tight">
              {profile?.displayName || 'Slip-BUU'}
            </h1>
            <p className="text-sm text-muted-foreground leading-tight">ระบบส่งสลิปโอนเงิน</p>
          </div>
        </header>

        {/* Upload Card */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xl font-bold">อัพโหลดสลิป</h2>
          <p className="text-sm text-muted-foreground mt-1">{items.length} / {MAX_FILES} รายการ</p>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <Button
              className="h-12 rounded-xl"
              disabled={items.length >= MAX_FILES || loading}
              onClick={() => cameraRef.current.click()}
            >
              <Camera className="size-4" />
              ถ่ายรูป
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-xl"
              disabled={items.length >= MAX_FILES || loading}
              onClick={() => galleryRef.current.click()}
            >
              <ImagePlus className="size-4" />
              จากคลัง
            </Button>
          </div>

          {/* Thumbnails */}
          {items.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-4">
              {items.map((item, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={item.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                  <button
                    onClick={() => removeItem(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            size="xl"
            className="w-full rounded-2xl mt-5"
            disabled={items.length === 0 || loading}
            onClick={handleUpload}
          >
            {loading
              ? 'กำลังส่ง...'
              : items.length > 0
                ? `อัพโหลด ${items.length} สลิป`
                : 'อัพโหลด 0 สลิป'}
          </Button>
        </section>

        {/* เพิ่มรายการเอง — สำหรับรายการที่ไม่มีสลิป (เช่น จ่ายเงินสด) */}
        <Button
          variant="outline"
          className="w-full h-12 rounded-2xl mt-4 text-base font-semibold"
          onClick={() => setShowManual(true)}
        >
          <Plus className="size-4" />
          เพิ่มรายการเอง (ไม่มีสลิป)
        </Button>

        {/* ผลล่าสุด (inline — ไม่เด้งออกไปอีกหน้า) */}
        {results && results.length > 0 && (
          <ResultSummary results={results} />
        )}
      </div>

      {showManual && (
        <TransactionForm
          toast={toast}
          onSaved={handleManualSaved}
          onClose={() => setShowManual(false)}
        />
      )}

      {/* Bottom Bar */}
      <div className="fixed bottom-0 inset-x-0 border-t border-border bg-background/95 backdrop-blur px-5 py-3">
        <div className="mx-auto max-w-md">
          <Button
            variant="outline"
            className="w-full h-12 rounded-2xl text-base font-semibold"
            onClick={() => navigate('/report')}
          >
            <BarChart3 className="size-4" />
            ดูรายงาน
          </Button>
        </div>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}

function ResultSummary({ results }) {
  const ok = results.filter(r => r.status === 'success').length
  const dup = results.filter(r => r.status === 'duplicate').length
  const err = results.filter(r => r.status === 'error').length
  const total = results
    .filter(r => r.status === 'success' && r.data?.amount)
    .reduce((sum, r) => sum + Number(r.data.amount), 0)

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-slide-up">
      <div className="px-5 pt-4 pb-3 border-b border-border">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">ผลล่าสุด</p>
          <p className="text-xs text-muted-foreground">
            สำเร็จ {ok}
            {dup > 0 && ` · ซ้ำ ${dup}`}
            {err > 0 && ` · ผิดพลาด ${err}`}
          </p>
        </div>
        {total > 0 && (
          <p className="mt-1 text-2xl font-bold">
            {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}{' '}
            <span className="text-sm font-normal text-muted-foreground">บาท</span>
          </p>
        )}
      </div>
      <div className="divide-y divide-border">
        {results.map((r, i) => {
          const isOk = r.status === 'success'
          const isDup = r.status === 'duplicate'
          const Icon = isOk ? CheckCircle : isDup ? AlertTriangle : XCircle
          const color = isOk ? 'text-green-500' : isDup ? 'text-yellow-500' : 'text-destructive'
          const label = isOk ? 'สำเร็จ' : isDup ? 'สลิปซ้ำ' : 'ผิดพลาด'
          return (
            <div key={i} className="flex items-center justify-between px-5 py-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`size-5 shrink-0 ${color}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{r.data?.senderName || `สลิป ${i + 1}`}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.data?.bank || r.message || label}</p>
                </div>
              </div>
              <p className="text-sm font-bold shrink-0">
                {r.data?.amount ? `${Number(r.data.amount).toLocaleString('th-TH')} ฿` : label}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
