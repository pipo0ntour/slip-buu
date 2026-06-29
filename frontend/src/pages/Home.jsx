import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ImagePlus, X, CheckCircle, AlertTriangle, XCircle, Plus, NotebookPen, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/context/ToastContext'
import { apiPostForm } from '@/lib/api'
import { decodeQrFromFile } from '@/lib/qr'
import AddSheet from '@/components/AddSheet'
import NoteScan from '@/components/NoteScan'
import CartoonAvatar from '@/components/CartoonAvatar'
import GradientHeader from '@/components/GradientHeader'
import { loadAvatarFace } from '@/lib/avatarStore'

const MAX_FILES = 10

export default function Home({ profile }) {
  const navigate = useNavigate()
  const toast = useToast()
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const productCamRef = useRef(null) // กล้องสำหรับ "ถ่ายรูปสินค้า" → เปิดฟอร์มกรอกละเอียดพร้อมรูป
  const [items, setItems] = useState([])
  const [uploadType, setUploadType] = useState('income') // ทิศทางเงินของสลิปชุดนี้: 'income' | 'expense'
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null) // { current, total } ระหว่างอ่านสลิปทีละใบ
  const [results, setResults] = useState(null)
  const [showManual, setShowManual] = useState(false)
  const [showNote, setShowNote] = useState(false) // ฟอร์มถ่ายโน้ต → สรุปรายการ
  const [productImage, setProductImage] = useState(null) // รูปสินค้าที่เพิ่งถ่าย → ส่งเข้าฟอร์มกรอกละเอียด
  const [avatarFace] = useState(loadAvatarFace) // อวตารที่เก็บไว้ (โหลดตอน mount; จัดการในหน้า "ฉัน")
  const [previewUrl, setPreviewUrl] = useState(null) // รูปสลิปที่กดดูจากรายการผลลัพธ์

  function addFiles(fileList) {
    // เริ่มชุดใหม่ ล้างผลเดิม — คืน memory ของรูปที่ค้างอยู่ในผลลัพธ์รอบก่อนด้วย
    setPreviewUrl(null)
    setResults(prev => {
      prev?.forEach(r => { if (r.imageUrl) URL.revokeObjectURL(r.imageUrl) })
      return null
    })
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
      imageUrl: data.image_url || undefined, // รูปสินค้าที่แนบ (signed URL) — ให้ผลล่าสุดกดดูรูปได้
      data: {
        senderName: data.note || data.sender_name || data.category || (isExpense ? 'รายจ่าย' : 'รายรับ'),
        bank: data.category || (isExpense ? 'รายจ่าย' : 'รายรับ'),
        amount: data.amount,
        type: data.type,
      },
    }
    setResults(prev => [item, ...(prev || [])])
  }

  // รายการที่ได้จากการถ่ายโน้ต (หลายรายการ) — แปลงให้เข้ารูปแบบผลลัพธ์ แล้วเติมบนสุด
  function handleNoteSaved(rows) {
    const list = (rows || []).map(d => ({
      status: 'success',
      data: {
        senderName: d.note || (d.type === 'expense' ? 'รายจ่าย' : 'รายรับ'),
        bank: d.category || 'จากโน้ต',
        amount: d.amount,
        type: d.type,
      },
    }))
    if (list.length) setResults(prev => [...list, ...(prev || [])])
  }

  async function handleUpload() {
    if (!items.length || loading) return
    setLoading(true)
    const total = items.length
    const list = []
    try {
      // ส่งทีละใบ — แสดงความคืบหน้าได้จริง และใบไหนล้มเหลว (เช่นติดโควต้า OCR) ใบที่เหลือไปต่อได้
      for (let i = 0; i < total; i++) {
        setProgress({ current: i + 1, total })
        const form = new FormData()
        form.append('type', uploadType)
        form.append('images', items[i].file)

        // อ่าน QR ของสลิปในเครื่องก่อนส่ง — ถ้าซ้ำ backend ข้าม OCR (Gemini) ได้เลย ประหยัดค่า AI
        const qrPayload = await decodeQrFromFile(items[i].file)
        if (qrPayload) form.append('qrPayload', qrPayload)

        // แนบรูป local ของใบนี้ไปกับผลลัพธ์ — ผู้ใช้กดดูได้ว่าใบไหนซ้ำ/ผิดพลาด
        const imageUrl = items[i].imageUrl
        try {
          const res = await apiPostForm('/api/slip/upload-batch', form)
          if (res.status === 401) {
            toast({ message: 'เซสชันหมดอายุ กรุณาปิดแล้วเปิดใหม่ผ่านเมนูใน LINE', type: 'error' })
            return // เก็บรูปที่เหลือไว้ให้ส่งใหม่หลังเปิดแอปอีกรอบ
          }
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            // เอาข้อความจริงจาก server มาแสดง (เช่น "ไฟล์ใหญ่เกิน 10MB" / "ทำรายการถี่เกินไป")
            list.push({ status: 'error', message: data.message || 'เกิดข้อผิดพลาด', imageUrl })
            continue
          }
          list.push(...(data.results || []).map(r => ({ ...r, imageUrl })))
        } catch {
          list.push({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', imageUrl })
        }
      }

      // ไม่ revoke object URL ที่นี่ — รูปยังถูกใช้แสดงในผลลัพธ์ (ล้างตอนเริ่มชุดใหม่ใน addFiles)
      setItems([])
      setResults(list)

      const ok = list.filter(r => r.status === 'success').length
      const fail = list.length - ok
      toast({
        message: fail === 0
          ? `บันทึกสำเร็จ ${ok} รายการ`
          : `สำเร็จ ${ok} · ซ้ำ/ผิดพลาด ${fail}`,
        type: fail === 0 ? 'success' : 'warning',
      })
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      {/* Header ไล่เฉด — แตะรูปโปรไฟล์ไปหน้า "ฉัน" (จัดการอวตาร/บุคลิก/สถิติ ที่นั่น) */}
      <GradientHeader>
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/me')}
            className="relative h-12 w-12 shrink-0 rounded-full ring-2 ring-white/50 ring-offset-2 ring-offset-transparent active:scale-95 transition-transform"
            aria-label="ไปหน้าฉัน"
          >
            <CartoonAvatar
              face={avatarFace}
              fallbackUrl={profile?.pictureUrl}
              className="h-12 w-12 rounded-full"
            />
          </button>
          <div>
            <h1 className="text-2xl font-bold leading-tight">
              {profile?.displayName || 'Slip-BUU'}
            </h1>
            <p className="text-sm text-foreground/70 leading-tight">ส่งสลิปโอนเงิน · ใบเสร็จ/ตั๋ว</p>
          </div>
        </header>
      </GradientHeader>

      <div className="mx-auto max-w-md px-5 -mt-5 pt-5 rounded-t-[2rem] bg-background">

        {/* Upload Card — การ์ดพระเอกของหน้าแรก เน้นมนขึ้น + เงาเด่นกว่าการ์ดอื่น */}
        <section className="rounded-3xl border border-border bg-card p-5 shadow-md">
          <h2 className="text-xl font-bold">อัพโหลดสลิป / ใบเสร็จ</h2>
          <p className="text-sm text-muted-foreground mt-1">{items.length} / {MAX_FILES} รายการ</p>

          {/* ทิศทางเงิน (สำหรับสลิป) — บอกระบบว่าเป็นเงินเข้าหรือเงินออก (แก้รายใบทีหลังได้ในหน้ารายงาน)
              ใบเสร็จ/ตั๋ว ระบบตรวจจับเองและบันทึกเป็น "รายจ่าย" อัตโนมัติ ไม่ขึ้นกับปุ่มนี้ */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={() => setUploadType('income')}
              disabled={loading}
              className={`h-11 rounded-xl text-sm font-semibold border transition-colors ${
                uploadType === 'income'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-card text-muted-foreground border-border'
              }`}
            >
              เงินเข้า (รายรับ)
            </button>
            <button
              type="button"
              onClick={() => setUploadType('expense')}
              disabled={loading}
              className={`h-11 rounded-xl text-sm font-semibold border transition-colors ${
                uploadType === 'expense'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-card text-muted-foreground border-border'
              }`}
            >
              เงินออก (รายจ่าย)
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
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
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-foreground/80 text-background rounded-full flex items-center justify-center shadow"
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
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                {progress ? `กำลังอ่าน ${progress.current}/${progress.total}` : 'กำลังส่ง...'}
              </>
            ) : items.length > 0 ? (
              `อัพโหลด ${items.length} รายการ`
            ) : (
              'อัพโหลด 0 รายการ'
            )}
          </Button>
          {loading && progress && progress.total > 1 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              หลายใบอาจใช้เวลาสักครู่ กรุณาอย่าปิดหน้านี้
            </p>
          )}
        </section>

        {/* ทางลัดเพิ่มรายการ — ถ่ายโน้ต / เพิ่มเอง / ถ่ายรูปสินค้า (ไอคอนบน/ข้อความล่าง) */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="rounded-2xl border border-coral/30 bg-coral/[0.06] p-3 flex flex-col items-center gap-2 transition-transform active:scale-[0.98]"
          >
            <span className="w-11 h-11 rounded-xl bg-coral/15 flex items-center justify-center">
              <NotebookPen className="size-5 text-coral" />
            </span>
            <span className="text-xs font-semibold text-coral leading-tight text-center">ถ่ายโน้ต</span>
          </button>

          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-3 flex flex-col items-center gap-2 transition-transform active:scale-[0.98]"
          >
            <span className="w-11 h-11 rounded-xl bg-primary/[0.12] flex items-center justify-center">
              <Plus className="size-5 text-primary" />
            </span>
            <span className="text-xs font-semibold text-primary leading-tight text-center">เพิ่มรายการ</span>
          </button>

          <button
            type="button"
            onClick={() => productCamRef.current?.click()}
            className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-3 flex flex-col items-center gap-2 transition-transform active:scale-[0.98]"
          >
            <span className="w-11 h-11 rounded-xl bg-sky-500/15 flex items-center justify-center">
              <ShoppingBag className="size-5 text-sky-600" />
            </span>
            <span className="text-xs font-semibold text-sky-600 leading-tight text-center">รูปสินค้า</span>
          </button>
        </div>

        {/* ผลล่าสุด (inline — ไม่เด้งออกไปอีกหน้า) */}
        {results && results.length > 0 && (
          <ResultSummary results={results} onPreview={setPreviewUrl} />
        )}
      </div>

      {/* ดูรูปสลิปเต็มจอ — กดที่ไหนก็ได้เพื่อปิด */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="สลิป" className="max-w-full max-h-full rounded-2xl object-contain" />
        </div>
      )}

      {showManual && (
        <AddSheet
          toast={toast}
          onManualSaved={handleManualSaved}
          onMultiSaved={handleNoteSaved}
          initialTab={productImage ? 'form' : 'text'}
          initialImage={productImage}
          onClose={() => { setShowManual(false); setProductImage(null) }}
        />
      )}

      {showNote && (
        <NoteScan
          toast={toast}
          onSaved={handleNoteSaved}
          onClose={() => setShowNote(false)}
        />
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      {/* รูปสินค้า → เปิดฟอร์มกรอกละเอียด (แท็บ form) พร้อมรูป
          ไม่ใส่ capture → ระบบให้เลือกเอง (ถ่ายรูป/เลือกจากแกลเลอรี) เผื่อกล้องพังหรือถูกปฏิเสธสิทธิ์ */}
      <input ref={productCamRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setProductImage(f); setShowManual(true) } }} />
    </div>
  )
}

function ResultSummary({ results, onPreview }) {
  const ok = results.filter(r => r.status === 'success').length
  const dup = results.filter(r => r.status === 'duplicate').length
  const err = results.filter(r => r.status === 'error').length
  // ยอดสุทธิ: เงินเข้าเป็นบวก เงินออกเป็นลบ (รายการที่ไม่มี type = เงินเข้า)
  const total = results
    .filter(r => r.status === 'success' && r.data?.amount)
    .reduce((sum, r) => sum + Number(r.data.amount) * (r.data.type === 'expense' ? -1 : 1), 0)

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
        {total !== 0 && (
          <p className={`mt-1 text-2xl font-bold ${total < 0 ? 'text-red-600' : ''}`}>
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
          const color = isOk ? 'text-green-600' : isDup ? 'text-amber-600' : 'text-destructive'
          const label = isOk ? 'สำเร็จ' : isDup ? 'รายการซ้ำ' : 'ผิดพลาด'
          // มีรูปแนบ → ทั้งแถวกดดูรูปได้ (สำคัญตอนขึ้น "ซ้ำ" จะได้รู้ว่าใบไหน)
          const Row = r.imageUrl ? 'button' : 'div'
          return (
            <Row
              key={i}
              {...(r.imageUrl ? { type: 'button', onClick: () => onPreview?.(r.imageUrl) } : {})}
              className="w-full flex items-center justify-between px-5 py-3 gap-3 text-left active:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {r.imageUrl && (
                  <img src={r.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
                )}
                <Icon className={`size-5 shrink-0 ${color}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{r.data?.senderName || `รายการ ${i + 1}`}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.data?.bank || r.message || label}</p>
                </div>
              </div>
              <p className={`text-sm font-bold shrink-0 ${r.data?.amount ? (r.data.type === 'expense' ? 'text-red-600' : 'text-green-600') : ''}`}>
                {r.data?.amount
                  ? `${r.data.type === 'expense' ? '-' : '+'}${Number(r.data.amount).toLocaleString('th-TH')} ฿`
                  : label}
              </p>
            </Row>
          )
        })}
      </div>
    </section>
  )
}
