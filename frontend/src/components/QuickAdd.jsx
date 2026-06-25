import { useState } from 'react'
import { Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPostJson } from '@/lib/api'
import ItemsReview, { ItemsReviewFooter, validItemsOf } from '@/components/ItemsReview'
import { guessCategory } from '@/lib/categorize'

// โหมด "พิมพ์/พูด" — พิมพ์เองหรือกดไมค์บนแป้นพิมพ์พูด → AI แตกเป็นรายการ → ทวน/แก้ → บันทึก
// phase: 'input' (พิมพ์) → 'scanning' (กำลังแปลง) → 'review' (ทวน/แก้) — review/save ใช้ component ร่วมกับถ่ายโน้ต
export default function QuickAdd({ toast, onSaved, onClose }) {
  const [phase, setPhase] = useState('input')
  const [text, setText] = useState('')
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  async function parse() {
    const t = text.trim()
    if (!t) return
    setPhase('scanning')
    try {
      const res = await apiPostJson('/api/slip/note-parse-text', { text: t })
      if (res.status === 401) {
        toast?.({ message: 'เซสชันหมดอายุ กรุณาเปิดใหม่ผ่านเมนูใน LINE', type: 'error' })
        onClose?.()
        return
      }
      if (res.status === 429) {
        toast?.({ message: 'คิวประมวลผลเต็มชั่วคราว กรุณารอสักครู่', type: 'warning' })
        setPhase('input')
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'แปลงข้อความไม่สำเร็จ')

      const list = (json.items || []).map(it => ({
        description: it.description || '',
        amount: String(it.amount ?? ''),
        type: it.type === 'income' ? 'income' : 'expense',
        category: guessCategory(it.description) || '', // เดาหมวดให้ตั้งแต่แรก แก้ได้ในหน้าทวน
      }))
      if (!list.length) toast?.({ message: json.message || 'ไม่พบรายการ ลองพิมพ์ใหม่หรือเพิ่มเอง', type: 'warning' })
      // ไม่พบรายการก็ให้แถวว่าง 1 แถวไว้กรอกเอง
      setItems(list.length ? list : [{ description: '', amount: '', type: 'expense' }])
      setPhase('review')
    } catch (e) {
      toast?.({ message: e.message || 'แปลงข้อความไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
      setPhase('input')
    }
  }

  async function save() {
    const valid = validItemsOf(items)
    if (!valid.length || saving) return
    setSaving(true)
    try {
      const payload = {
        items: valid.map(it => ({
          description: it.description.trim() || null,
          amount: Number(it.amount),
          type: it.type,
          category: it.category || null,
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
    <div className="flex-1 flex flex-col min-h-0">
      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {phase === 'input' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              พิมพ์ หรือกดไมค์ <Mic className="inline size-4 align-text-bottom" /> บนแป้นพิมพ์เพื่อพูด
              ระบบจะแตกเป็นรายการให้ทวนก่อนบันทึก
            </p>
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              rows={5}
              placeholder={'เช่น เช้านี้จ่ายค่าข้าว 50 ซื้อกาแฟ 45 ได้เงินจากลูกค้า 200'}
              className="w-full rounded-xl border border-input bg-background p-3 text-base text-foreground resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}

        {phase === 'scanning' && (
          <div className="py-16 flex flex-col items-center gap-4 text-muted-foreground">
            <span className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">กำลังแปลงข้อความ...</p>
          </div>
        )}

        {phase === 'review' && <ItemsReview items={items} setItems={setItems} />}
      </div>

      {/* Footer */}
      {phase === 'input' && (
        <div className="border-t border-border px-5 py-3 pb-6">
          <Button size="xl" className="w-full rounded-2xl" onClick={parse} disabled={!text.trim()}>
            แปลงเป็นรายการ
          </Button>
        </div>
      )}
      {phase === 'review' && <ItemsReviewFooter items={items} saving={saving} onSave={save} />}
    </div>
  )
}
