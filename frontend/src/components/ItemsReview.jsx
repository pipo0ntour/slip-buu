import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

// รายการที่ AI แตกออกมา (จากถ่ายโน้ต หรือ พิมพ์/พูด) — แก้/ลบ/เพิ่มได้ก่อนบันทึก
// แยกเป็น component กลาง: body (ItemsReview) + footer ยอดสุทธิ/ปุ่มบันทึก (ItemsReviewFooter)

// แถวที่ยอดเงินถูกต้อง (> 0) เท่านั้นที่นับ/บันทึก
export function validItemsOf(items) {
  return items.filter((it) => Number(it.amount) > 0)
}

// ยอดสุทธิ: รายรับบวก รายจ่ายลบ
export function netOf(items) {
  return validItemsOf(items).reduce((s, it) => s + Number(it.amount) * (it.type === 'expense' ? -1 : 1), 0)
}

// ── body: ลิสต์รายการแก้ได้ + ปุ่มเพิ่มรายการ ──
export default function ItemsReview({ items, setItems }) {
  const updateItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i))
  const addItem = () => setItems((prev) => [...prev, { description: '', amount: '', type: 'expense' }])
  const validCount = validItemsOf(items).length

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">ทวน/แก้รายการ แล้วกดบันทึก ({validCount} รายการ)</p>
      {items.map((it, i) => {
        const isExpense = it.type === 'expense'
        return (
          <div key={i} className="rounded-2xl border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={it.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
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
                onChange={(e) => updateItem(i, { amount: e.target.value })}
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
  )
}

// ── footer: ยอดสุทธิ + ปุ่มบันทึก (sticky ใต้ชีต) ──
export function ItemsReviewFooter({ items, saving, onSave }) {
  const valid = validItemsOf(items)
  const net = netOf(items)
  const canSave = valid.length > 0 && !saving

  return (
    <div className="border-t border-border px-5 py-3 pb-6">
      {net !== 0 && (
        <p className="text-sm text-center mb-2">
          ยอดสุทธิ{' '}
          <span className={`font-bold ${net < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {net.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
          </span>
        </p>
      )}
      <Button size="xl" className="w-full rounded-2xl" onClick={onSave} disabled={!canSave}>
        {saving ? (
          <><span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> กำลังบันทึก...</>
        ) : (
          `บันทึก ${valid.length} รายการ`
        )}
      </Button>
    </div>
  )
}
