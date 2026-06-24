import { useRef, useState } from 'react'
import { X, Camera, ImagePlus, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPostForm } from '@/lib/api'
import { avatarDataUri } from '@/lib/avatar'
import { saveAvatarFace, clearAvatarFace } from '@/lib/avatarStore'

// ถ่ายเซลฟี่ → AI อ่านลักษณะใบหน้า → ประกอบเป็นอวตารการ์ตูน (DiceBear) → เก็บไว้ใช้เป็นรูปโปรไฟล์
// phase: 'capture' (เลือกรูป) → 'scanning' (กำลังอ่าน) → 'preview' (ดูผล/ใช้/ถ่ายใหม่)
// รูปต้นฉบับไม่ถูกเก็บที่ server — อ่านลักษณะเสร็จทิ้งทันที (เก็บแค่ "ลักษณะ" ในเครื่อง)
export default function AvatarMaker({ toast, hasAvatar, onSaved, onClose }) {
  const [phase, setPhase] = useState('capture')
  const [face, setFace] = useState(null)
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
                <br />
                <span className="text-xs">🔒 ระบบไม่เก็บรูปถ่ายของคุณ เก็บแค่ลักษณะการ์ตูนในเครื่อง</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button className="h-12 rounded-xl" onClick={() => cameraRef.current?.click()}>
                  <Camera className="size-4" /> ถ่ายเซลฟี่
                </Button>
                <Button variant="outline" className="h-12 rounded-xl" onClick={() => galleryRef.current?.click()}>
                  <ImagePlus className="size-4" /> เลือกรูป
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

          {phase === 'scanning' && (
            <div className="py-16 flex flex-col items-center gap-4 text-muted-foreground">
              <span className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">กำลังวาดการ์ตูนของคุณ...</p>
            </div>
          )}

          {phase === 'preview' && face && (
            <div className="py-4 flex flex-col items-center gap-5">
              <div className="w-44 h-44 rounded-full overflow-hidden border border-border bg-muted shadow-sm animate-pop">
                <img src={avatarDataUri(face)} alt="อวตารการ์ตูน" className="w-full h-full object-cover" />
              </div>
              <p className="text-sm text-muted-foreground text-center">เป็นตัวการ์ตูนหน้าตาแบบนี้ ชอบไหม?</p>
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
