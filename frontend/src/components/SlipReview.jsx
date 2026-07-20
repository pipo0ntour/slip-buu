import { useState } from 'react'
import { X, Trash2, ChevronDown, Receipt, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPostForm } from '@/lib/api'
import { CATEGORIES } from '@/components/TransactionForm'

// หน้าทวนผลลัพธ์ OCR สลิป/ใบเสร็จ ก่อนบันทึก — คู่กับ backend scan-batch → scan-save
// initialItems: [{ file, imageUrl, data }] (data = ฟิลด์ที่ OCR อ่านได้จาก /api/slip/scan-batch)
// onSaved(results) เรียกเมื่อบันทึกเสร็จ (ส่ง results ไปแสดงใน "ผลล่าสุด"), onClose ปิดชีต

// แปลง ISO → ค่าสำหรับ <input type="datetime-local"> ตามเวลาเครื่องผู้ใช้ (เหมือน SlipModal)
function toDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// เอา data ที่ OCR อ่านได้ มาแบนเป็น item ที่แก้ได้ในฟอร์ม (เก็บ file/imageUrl/docKind/qrRef ไว้ใช้ตอนบันทึก)
function toEditable({ file, imageUrl, data }) {
  return {
    file,
    imageUrl,
    docKind: data.docKind === 'receipt' ? 'receipt' : 'slip',
    qrRef: data.qrRef || null,
    type: data.type === 'expense' ? 'expense' : 'income',
    amount: data.amount == null ? '' : String(data.amount),
    transaction_at: toDatetimeLocal(data.transaction_at),
    category: data.category || '',
    note: data.note || '',
    sender_name: data.sender_name || '',
    receiver_name: data.receiver_name || '',
    bank_name: data.bank_name || '',
    reference_no: data.reference_no || '',
    fee: data.fee == null ? '' : String(data.fee),
    // เก็บไว้ส่งกลับเฉย ๆ ไม่ต้องแก้ในฟอร์ม (เลขบัญชี OCR อ่านมา)
    sender_account: data.sender_account || '',
    receiver_account: data.receiver_account || '',
  }
}

const validItemsOf = (items) => items.filter((it) => Number(it.amount) > 0)

export default function SlipReview({ initialItems, toast, onSaved, onClose }) {
  const [items, setItems] = useState(() => initialItems.map(toEditable))
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(null) // รูปที่กดขยายดูเต็มจอ (ทวนกับภาพจริง)

  const setField = (i, key, value) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)))
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i))

  const valid = validItemsOf(items)
  const net = valid.reduce((s, it) => s + Number(it.amount) * (it.type === 'expense' ? -1 : 1), 0)

  async function save() {
    if (!valid.length || saving) return
    setSaving(true)
    try {
      const form = new FormData()
      const meta = valid.map((it) => {
        form.append('images', it.file) // ลำดับ images ต้องตรงกับ meta
        return {
          docKind: it.docKind,
          qrRef: it.qrRef,
          type: it.type,
          amount: Number(it.amount),
          transaction_at: it.transaction_at ? new Date(it.transaction_at).toISOString() : null,
          category: it.category.trim() || null,
          note: it.note.trim() || null,
          sender_name: it.sender_name.trim() || null,
          receiver_name: it.receiver_name.trim() || null,
          bank_name: it.bank_name.trim() || null,
          reference_no: it.reference_no.trim() || null,
          fee: it.fee === '' ? null : Number(it.fee),
          sender_account: it.sender_account.trim() || null,
          receiver_account: it.receiver_account.trim() || null,
        }
      })
      form.append('items', JSON.stringify(meta))

      const res = await apiPostForm('/api/slip/scan-save', form)
      if (res.status === 401) {
        toast?.({ message: 'เซสชันหมดอายุ กรุณาเปิดใหม่ผ่านเมนูใน LINE', type: 'error' })
        return
      }
      if (res.status === 429) {
        toast?.({ message: 'ทำรายการถี่เกินไป กรุณารอสักครู่', type: 'warning' })
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || 'บันทึกไม่สำเร็จ')

      // ผล backend เรียงตรงกับ valid ที่ส่งไป — แนบรูปย่อกลับให้ "ผลล่าสุด" โชว์ thumbnail ได้เหมือนเดิม
      const results = (json.results || []).map((r, idx) => ({ ...r, imageUrl: valid[idx]?.imageUrl }))
      const ok = results.filter((r) => r.status === 'success').length
      const fail = results.length - ok
      toast?.({
        message: fail === 0 ? `บันทึกสำเร็จ ${ok} รายการ` : `สำเร็จ ${ok} · ซ้ำ/ผิดพลาด ${fail}`,
        type: fail === 0 ? 'success' : 'warning',
      })
      onSaved?.(results)
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
      onClick={saving ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 border-b border-border">
          <div className="min-w-0">
            <p className="font-bold text-lg leading-tight">ทวนผลลัพธ์ก่อนบันทึก</p>
            <p className="text-xs text-muted-foreground">ตรวจ/แก้ให้ตรงกับสลิป แล้วกดบันทึก</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <datalist id="slipreview-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              ไม่มีรายการให้บันทึกแล้ว — ปิดหน้านี้เพื่อถ่ายใหม่
            </p>
          ) : (
            items.map((it, i) => (
              <SlipCard
                key={i}
                item={it}
                canRemove={items.length > 1}
                onField={(key, value) => setField(i, key, value)}
                onRemove={() => removeItem(i)}
                onZoom={() => it.imageUrl && setZoom(it.imageUrl)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 pb-6">
          {net !== 0 && (
            <p className="text-sm text-center mb-2">
              ยอดสุทธิ{' '}
              <span className={`font-bold ${net < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {net.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
              </span>
            </p>
          )}
          <Button size="xl" className="w-full rounded-2xl" onClick={save} disabled={!valid.length || saving}>
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />{' '}
                กำลังบันทึก...
              </>
            ) : (
              `บันทึก ${valid.length} รายการ`
            )}
          </Button>
        </div>
      </div>

      {/* ดูรูปเต็มจอ — กดที่ไหนก็ได้เพื่อปิด */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fade-in"
          onClick={(e) => {
            e.stopPropagation()
            setZoom(null)
          }}
        >
          <img src={zoom} alt="สลิป" className="max-w-full max-h-full rounded-2xl object-contain" />
        </div>
      )}
    </div>
  )
}

function SlipCard({ item, canRemove, onField, onRemove, onZoom }) {
  const [showMore, setShowMore] = useState(false)
  const isExpense = item.type === 'expense'
  const isReceipt = item.docKind === 'receipt'

  return (
    <div className="rounded-2xl border border-border p-3 space-y-2.5">
      {/* หัวการ์ด: รูปย่อ (กดขยาย) + ชนิดเอกสาร + ปุ่มลบ */}
      <div className="flex items-center gap-2.5">
        {item.imageUrl && (
          <button
            type="button"
            onClick={onZoom}
            className="w-12 h-12 rounded-lg overflow-hidden border border-border shrink-0"
            aria-label="ดูรูปเต็ม"
          >
            <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
          </button>
        )}
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {isReceipt ? <Receipt className="size-4" /> : <Banknote className="size-4" />}
          {isReceipt ? 'ใบเสร็จ/ตั๋ว' : 'สลิปโอนเงิน'}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground"
            aria-label="ลบใบนี้"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {/* ประเภท + ยอดเงิน (แถวเด่น) */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
          <button
            type="button"
            onClick={() => onField('type', 'income')}
            className={`h-11 px-3 text-sm font-semibold ${!isExpense ? 'bg-green-600 text-white' : 'bg-card text-muted-foreground'}`}
          >
            รับ
          </button>
          <button
            type="button"
            onClick={() => onField('type', 'expense')}
            className={`h-11 px-3 text-sm font-semibold ${isExpense ? 'bg-red-600 text-white' : 'bg-card text-muted-foreground'}`}
          >
            จ่าย
          </button>
        </div>
        <input
          type="number"
          inputMode="decimal"
          value={item.amount}
          onChange={(e) => onField('amount', e.target.value)}
          placeholder="0.00"
          className="flex-1 min-w-0 h-11 rounded-lg border border-input bg-background px-3 text-right text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-sm text-muted-foreground shrink-0">บาท</span>
      </div>

      <CardField label="วันที่ทำรายการ" type="datetime-local" value={item.transaction_at} onChange={(v) => onField('transaction_at', v)} />

      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">หมวดหมู่</span>
        <input
          list="slipreview-categories"
          value={item.category}
          onChange={(e) => onField('category', e.target.value)}
          placeholder="เลือกหรือพิมพ์เอง"
          className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <CardField label={isReceipt ? 'รายละเอียด (สินค้า/บริการ)' : 'โน้ต (ค่าอะไร)'} value={item.note} onChange={(v) => onField('note', v)} />

      {/* รายละเอียดเพิ่มเติม — พับไว้กันการ์ดยาว: สลิปมีผู้โอน/ผู้รับ/ธนาคาร/เลขอ้างอิง/ค่าธรรมเนียม, ใบเสร็จมีแค่ชื่อร้าน/เลขที่ */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-primary"
      >
        <ChevronDown className={`size-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
        {showMore ? 'ซ่อนรายละเอียด' : 'รายละเอียดเพิ่มเติม'}
      </button>

      {showMore && (
        <div className="space-y-2.5 pt-0.5">
          {isReceipt ? (
            <>
              <CardField label="ร้าน / ผู้ให้บริการ" value={item.receiver_name} onChange={(v) => onField('receiver_name', v)} />
              <CardField label="เลขที่ใบเสร็จ" value={item.reference_no} onChange={(v) => onField('reference_no', v)} />
            </>
          ) : (
            <>
              <CardField label="ผู้โอน" value={item.sender_name} onChange={(v) => onField('sender_name', v)} />
              <CardField label="ผู้รับ" value={item.receiver_name} onChange={(v) => onField('receiver_name', v)} />
              <CardField label="ธนาคาร" value={item.bank_name} onChange={(v) => onField('bank_name', v)} />
              <CardField label="เลขอ้างอิง" value={item.reference_no} onChange={(v) => onField('reference_no', v)} />
              <CardField label="ค่าธรรมเนียม (บาท)" type="number" inputMode="decimal" value={item.fee} onChange={(v) => onField('fee', v)} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CardField({ label, value, onChange, type = 'text', inputMode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}
