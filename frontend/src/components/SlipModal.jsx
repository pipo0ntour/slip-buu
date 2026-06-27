import { useEffect, useState } from 'react'
import { X, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet, apiPatchJson, apiDelete } from '@/lib/api'
import { CATEGORIES } from '@/components/TransactionForm'

// จำนวนวันที่เก็บรูปก่อนลบอัตโนมัติ — ตรงกับดีฟอลต์ IMAGE_RETENTION_DAYS ฝั่ง backend
const IMAGE_RETENTION_DAYS = 7

// แปลง ISO → ค่าสำหรับ <input type="datetime-local"> (ตามเวลาเครื่องผู้ใช้)
function toDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ชีตดูรายละเอียด/แก้ไข/ลบ รายการ 1 ใบ — ใช้ร่วมหน้ารายงานและหน้าค้นหา
// onSaved(updatedData) เรียกเมื่อแก้สำเร็จ, onDeleted(id) เมื่อลบสำเร็จ
export default function SlipModal({ slip, toast, onSaved, onDeleted, onClose }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // รูปสลิปขอแบบ lazy — ลิสต์ส่งมาแค่ has_image (ดู report.js) ค่อยขอ signed URL ตอนเปิดดู
  const [imageUrl, setImageUrl] = useState(slip.image_url || null)
  const [imageLoading, setImageLoading] = useState(false)

  useEffect(() => {
    if (imageUrl || !slip.has_image) return // มี URL แล้ว หรือรายการนี้ไม่มีรูป → ไม่ต้องขอ
    let alive = true
    setImageLoading(true)
    apiGet(`/api/slip/${slip.id}/image`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j?.url) setImageUrl(j.url) })
      .catch(() => {})
      .finally(() => { if (alive) setImageLoading(false) })
    return () => { alive = false }
  }, [slip.id])

  function startEdit() {
    setForm({
      amount: slip.amount ?? '',
      type: slip.type === 'expense' ? 'expense' : 'income',
      sender_name: slip.sender_name ?? '',
      receiver_name: slip.receiver_name ?? '',
      bank_name: slip.bank_name ?? '',
      reference_no: slip.reference_no ?? '',
      category: slip.category ?? '',
      note: slip.note ?? '',
      transaction_at: toDatetimeLocal(slip.transaction_at),
    })
    setEditing(true)
  }

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        amount: form.amount === '' ? null : Number(form.amount),
        type: form.type,
        sender_name: form.sender_name.trim() || null,
        receiver_name: form.receiver_name.trim() || null,
        bank_name: form.bank_name.trim() || null,
        reference_no: form.reference_no.trim() || null,
        category: form.category || null,
        note: form.note.trim() || null,
        transaction_at: form.transaction_at ? new Date(form.transaction_at).toISOString() : null,
      }
      const res = await apiPatchJson(`/api/slip/${slip.id}`, payload)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'แก้ไขไม่สำเร็จ')
      onSaved?.(json.data)
      toast?.({ message: 'แก้ไขข้อมูลสำเร็จ', type: 'success' })
      setEditing(false)
    } catch (e) {
      toast?.({ message: e.message || 'แก้ไขไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await apiDelete(`/api/slip/${slip.id}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'ลบไม่สำเร็จ')
      toast?.({ message: 'ลบรายการแล้ว', type: 'success' })
      onDeleted?.(slip.id)
    } catch (e) {
      toast?.({ message: e.message || 'ลบไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
      setDeleting(false)
    }
  }

  const dateText = slip.transaction_at
    ? new Date(slip.transaction_at).toLocaleString('th-TH', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '-'
  const isExpense = slip.type === 'expense'

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center animate-fade-in"
      onClick={saving || deleting ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* ขีดจับ — บอกว่าเป็นแผ่นที่เลื่อนขึ้นมา ปิดได้ */}
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 border-b border-border">
          <div className="min-w-0">
            <p className="font-bold truncate">
              {editing ? 'แก้ไขรายละเอียด' : slip.sender_name || slip.category || slip.note || 'ไม่ระบุชื่อ'}
            </p>
            {!editing && (
              <p className="text-sm truncate">
                <span className={isExpense ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                  {isExpense ? 'รายจ่าย' : 'รายรับ'}
                </span>
                <span className="text-muted-foreground">
                  {' · '}{slip.bank_name || (slip.source === 'manual' ? 'สร้างเอง' : '-')}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {editing ? (
            <div className="space-y-3">
              {/* ประเภท: รายรับ / รายจ่าย */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setField('type', 'income')}
                  className={`h-11 rounded-xl text-sm font-semibold border transition-colors ${form.type !== 'expense' ? 'bg-green-600 text-white border-green-600' : 'bg-card text-muted-foreground border-border'}`}
                >
                  รายรับ
                </button>
                <button
                  type="button"
                  onClick={() => setField('type', 'expense')}
                  className={`h-11 rounded-xl text-sm font-semibold border transition-colors ${form.type === 'expense' ? 'bg-red-600 text-white border-red-600' : 'bg-card text-muted-foreground border-border'}`}
                >
                  รายจ่าย
                </button>
              </div>

              <Field label="จำนวนเงิน (บาท)" type="number" inputMode="decimal" value={form.amount} onChange={v => setField('amount', v)} />

              {/* หมวดหมู่ลัด */}
              <div>
                <span className="text-xs font-semibold text-muted-foreground">หมวดหมู่</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setField('category', form.category === c ? '' : c)}
                      className={`h-9 px-3 rounded-full text-sm font-medium border transition-colors ${form.category === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {/* หรือพิมพ์หมวดเอง — เก็บเป็น free text */}
                <input
                  type="text"
                  value={form.category}
                  onChange={e => setField('category', e.target.value)}
                  placeholder="หรือพิมพ์หมวดเอง เช่น ค่าการตลาด"
                  className="mt-2 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <Field label="โน้ต (ค่าอะไร)" value={form.note} onChange={v => setField('note', v)} />
              <Field label="ผู้โอน" value={form.sender_name} onChange={v => setField('sender_name', v)} />
              <Field label="ผู้รับ" value={form.receiver_name} onChange={v => setField('receiver_name', v)} />
              <Field label="ธนาคาร" value={form.bank_name} onChange={v => setField('bank_name', v)} />
              <Field label="เลขอ้างอิง" value={form.reference_no} onChange={v => setField('reference_no', v)} />
              <Field label="วันที่ทำรายการ" type="datetime-local" value={form.transaction_at} onChange={v => setField('transaction_at', v)} />
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                <DetailRow
                  label="จำนวนเงิน"
                  big
                  value={`${isExpense ? '-' : '+'}${Number(slip.amount || 0).toLocaleString('th-TH')} บาท`}
                  valueClass={isExpense ? 'text-red-600' : 'text-green-600'}
                />
                <DetailRow label="ประเภท" value={isExpense ? 'รายจ่าย' : 'รายรับ'} />
                {slip.category && <DetailRow label="หมวดหมู่" value={slip.category} />}
                {slip.note && <DetailRow label="โน้ต" value={slip.note} />}
                <DetailRow label="ผู้โอน" value={slip.sender_name} />
                <DetailRow label="ผู้รับ" value={slip.receiver_name} />
                <DetailRow label="ธนาคาร" value={slip.bank_name} />
                <DetailRow label="เลขอ้างอิง" value={slip.reference_no} />
                {slip.sender_account && <DetailRow label="บัญชีผู้โอน" value={slip.sender_account} />}
                {slip.receiver_account && <DetailRow label="บัญชีผู้รับ" value={slip.receiver_account} />}
                {slip.fee != null && Number(slip.fee) > 0 && (
                  <DetailRow label="ค่าธรรมเนียม" value={`${Number(slip.fee).toLocaleString('th-TH')} บาท`} />
                )}
                <DetailRow label="วันที่ทำรายการ" value={dateText} />
              </div>

              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="สลิป"
                  className="mt-4 w-full rounded-2xl object-contain max-h-[50vh] border border-border"
                />
              ) : (slip.has_image && imageLoading) ? (
                <div className="mt-4 w-full h-48 rounded-2xl border border-border bg-muted animate-pulse" />
              ) : slip.image_purged_at ? (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  <Trash2 className="size-4 mt-0.5 shrink-0" />
                  <span>รูปสลิปถูกลบอัตโนมัติแล้ว (เก็บเกิน {IMAGE_RETENTION_DAYS} วัน) — ข้อมูลรายการยังอยู่ครบ</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 pb-6 flex gap-3">
          {editing ? (
            <>
              <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => setEditing(false)} disabled={saving}>
                ยกเลิก
              </Button>
              <Button className="flex-1 h-12 rounded-2xl" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <><span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> กำลังบันทึก...</>
                ) : 'บันทึก'}
              </Button>
            </>
          ) : confirmDelete ? (
            <>
              <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                ยกเลิก
              </Button>
              <Button
                className="flex-1 h-12 rounded-2xl bg-red-600 text-white hover:bg-red-600"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> กำลังลบ...</>
                ) : 'ยืนยันลบ'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={startEdit}>
                <Pencil className="size-4" /> แก้ไข
              </Button>
              <Button
                variant="outline"
                className="h-12 px-4 rounded-2xl text-red-600"
                onClick={() => setConfirmDelete(true)}
                aria-label="ลบรายการ"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, big, valueClass }) {
  return (
    <div className="flex justify-between items-start gap-4 py-3">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={`font-semibold text-right break-words ${big ? 'text-lg' : 'text-sm'} ${valueClass || 'text-foreground'}`}>
        {value || '-'}
      </span>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', inputMode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}
