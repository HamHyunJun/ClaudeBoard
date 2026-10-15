import type { Alert, AlertLevel } from '@claudeboard/shared'
import type { Ref } from 'vue'

export interface Toast {
  id: string
  level: AlertLevel
  title: string
  body?: string
  projectId?: string
}

export interface UseNotify {
  toasts: Ref<Toast[]>
  permission: Ref<NotificationPermission | 'unsupported'>
  toast: (t: Omit<Toast, 'id'> & { id?: string }, ttl?: number) => void
  dismiss: (id: string) => void
  requestPermission: () => Promise<void>
  desktop: (alert: Alert, onClick?: () => void) => void
}

const toasts = ref<Toast[]>([])
const permission = ref<NotificationPermission | 'unsupported'>(
  import.meta.client && 'Notification' in window ? Notification.permission : 'unsupported'
)

/** 화면 안 토스트 + 브라우저 데스크톱 알림 */
export function useNotify(): UseNotify {
  function toast(t: Omit<Toast, 'id'> & { id?: string }, ttl = 6000): void {
    const id = t.id ?? `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    toasts.value = [...toasts.value.filter((x) => x.id !== id), { ...t, id }].slice(-4)
    if (ttl > 0) setTimeout(() => dismiss(id), ttl)
  }

  function dismiss(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  async function requestPermission(): Promise<void> {
    if (permission.value === 'unsupported') return
    permission.value = await Notification.requestPermission()
    if (permission.value === 'granted') toast({ level: 'info', title: '데스크톱 알림을 켰습니다' }, 3000)
  }

  /** 승인 요청·작업 완료는 창이 가려져 있을 때 데스크톱 알림으로도 보낸다 */
  function desktop(alert: Alert, onClick?: () => void): void {
    if (permission.value !== 'granted') return
    if (!['approval', 'question', 'task-done', 'token-hog'].includes(alert.kind)) return
    if (document.visibilityState === 'visible' && document.hasFocus()) return
    const n = new Notification(alert.title, { body: alert.body, tag: `${alert.kind}-${alert.projectId ?? ''}` })
    n.onclick = () => {
      window.focus()
      onClick?.()
      n.close()
    }
  }

  return { toasts, permission, toast, dismiss, requestPermission, desktop }
}
