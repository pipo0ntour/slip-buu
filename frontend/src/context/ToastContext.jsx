import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timerRef = useRef({})

  const dismiss = useCallback((id) => {
    clearTimeout(timerRef.current[id])
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback(({ message, type = 'success', duration = 3000 }) => {
    const id = Date.now()
    setToasts(prev => [...prev.slice(-2), { id, message, type }])
    timerRef.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-20 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map(t => <ToastItem key={t.id} {...t} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

const CONFIG = {
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-card' },
  error:   { icon: XCircle,     color: 'text-destructive', bg: 'bg-card' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-card' },
}

function ToastItem({ id, message, type, onDismiss }) {
  const { icon: Icon, color, bg } = CONFIG[type] || CONFIG.success
  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 w-full max-w-md rounded-2xl border border-border ${bg} px-4 py-3 shadow-lg animate-slide-up`}
      onClick={() => onDismiss(id)}
    >
      <Icon className={`size-5 shrink-0 ${color}`} />
      <p className="flex-1 text-sm font-medium text-foreground">{message}</p>
      <X className="size-4 text-muted-foreground shrink-0" />
    </div>
  )
}
