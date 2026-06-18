import { useRef, useState } from 'react'
import { X, Camera, ImagePlus, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPostForm, apiPostJson } from '@/lib/api'

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

  const updateItem = (i, patch) => setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const addItem = () => setItems(prev => [...prev, { description: '', amount: '', type: 'expense' }])

  const validItems = items.filter(it => Number(it.amount) > 0)
  const canSave = validItems.length > 0 && !saving
  // ยอดสุทธิ: รายรับบวก รายจ่ายลบ
  const net = validItems.reduce((s, it) => s + Number(it.amount) * (it.type === 'expense' ? -1 : 1), 0)

  async function save() {
    if (!canSave) return
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

          {phase === 'review' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">ทวน/แก้รายการ แล้วกดบันทึก ({validItems.length} รายการ)</p>
              {items.map((it, i) => {
                const isExpense = it.type === 'expense'
                return (
                  <div key={i} className="rounded-2xl border border-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={it.description}
                        onChange={e => updateItem(i, { description: e.target.value })}
                        placeholder="รายละเอียด (เช่น ค่าข้าว)"
                        className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
                        <button
                          type="button"
                          onClick={() => updateItem(i, { type: 'income' })}
                          className={`h-10 px-3 text-sm font-semibold ${!isExpense ? 'bg-green-600 text-white' : 'bg-card text-muted-foreground'}`}
                        >
                          รับ
                        </button>
                        <button
                          type="button"
                          onClick={() => updateItem(i, { type: 'expense' })}
                          className={`h-10 px-3 text-sm font-semibold ${isExpense ? 'bg-red-600 text-white' : 'bg-card text-muted-foreground'}`}
                        >
                          จ่าย
                        </button>
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={it.amount}
                        onChange={e => updateItem(i, { amount: e.target.value })}
                        placeholder="0.00"
                        className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-right text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <span className="text-sm text-muted-foreground shrink-0">บาท</span>
                    </div>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={addItem}
                className="w-full h-11 rounded-xl border border-dashed border-border flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <Plus className="size-4" /> เพิ่มรายการ
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'review' && (
          <div className="border-t border-border px-5 py-3 pb-6">
            {net !== 0 && (
              <p className="text-sm text-center mb-2">
                ยอดสุทธิ{' '}
                <span className={`font-bold ${net < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {net.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                </span>
              </p>
            )}
            <Button size="xl" className="w-full rounded-2xl" onClick={save} disabled={!canSave}>
              {saving ? (
                <><span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> กำลังบันทึก...</>
              ) : (
                `บันทึก ${validItems.length} รายการ`
              )}
            </Button>
          </div>
        )}

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
        <input ref={galleryRef} type="file" accept="image/*" onChange={pick} className="hidden" />
      </div>
    </div>
  )
}
