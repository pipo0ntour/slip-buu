import { useRef, useState } from 'react'
import { X, Camera, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPostForm, apiPostJson } from '@/lib/api'
import ItemsReview, { ItemsReviewFooter, validItemsOf } from '@/components/ItemsReview'

// ถ่ายรูปโน้ตที่จดเอง → AI แตกเป็นรายการ → ทวน/แก้ → บันทึกทีเดียวหลายรายการ
// phase: 'capture' (เลือกรูป) → 'scanning' (กำลังอ่าน) → 'review' (ทวน/แก้)
export default function NoteScan({ toast, onSaved, onClose }) {
  const [phase, setPhase] = useState('capture')
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  async function scan(file) {
    setPhase('scanning')
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await apiPostForm('/api/slip/note-scan', form)
      if (res.status === 401) {
        toast?.({ message: 'เซสชันหมดอายุ กรุณาเปิดใหม่ผ่านเมนูใน LINE', type: 'error' })
        onClose?.()
        return
      }
      if (res.status === 429) {
        toast?.({ message: 'คิวอ่านโน้ตเต็มชั่วคราว กรุณารอสักครู่', type: 'warning' })
        setPhase('capture')
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'อ่านโน้ตไม่สำเร็จ')

      const list = (json.items || []).map(it => ({
        description: it.description || '',
        amount: String(it.amount ?? ''),
        type: it.type === 'income' ? 'income' : 'expense',
      }))
      if (!list.length) toast?.({ message: json.message || 'อ่านไม่พบรายการในโน้ต ลองเพิ่มเอง', type: 'warning' })
      // ไม่พบรายการก็ให้แถวว่าง 1 แถวไว้กรอกเอง
      setItems(list.length ? list : [{ description: '', amount: '', type: 'expense' }])
      setPhase('review')
    } catch (e) {
      toast?.({ message: e.message || 'อ่านโน้ตไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
      setPhase('capture')
    }
  }

  function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // เคลียร์เพื่อให้เลือกไฟล์เดิมซ้ำได้
    if (file) scan(file)
  }

  async function save() {
    const validItems = validItemsOf(items)
    if (!validItems.length || saving) return
    setSaving(true)
    try {
      const payload = {
        items: validItems.map(it => ({
          description: it.description.trim() || null,
          amount: Number(it.amount),
          type: it.type,
        })),
      }
      const res = await apiPostJson('/api/slip/note-save', payload)
      if (res.status === 401) {
        toast?.({ message: 'เซสชันหมดอายุ กรุณาเปิดใหม่ผ่านเมนูใน LINE', type: 'error' })
        return
      }
      if (res.status === 429) {
        toast?.({ message: 'ทำรายการถี่เกินไป กรุณารอสักครู่', type: 'warning' })
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'บันทึกไม่สำเร็จ')
      toast?.({ message: json.message || 'บันทึกรายการแล้ว', type: 'success' })
      onSaved?.(json.data || [])
      onClose?.()
    } catch (e) {
      toast?.({ message: e.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center animate-fade-in"
      onClick={saving || phase === 'scanning' ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 border-b border-border">
          <p className="font-bold text-lg">ถ่ายโน้ต → สรุปรายการ</p>
          <button
            onClick={onClose}
            disabled={saving || phase === 'scanning'}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {phase === 'capture' && (
            <div className="py-6">
              <p className="text-sm text-muted-foreground text-center mb-5">
                ถ่ายรูปโน้ตรายรับ/รายจ่ายที่จดไว้ ระบบจะอ่านแล้วแตกเป็นรายการให้ทวนก่อนบันทึก
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button className="h-12 rounded-xl" onClick={() => cameraRef.current?.click()}>
                  <Camera className="size-4" /> ถ่ายรูป
                </Button>
                <Button variant="outline" className="h-12 rounded-xl" onClick={() => galleryRef.current?.click()}>
                  <ImagePlus className="size-4" /> เลือกรูป
                </Button>
              </div>
            </div>
          )}

          {phase === 'scanning' && (
            <div className="py-16 flex flex-col items-center gap-4 text-muted-foreground">
              <span className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">กำลังอ่านโน้ต...</p>
            </div>
          )}

          {phase === 'review' && <ItemsReview items={items} setItems={setItems} />}
        </div>

        {/* Footer */}
        {phase === 'review' && <ItemsReviewFooter items={items} saving={saving} onSave={save} />}

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
        <input ref={galleryRef} type="file" accept="image/*" onChange={pick} className="hidden" />
      </div>
    </div>
  )
}
