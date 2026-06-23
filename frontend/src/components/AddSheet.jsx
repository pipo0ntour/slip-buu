import { useState } from 'react'
import { X, Mic, Pencil } from 'lucide-react'
import QuickAdd from '@/components/QuickAdd'
import { ManualForm } from '@/components/TransactionForm'

// ชีต "เพิ่มรายการ" — 2 โหมดในชีตเดียว:
//   พิมพ์/พูด (default, เร็ว, ได้หลายรายการ) | กรอกละเอียด (ฟอร์มเดิม, รายการเดียว ครบฟิลด์)
// onMultiSaved = callback ตอนบันทึกจากพิมพ์/พูด (array), onManualSaved = ตอนบันทึกจากฟอร์ม (object เดียว)
export default function AddSheet({ toast, onManualSaved, onMultiSaved, onClose }) {
  const [tab, setTab] = useState('text') // 'text' = พิมพ์/พูด, 'form' = กรอกละเอียด

  const tabClass = (key) =>
    `flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
      tab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
    }`

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* ขีดจับ */}
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3">
          <p className="font-bold text-lg">เพิ่มรายการ</p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* แท็บเลือกโหมด */}
        <div className="px-5 pb-3 shrink-0">
          <div className="flex p-1 rounded-xl border border-border bg-muted/40">
            <button type="button" onClick={() => setTab('text')} className={tabClass('text')}>
              <Mic className="size-4" /> พิมพ์/พูด
            </button>
            <button type="button" onClick={() => setTab('form')} className={tabClass('form')}>
              <Pencil className="size-4" /> กรอกละเอียด
            </button>
          </div>
        </div>

        {/* เนื้อหาตามโหมด — แต่ละตัวจัดการ body(scroll)+footer ของตัวเอง */}
        {tab === 'text' ? (
          <QuickAdd toast={toast} onSaved={onMultiSaved} onClose={onClose} />
        ) : (
          <ManualForm toast={toast} onSaved={onManualSaved} onClose={onClose} />
        )}
      </div>
    </div>
  )
}
