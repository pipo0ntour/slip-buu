import { useEffect, useRef, useState } from 'react'
import { X, Camera, ImagePlus, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPostForm } from '@/lib/api'
import { CATEGORIES } from '@/components/TransactionForm'

// ── ชีต "บันทึกสินค้า" เฉพาะทาง — เปิดต่อจากการถ่ายรูปสินค้า ──
// ตัดผู้โอน/ผู้รับออก (ไม่เกี่ยวกับสินค้า) เหลือ: ชื่อสินค้า + จำนวน × ราคา/หน่วย → ยอดรวมอัตโนมัติ
// รูปสินค้า: ใช้ให้ AI อ่านชื่อ/หมวด/ราคาเท่านั้น (ไม่เก็บลง storage) — ตอนบันทึกไม่ส่งรูปไป
// บันทึกผ่าน /api/slip/manual เดิม (ไม่แตะ backend): ชื่อ+จำนวนเก็บลง note เช่น "น้ำตาลทราย ×3"
const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

export default function ProductForm({ toast, initialImage = null, onSaved, onClose }) {
  const [type, setType] = useState('expense') // สินค้าที่ซื้อ = รายจ่ายเป็นหลัก (สลับเป็นรายรับได้ถ้าขาย)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [category, setCategory] = useState('ค่าของ') // สินค้าส่วนใหญ่ = ค่าของ (เปลี่ยนได้)
  const [date, setDate] = useState('')
  const [image, setImage] = useState(initialImage) // รูปสินค้า (File) — มาจากกล้องตอนเลือก "รูปสินค้า"
  const [imageUrl, setImageUrl] = useState(null)   // object URL สำหรับพรีวิว
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false) // AI กำลังอ่านรูปสินค้า
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  // จำว่าผู้ใช้แก้ฟิลด์ไหนเองแล้ว — AI จะไม่เขียนทับ (อัปเดตทันทีตอนพิมพ์ ใช้ ref กัน stale ใน async)
  const nameTouchedRef = useRef(false)
  const categoryTouchedRef = useRef(false)
  const priceTouchedRef = useRef(false)
  const analyzedRef = useRef(null) // ไฟล์ล่าสุดที่ส่งให้ AI อ่านแล้ว (กันอ่านซ้ำไฟล์เดิม)

  // สร้าง/คืน object URL ของรูปพรีวิวตาม image ปัจจุบัน (กัน memory leak)
  useEffect(() => {
    if (!image) { setImageUrl(null); return }
    const url = URL.createObjectURL(image)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  // มีรูปสินค้า → ให้ AI อ่านชื่อ/หมวด/ราคา แล้วเติมให้ (เฉพาะฟิลด์ที่ผู้ใช้ยังไม่แก้เอง)
  useEffect(() => {
    if (!image) { setAnalyzing(false); return }
    if (analyzedRef.current === image) return // ไฟล์นี้อ่านไปแล้ว ไม่อ่านซ้ำ
    analyzedRef.current = image
    let alive = true
    setAnalyzing(true)
    const form = new FormData()
    form.append('image', image)
    apiPostForm('/api/slip/analyze-product', form)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || j?.status !== 'success' || !j.product?.isProduct) return
        const p = j.product
        if (!nameTouchedRef.current && p.name) setName(p.name)
        if (!categoryTouchedRef.current && p.category) setCategory(p.category)
        if (!priceTouchedRef.current && p.unitPrice != null) setUnitPrice(String(p.unitPrice))
      })
      .catch(() => {}) // อ่านไม่สำเร็จ = ให้ผู้ใช้กรอกเอง (เงียบ ๆ ไม่รบกวน)
      .finally(() => { if (alive) setAnalyzing(false) })
    return () => { alive = false }
  }, [image])

  const qtyNum = Number(qty)
  const unitNum = Number(unitPrice)
  const hasQty = Number.isFinite(qtyNum) && qtyNum > 0
  // ยอดรวม = จำนวน × ราคา/หน่วย (ไม่กรอกจำนวน = ถือเป็น 1 หน่วย)
  const total = (Number.isFinite(unitNum) && unitNum > 0 ? unitNum : 0) * (hasQty ? qtyNum : 1)
  const canSave = total > 0 && !saving

  // ปุ่ม −/+ ปรับจำนวน (ขั้นต่ำ 1) — ช่องว่างถือเป็น 1
  const stepQty = (delta) => {
    const cur = Number(qty)
    const base = Number.isFinite(cur) && cur > 0 ? cur : 1
    setQty(String(Math.max(1, base + delta)))
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const nm = name.trim()
      // ชื่อสินค้า + จำนวน เก็บรวมลง note (slips ไม่มีคอลัมน์แยก) — โชว์ในรายงานได้
      const note = nm
        ? (hasQty && qtyNum > 1 ? `${nm} ×${qtyNum}` : nm)
        : (hasQty && qtyNum > 1 ? `สินค้า ×${qtyNum}` : '')

      const form = new FormData()
      form.append('amount', String(total))
      form.append('type', type)
      if (note) form.append('note', note)
      if (category.trim()) form.append('category', category.trim())
      if (date) form.append('transaction_at', new Date(date).toISOString()) // เว้นว่าง → backend ใช้เวลาปัจจุบัน
      // ไม่ส่งรูปไปเก็บ — รูปสินค้าใช้ให้ AI อ่านอย่างเดียว (ดู useEffect analyze) แล้วทิ้ง

      const res = await apiPostForm('/api/slip/manual', form)
      if (res.status === 401) {
        toast?.({ message: 'เซสชันหมดอายุ กรุณาปิดแล้วเปิดใหม่ผ่านเมนูใน LINE', type: 'error' })
        return
      }
      if (res.status === 429) {
        toast?.({ message: 'ทำรายการถี่เกินไป กรุณารอสักครู่', type: 'warning' })
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'บันทึกไม่สำเร็จ')
      toast?.({ message: 'บันทึกสินค้าแล้ว', type: 'success' })
      onSaved?.(json.data)
      onClose?.()
    } catch (e) {
      toast?.({ message: e.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const isExpense = type === 'expense'

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center animate-fade-in"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 border-b border-border">
          <p className="font-bold text-lg">บันทึกสินค้า</p>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* รูปสินค้า */}
          <div>
            <span className="text-xs font-semibold text-muted-foreground">รูปสินค้า</span>
            {image ? (
              <div className="mt-2 relative w-28 h-28">
                <img src={imageUrl} alt="รูปสินค้า" className="w-full h-full object-cover rounded-xl border border-border" />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label="เอารูปออก"
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-foreground/80 text-background rounded-full flex items-center justify-center shadow"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => cameraRef.current?.click()}>
                  <Camera className="size-4" /> ถ่ายรูป
                </Button>
                <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => galleryRef.current?.click()}>
                  <ImagePlus className="size-4" /> เลือกรูป
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">ถ่ายเพื่อให้ AI อ่านรายละเอียดสินค้าให้</p>
          </div>

          {/* ประเภท: รายรับ / รายจ่าย */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('income')}
              className={`h-12 rounded-xl text-base font-semibold border transition-colors ${!isExpense ? 'bg-green-600 text-white border-green-600' : 'bg-card text-muted-foreground border-border'}`}
            >
              รายรับ
            </button>
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`h-12 rounded-xl text-base font-semibold border transition-colors ${isExpense ? 'bg-red-600 text-white border-red-600' : 'bg-card text-muted-foreground border-border'}`}
            >
              รายจ่าย
            </button>
          </div>

          {/* ชื่อสินค้า — AI เติมให้จากรูป (แก้ได้) */}
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground inline-flex items-center">
              ชื่อสินค้า
              {analyzing && (
                <span className="ml-2 inline-flex items-center gap-1 font-normal text-primary">
                  <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  AI กำลังอ่าน…
                </span>
              )}
            </span>
            <input
              value={name}
              onChange={e => { nameTouchedRef.current = true; setName(e.target.value) }}
              placeholder={analyzing ? 'AI กำลังอ่านชื่อสินค้า…' : 'เช่น น้ำตาลทราย, กล่องพัสดุ'}
              autoFocus
              className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {/* จำนวน (สเต็ปเปอร์ −/+ เลขอยู่กลาง) + ราคา/หน่วย — วางคู่กันในแถวเดียว */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-semibold text-muted-foreground">จำนวน</span>
              <div className="mt-1 flex items-center h-12 rounded-xl border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <button
                  type="button"
                  onClick={() => stepQty(-1)}
                  aria-label="ลดจำนวน"
                  className="w-10 h-full flex items-center justify-center text-muted-foreground active:bg-accent shrink-0"
                >
                  <Minus className="size-4" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  placeholder="1"
                  aria-label="จำนวน"
                  className="flex-1 min-w-0 h-full bg-transparent text-center text-base font-semibold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => stepQty(1)}
                  aria-label="เพิ่มจำนวน"
                  className="w-10 h-full flex items-center justify-center text-muted-foreground active:bg-accent shrink-0"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">ราคา/หน่วย (บาท)</span>
              <input
                type="number"
                inputMode="decimal"
                value={unitPrice}
                onChange={e => { priceTouchedRef.current = true; setUnitPrice(e.target.value) }}
                placeholder="0.00"
                className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-base text-right text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          {/* ยอดรวม (จำนวน × ราคา/หน่วย) */}
          <div className="flex items-baseline justify-between rounded-xl bg-muted/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">ยอดรวม</span>
            <span className={`text-xl font-bold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>{fmt(total)} บาท</span>
          </div>

          {/* หมวดหมู่ */}
          <div>
            <span className="text-xs font-semibold text-muted-foreground">หมวดหมู่</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { categoryTouchedRef.current = true; setCategory(category === c ? '' : c) }}
                  className={`h-9 px-3 rounded-full text-sm font-medium border transition-colors ${category === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={category}
              onChange={e => { categoryTouchedRef.current = true; setCategory(e.target.value) }}
              placeholder="หรือพิมพ์หมวดเอง เช่น วัสดุ"
              className="mt-2 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* วันที่ */}
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">วันที่ทำรายการ</span>
            <input
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-xs text-muted-foreground mt-1 block">เว้นว่าง = ใช้เวลาปัจจุบัน</span>
          </label>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 pb-6">
          <Button size="xl" className="w-full rounded-2xl" onClick={handleSave} disabled={!canSave}>
            {saving ? (
              <><span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> กำลังบันทึก...</>
            ) : 'บันทึกสินค้า'}
          </Button>
        </div>

        {/* อินพุตรูปซ่อนไว้ — ถ่ายจากกล้อง / เลือกจากคลัง (เปลี่ยนรูปได้ในฟอร์ม) */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { if (e.target.files?.[0]) setImage(e.target.files[0]); e.target.value = '' }} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden"
          onChange={e => { if (e.target.files?.[0]) setImage(e.target.files[0]); e.target.value = '' }} />
      </div>
    </div>
  )
}
