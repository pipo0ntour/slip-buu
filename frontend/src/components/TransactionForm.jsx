import { useRef, useState } from 'react'
import { X, Camera, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPostForm } from '@/lib/api'

// หมวดหมู่ลัด — ปรับ/เพิ่มได้ตามร้าน (ใช้ร่วมกับ note quick-pick ในหน้า Report)
export const CATEGORIES = ['ค่าของ', 'ค่าส่ง', 'ค่าอาหาร', 'ค่าน้ำค่าไฟ', 'เงินเดือน', 'อื่นๆ']

// ── ฟอร์มกรอกรายการละเอียด (1 รายการ) — body+footer ไม่มี chrome ของชีต ──
// ใช้เป็นแท็บ "กรอกละเอียด" ใน AddSheet หรือใช้เดี่ยวผ่าน <TransactionForm/> (มี chrome ครบ)
export function ManualForm({ toast, onSaved, onClose }) {
  const [type, setType] = useState('income') // 'income' | 'expense'
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [sender, setSender] = useState('')
  const [receiver, setReceiver] = useState('')
  const [date, setDate] = useState('')
  const [image, setImage] = useState(null) // { file, url } รูปสินค้า/หลักฐานแนบ (ไม่บังคับ)
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const amountNum = Number(amount)
  const canSave = Number.isFinite(amountNum) && amountNum > 0 && !saving

  function pickImage(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // เคลียร์ค่า input เพื่อให้เลือกไฟล์เดิมซ้ำได้
    if (!file) return
    setImage(prev => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return { file, url: URL.createObjectURL(file) }
    })
  }

  function removeImage() {
    setImage(prev => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return null
    })
  }

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
      if (image?.file) form.append('image', image.file)

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
      if (image?.url) URL.revokeObjectURL(image.url)
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

        {/* หมวดหมู่ลัด */}
        <div>
          <span className="text-xs font-semibold text-muted-foreground">หมวดหมู่</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {CATEGORIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(prev => (prev === c ? '' : c))}
                className={`h-9 px-3 rounded-full text-sm font-medium border transition-colors ${
                  category === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <Field label="โน้ต (ค่าอะไร)" value={note} onChange={setNote} placeholder="เช่น ค่าเครื่องดื่มร้านกาแฟ" />

        {/* รูปสินค้า/หลักฐาน (ไม่บังคับ) — ถ่ายรูปของที่ซื้อไว้แนบกับรายการได้ */}
        <div>
          <span className="text-xs font-semibold text-muted-foreground">รูปสินค้า/หลักฐาน (ไม่บังคับ)</span>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={pickImage} className="hidden" />
          <input ref={galleryRef} type="file" accept="image/*" onChange={pickImage} className="hidden" />
          {image ? (
            <div className="mt-2 relative w-28 h-28">
              <img src={image.url} alt="รูปแนบ" className="w-full h-full object-cover rounded-xl border border-border" />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center shadow"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex-1 h-12 rounded-xl border border-border bg-card flex items-center justify-center gap-2 text-sm font-medium text-foreground"
              >
                <Camera className="size-4" /> ถ่ายรูป
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex-1 h-12 rounded-xl border border-border bg-card flex items-center justify-center gap-2 text-sm font-medium text-foreground"
              >
                <ImagePlus className="size-4" /> เลือกรูป
              </button>
            </div>
          )}
        </div>

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
