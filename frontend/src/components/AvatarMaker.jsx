import { useRef, useState } from 'react'
import { X, Camera, ImagePlus, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPostForm } from '@/lib/api'
import { avatarDataUri, PRESET_FACES } from '@/lib/avatar'
import { saveAvatarFace, clearAvatarFace } from '@/lib/avatarStore'

// จำนวนลุคให้เลือกในตาราง (variant 0..N-1) — โชว์พร้อมกัน แตะเลือกได้เลย
const VARIANTS = [0, 1, 2, 3, 4, 5]

// ถ่ายเซลฟี่ → AI อ่านลักษณะใบหน้า → ประกอบเป็นอวตารการ์ตูน (DiceBear) → เก็บไว้ใช้เป็นรูปโปรไฟล์
// phase: 'capture' (เลือกรูป) → 'scanning' (กำลังอ่าน) → 'preview' (ดูผล/ใช้/ถ่ายใหม่)
// รูปต้นฉบับไม่ถูกเก็บที่ server — อ่านลักษณะเสร็จทิ้งทันที (เก็บแค่ "ลักษณะ" ในเครื่อง)
export default function AvatarMaker({ toast, hasAvatar, onSaved, onClose, initialFace = null }) {
  // มีอวตารอยู่แล้ว → เปิดที่หน้า "เลือกลุค" ทันที (ไม่ต้องถ่ายใหม่) · ยังไม่มี → เริ่มที่หน้าถ่ายรูป
  const [phase, setPhase] = useState(initialFace ? 'preview' : 'capture')
  const [face, setFace] = useState(initialFace)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  async function analyze(file) {
    setPhase('scanning')
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await apiPostForm('/api/avatar/analyze', form)
      if (res.status === 401) {
        toast?.({ message: 'เซสชันหมดอายุ กรุณาเปิดใหม่ผ่านเมนูใน LINE', type: 'error' })
        onClose?.()
        return
      }
      if (res.status === 429) {
        toast?.({ message: 'คิว AI เต็มชั่วคราว กรุณารอสักครู่', type: 'warning' })
        setPhase('capture')
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'สร้างอวตารไม่สำเร็จ')
      setFace(json.face)
      setPhase('preview')
    } catch (e) {
      toast?.({ message: e.message || 'สร้างอวตารไม่สำเร็จ กรุณาลองใหม่', type: 'error' })
      setPhase('capture')
    }
  }

  function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // เคลียร์เพื่อให้เลือกไฟล์เดิมซ้ำได้
    if (file) analyze(file)
  }

  function useThis() {
    saveAvatarFace(face)
    toast?.({ message: 'ตั้งเป็นรูปโปรไฟล์แล้ว', type: 'success' })
    onSaved?.(face)
    onClose?.()
  }

  // เลือกลุค — สลับ "ของนอกหน้า" (พื้นหลัง/เสื้อ/สีเสื้อ/คิ้ว) โดยคงหน้าเดิม ไม่ต้องถ่ายใหม่
  function selectVariant(v) {
    setFace((f) => (f ? { ...f, variant: v } : f))
  }

  function removeAvatar() {
    clearAvatarFace()
    toast?.({ message: 'ลบอวตารแล้ว กลับไปใช้รูป LINE', type: 'success' })
    onSaved?.(null)
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center animate-fade-in"
      onClick={phase === 'scanning' ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 border-b border-border">
          <p className="font-bold text-lg inline-flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> อวตารการ์ตูนของคุณ
          </p>
          <button
            onClick={onClose}
            disabled={phase === 'scanning'}
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
                ถ่ายเซลฟี่หรือเลือกรูปหน้าตรง AI จะแปลงเป็นตัวการ์ตูนน่ารัก ๆ ไว้ใช้เป็นรูปโปรไฟล์
              </p>
              {/* 3 ทางเลือกเท่ากัน: ถ่ายรูป · เลือกรูป · เลือกอวตารสำเร็จรูป */}
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  className="h-auto flex-col gap-1.5 py-3 rounded-xl"
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="size-5 text-primary" />
                  <span className="text-xs font-semibold">ถ่ายรูป</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto flex-col gap-1.5 py-3 rounded-xl"
                  onClick={() => galleryRef.current?.click()}
                >
                  <ImagePlus className="size-5 text-primary" />
                  <span className="text-xs font-semibold">เลือกรูป</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto flex-col gap-1.5 py-3 rounded-xl"
                  onClick={() => setPhase('choose')}
                >
                  <Sparkles className="size-5 text-primary" />
                  <span className="text-xs font-semibold">เลือกอวตาร</span>
                </Button>
              </div>

              {hasAvatar && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="mt-5 w-full text-sm text-muted-foreground underline underline-offset-2"
                >
                  ลบอวตาร กลับไปใช้รูปโปรไฟล์ LINE
                </button>
              )}
            </div>
          )}

          {phase === 'choose' && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground text-center mb-4">เลือกอวตารที่ชอบได้เลย แตะตัวไหนก็ได้</p>
              <div className="grid grid-cols-3 gap-3">
                {PRESET_FACES.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setFace(p); setPhase('preview') }}
                    aria-label={`อวตารแบบที่ ${i + 1}`}
                    className="aspect-square rounded-2xl overflow-hidden border border-border active:scale-95 transition-transform"
                  >
                    <img src={avatarDataUri(p)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPhase('capture')}
                className="mt-5 w-full text-sm text-muted-foreground underline underline-offset-2"
              >
                ← กลับไปถ่ายรูปแทน
              </button>
            </div>
          )}

          {phase === 'scanning' && (
            <div className="py-16 flex flex-col items-center gap-4 text-muted-foreground">
              <span className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">กำลังวาดการ์ตูนของคุณ...</p>
            </div>
          )}

          {phase === 'preview' && face && (
            <div className="py-4 flex flex-col items-center gap-4">
              {/* ตัวที่เลือกอยู่ (ใหญ่) */}
              <div className="w-36 h-36 rounded-full overflow-hidden border border-border bg-muted shadow-sm animate-pop">
                <img src={avatarDataUri(face)} alt="อวตารการ์ตูน" className="w-full h-full object-cover" />
              </div>
              <p className="text-sm text-muted-foreground text-center">เลือกลุคที่ชอบ แล้วกด “ใช้รูปนี้”</p>

              {/* ตารางลุคให้เลือก — แตะตัวที่ชอบได้เลย ตัวที่เลือกมีกรอบเขียว */}
              <div className="grid grid-cols-3 gap-3 w-full">
                {VARIANTS.map((v) => {
                  const selected = (face.variant ?? 0) === v
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => selectVariant(v)}
                      aria-label={`ลุคที่ ${v + 1}`}
                      aria-pressed={selected}
                      className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all active:scale-95 ${
                        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                      }`}
                    >
                      <img src={avatarDataUri({ ...face, variant: v })} alt="" className="w-full h-full object-cover" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'preview' && (
          <div className="border-t border-border px-5 py-3 pb-6 flex gap-3">
            <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => setPhase('capture')}>
              <RefreshCw className="size-4" /> ถ่ายใหม่
            </Button>
            <Button className="flex-1 h-12 rounded-2xl" onClick={useThis}>
              ใช้รูปนี้
            </Button>
          </div>
        )}

        <input ref={cameraRef} type="file" accept="image/*" capture="user" onChange={pick} className="hidden" />
        <input ref={galleryRef} type="file" accept="image/*" onChange={pick} className="hidden" />
      </div>
    </div>
  )
}
