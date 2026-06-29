import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPostForm } from '@/lib/api'
import { guessCategory } from '@/lib/categorize'

// หมวดหมู่ลัด — ปรับ/เพิ่มได้ตามร้าน (ใช้ร่วมกับ note quick-pick ในหน้า Report)
export const CATEGORIES = ['ค่าของ', 'ค่าส่ง', 'ค่าอาหาร', 'ค่าน้ำค่าไฟ', 'ค่าเช่า', 'ค่าเดินทาง', 'สุขภาพ', 'เงินเดือน', 'อื่นๆ']

// ── ฟอร์มกรอกรายการละเอียด (1 รายการ) — body+footer ไม่มี chrome ของชีต ──
// ใช้เป็นแท็บ "กรอกละเอียด" ใน AddSheet หรือใช้เดี่ยวผ่าน <TransactionForm/> (มี chrome ครบ)
export function ManualForm({ toast, onSaved, onClose, initialImage = null }) {
  const [type, setType] = useState('income') // 'income' | 'expense'
  const [amount, setAmount] = useState('')
  const [image, setImage] = useState(initialImage) // รูปสินค้าแนบ (ไม่บังคับ) — File
  const [imageUrl, setImageUrl] = useState(null)   // object URL สำหรับพรีวิว
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  // สร้าง/คืน object URL ของรูปพรีวิวตาม image ปัจจุบัน (กัน memory leak)
  useEffect(() => {
    if (!image) { setImageUrl(null); return }
    const url = URL.createObjectURL(image)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])
  const [category, setCategory] = useState('')
  const [categoryTouched, setCategoryTouched] = useState(false) // ผู้ใช้เลือกหมวดเอง → หยุดเดาอัตโนมัติ
  const [note, setNote] = useState('')

  // พิมพ์โน้ต → เดาหมวดให้ ตราบใดที่ผู้ใช้ยังไม่ได้เลือกหมวดเอง
  const autoGuessed = !categoryTouched && !!category
  function handleNoteChange(v) {
    setNote(v)
    if (!categoryTouched) setCategory(guessCategory(v) || '')
  }
  function pickCategory(c) {
    setCategoryTouched(true)
    setCategory((prev) => (prev === c ? '' : c))
  }
  const [sender, setSender] = useState('')
  const [receiver, setReceiver] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const amountNum = Number(amount)
  const canSave = Number.isFinite(amountNum) && amountNum > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const form = new FormData()
      form.append('amount', String(amountNum))
      form.append('type', type)
      if (sender.trim()) form.append('sender_name', sender.trim())
      if (receiver.trim()) form.append('receiver_name', receiver.trim())
      if (note.trim()) form.append('note', note.trim())
      if (category) form.append('category', category)
      if (date) form.append('transaction_at', new Date(date).toISOString()) // เว้นว่าง → backend ใช้เวลาปัจจุบัน
      if (image) form.append('image', image) // รูปสินค้า (ไม่บังคับ) — backend เก็บ 3 วันแล้วลบอัตโนมัติ

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
      toast?.({ message: 'บันทึกรายการแล้ว', type: 'success' })
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
    <div className="flex-1 flex flex-col min-h-0">
      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* รูปสินค้า (ไม่บังคับ) — แนบเป็นหลักฐาน เก็บ 3 วันแล้วลบอัตโนมัติ */}
        <div>
          <span className="text-xs font-semibold text-muted-foreground">รูปสินค้า (ไม่บังคับ)</span>
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
          <p className="text-[11px] text-muted-foreground mt-1">เก็บไว้เป็นหลักฐาน 3 วัน แล้วลบรูปอัตโนมัติ (รายการยังอยู่)</p>
        </div>

        {/* ประเภท: รายรับ / รายจ่าย */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType('income')}
            className={`h-12 rounded-xl text-base font-semibold border transition-colors ${
              !isExpense ? 'bg-green-600 text-white border-green-600' : 'bg-card text-muted-foreground border-border'
            }`}
          >
            รายรับ
          </button>
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`h-12 rounded-xl text-base font-semibold border transition-colors ${
              isExpense ? 'bg-red-600 text-white border-red-600' : 'bg-card text-muted-foreground border-border'
            }`}
          >
            รายจ่าย
          </button>
        </div>

        {/* จำนวนเงิน */}
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">จำนวนเงิน (บาท)</span>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
            className="mt-1 w-full h-14 rounded-xl border border-input bg-background px-3 text-2xl font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {/* หมวดหมู่ลัด — เดาให้จากโน้ตอัตโนมัติ กดเปลี่ยนเองได้ */}
        <div>
          <span className="text-xs font-semibold text-muted-foreground">
            หมวดหมู่
            {autoGuessed && <span className="font-normal text-primary"> · เดาจากโน้ตให้แล้ว</span>}
          </span>
          <div className="flex flex-wrap gap-2 mt-2">
            {CATEGORIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => pickCategory(c)}
                className={`h-9 px-3 rounded-full text-sm font-medium border transition-colors ${
                  category === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {/* หรือพิมพ์หมวดเอง — เก็บเป็น free text ใช้ในรายงานได้เลย (ได้สี/อิโมจิ fallback อัตโนมัติ) */}
          <input
            type="text"
            value={category}
            onChange={(e) => { setCategoryTouched(true); setCategory(e.target.value) }}
            placeholder="หรือพิมพ์หมวดเอง เช่น ค่าการตลาด"
            className="mt-2 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <Field label="โน้ต (ค่าอะไร)" value={note} onChange={handleNoteChange} placeholder="เช่น หมู ไก่ ค่าไฟ ค่าส่ง" />

        <Field label="ผู้โอน / จาก" value={sender} onChange={setSender} />
        <Field label="ผู้รับ / ถึง" value={receiver} onChange={setReceiver} />

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
          ) : 'บันทึกรายการ'}
        </Button>
      </div>

      {/* อินพุตรูปซ่อนไว้ — ถ่ายจากกล้อง / เลือกจากคลัง */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.[0]) setImage(e.target.files[0]); e.target.value = '' }} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files?.[0]) setImage(e.target.files[0]); e.target.value = '' }} />
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}
