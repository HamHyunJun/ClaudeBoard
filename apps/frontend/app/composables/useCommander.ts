import type {
  Alert,
  ClientMessage,
  CreateProjectBody,
  DirListing,
  OpenAppId,
  OpenProjectBody,
  ProjectConfig,
  ServerMessage,
  SessionSnapshot,
  UsageSummary
} from '@claudeboard/shared'
import { WS_PATH } from '@claudeboard/shared'
import type { ComputedRef, DeepReadonly, Ref } from 'vue'

type ConnState = 'connecting' | 'open' | 'closed'
type OutputListener = (data: string, kind: 'replay' | 'output') => void

export interface SessionItem {
  project: ProjectConfig
  session: SessionSnapshot | undefined
}

export interface SessionCounts {
  running: number
  busy: number
  approval: number
  asking: number
}

export interface Commander {
  conn: DeepReadonly<Ref<ConnState>>
  demo: DeepReadonly<Ref<boolean>>
  projects: DeepReadonly<Ref<ProjectConfig[]>>
  sessions: DeepReadonly<Ref<Record<string, SessionSnapshot>>>
  usage: DeepReadonly<Ref<UsageSummary | null>>
  alerts: DeepReadonly<Ref<Alert[]>>
  lastError: DeepReadonly<Ref<string | null>>
  selectedId: Ref<string | null>
  terminalOpen: Ref<boolean>
  openTargetId: Ref<string | null>
  seenDoneAt: Ref<Record<string, number>>
  sessionList: ComputedRef<SessionItem[]>
  pendingApprovals: ComputedRef<SessionItem[]>
  selected: ComputedRef<SessionItem | null>
  terminalTarget: ComputedRef<SessionItem | null>
  counts: ComputedRef<SessionCounts>
  subscribe: (projectId: string, fn: OutputListener) => () => void
  onAlert: (fn: (a: Alert) => void) => () => boolean
  openTerminal: (id: string) => void
  input: (projectId: string, data: string) => void
  prompt: (projectId: string, text: string) => void
  resize: (projectId: string, cols: number, rows: number) => void
  approve: (projectId: string, decision: 'yes' | 'no') => void
  start: (projectId: string) => void
  stop: (projectId: string) => void
  restart: (projectId: string) => void
  addProject: (body: CreateProjectBody) => Promise<ProjectConfig>
  listDirs: (path?: string) => Promise<DirListing>
  openProject: (id: string, app: OpenAppId) => Promise<void>
  moveProject: (id: string, to: 'up' | 'down' | 'top') => Promise<void>
  removeProject: (id: string) => Promise<void>
  reconnectNow: () => void
}

/**
 * 백엔드와의 단일 WebSocket 연결과 앱 전역 상태.
 * SPA(ssr:false)라 모듈 스코프 상태를 싱글턴으로 공유한다.
 */
const conn = ref<ConnState>('connecting')
const demo = ref(false)
const projects = ref<ProjectConfig[]>([])
const sessions = ref<Record<string, SessionSnapshot>>({})
const usage = ref<UsageSummary | null>(null)
const alerts = ref<Alert[]>([])
const selectedId = ref<string | null>(null)
const terminalOpen = ref(false)
// 폴더 열기 확인 대화상자의 대상 프로젝트 (null 이면 닫힘)
const openTargetId = ref<string | null>(null)
// 선택을 해제해도 터미널이 엉뚱한 세션으로 바뀌지 않도록 마지막 선택을 기억
const lastSelectedId = ref<string | null>(null)
watch(selectedId, (id) => {
  if (id) lastSelectedId.value = id
})
// 사용자가 확인한 완료 시각. 세션을 선택하면 그 시점까지의 완료를 본 것으로 친다
const seenDoneAt = ref<Record<string, number>>({})
const lastError = ref<string | null>(null)

const listeners = new Map<string, Set<OutputListener>>()
let ws: WebSocket | null = null
let retry = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let pingTimer: ReturnType<typeof setInterval> | undefined
let started = false
const alertHandlers = new Set<(a: Alert) => void>()

const backendOrigin = (): string => {
  const configured = useRuntimeConfig().public.backendOrigin as string
  return configured || window.location.origin
}

const wsUrl = (): string => {
  const u = new URL(backendOrigin())
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = WS_PATH
  const token = new URLSearchParams(window.location.search).get('token')
  if (token) u.searchParams.set('token', token)
  return u.toString()
}

const connect = (): void => {
  conn.value = 'connecting'
  ws = new WebSocket(wsUrl())
  ws.onopen = () => {
    conn.value = 'open'
    retry = 0
    lastError.value = null
    // 재접속이면 열려 있던 터미널 구독을 복구
    for (const id of listeners.keys()) send({ t: 'subscribe', projectId: id })
    clearInterval(pingTimer)
    pingTimer = setInterval(() => send({ t: 'ping' }), 20_000)
  }
  ws.onmessage = (ev) => handle(JSON.parse(ev.data) as ServerMessage)
  ws.onclose = () => {
    conn.value = 'closed'
    clearInterval(pingTimer)
    // 지수 백오프 재접속 (최대 10초)
    const delay = Math.min(10_000, 500 * 2 ** retry++)
    retryTimer = setTimeout(connect, delay)
  }
  ws.onerror = () => ws?.close()
}

const handle = (msg: ServerMessage): void => {
  switch (msg.t) {
    case 'hello':
      demo.value = msg.demo
      projects.value = msg.projects
      sessions.value = Object.fromEntries(msg.sessions.map((s) => [s.projectId, s]))
      usage.value = msg.usage
      alerts.value = msg.alerts
      break
    case 'projects':
      projects.value = msg.projects
      if (selectedId.value && !msg.projects.some((p) => p.id === selectedId.value)) {
        selectedId.value = msg.projects[0]?.id ?? null
      }
      break
    case 'session':
      sessions.value = { ...sessions.value, [msg.session.projectId]: msg.session }
      break
    case 'session-removed': {
      const { [msg.projectId]: _removed, ...rest } = sessions.value
      sessions.value = rest
      break
    }
    case 'replay':
    case 'output':
      listeners.get(msg.projectId)?.forEach((fn) => fn(msg.data, msg.t as 'replay' | 'output'))
      break
    case 'usage':
      usage.value = msg.usage
      break
    case 'alert':
      alerts.value = [msg.alert, ...alerts.value].slice(0, 50)
      alertHandlers.forEach((fn) => fn(msg.alert))
      break
    case 'error':
      lastError.value = msg.message
      useNotify().toast({ level: 'warning', title: msg.message, projectId: msg.projectId })
      break
  }
}

const send = (msg: ClientMessage): void => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(new URL(path, backendOrigin()), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
  }).catch(() => {
    throw new Error('백엔드에 연결하지 못했습니다. 서버가 실행 중인지 확인하세요')
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `요청이 실패했습니다 (${res.status})`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export function useCommander(): Commander {
  if (!started && import.meta.client) {
    started = true
    connect()
  }

  const sessionList = computed(() =>
    projects.value.map((p) => ({ project: p, session: sessions.value[p.id] }))
  )
  const pendingApprovals = computed(() =>
    sessionList.value.filter((x) => x.session?.status === 'REQUIRES_APPROVAL' && x.session.approval)
  )
  // 보고 있는 세션이 끝나는 경우도 바로 확인한 것으로 처리
  watchEffect(() => {
    const id = selectedId.value
    const at = id ? sessions.value[id]?.finishedAt : undefined
    if (id && at) seenDoneAt.value[id] = at
  })
  const selected = computed(() => sessionList.value.find((x) => x.project.id === selectedId.value) ?? null)
  /** 터미널 패널이 보여줄 세션: 선택 → 마지막 선택 → 실행 중인 첫 세션 → 첫 세션 */
  const terminalTarget = computed(
    () =>
      selected.value ??
      sessionList.value.find((x) => x.project.id === lastSelectedId.value) ??
      sessionList.value.find((x) => x.session?.process === 'running') ??
      sessionList.value[0] ??
      null
  )
  const counts = computed(() => {
    const c = { running: 0, busy: 0, approval: 0, asking: 0 }
    for (const s of Object.values(sessions.value)) {
      if (s.process === 'running') c.running++
      if (s.status === 'THINKING' || s.status === 'EXECUTING') c.busy++
      if (s.status === 'REQUIRES_APPROVAL') c.approval++
      if (s.status === 'ASKING') c.asking++
    }
    return c
  })

  /** 터미널 출력 구독. 첫 구독자일 때만 서버에 subscribe 를 보낸다 */
  const subscribe = (projectId: string, fn: OutputListener): () => void => {
    let set = listeners.get(projectId)
    if (!set) {
      set = new Set()
      listeners.set(projectId, set)
      send({ t: 'subscribe', projectId })
    }
    set.add(fn)
    return () => {
      set!.delete(fn)
      if (!set!.size) {
        listeners.delete(projectId)
        send({ t: 'unsubscribe', projectId })
      }
    }
  }

  const onAlert = (fn: (a: Alert) => void): () => boolean => {
    alertHandlers.add(fn)
    return () => alertHandlers.delete(fn)
  }

  const openTerminal = (id: string): void => {
    selectedId.value = id
    terminalOpen.value = true
  }

  return {
    conn: readonly(conn),
    demo: readonly(demo),
    projects: readonly(projects),
    sessions: readonly(sessions),
    usage: readonly(usage),
    alerts: readonly(alerts),
    lastError: readonly(lastError),
    selectedId,
    terminalOpen,
    openTargetId,
    seenDoneAt,
    sessionList,
    pendingApprovals,
    selected,
    terminalTarget,
    counts,
    subscribe,
    onAlert,
    openTerminal,
    input: (projectId: string, data: string): void => send({ t: 'input', projectId, data }),
    prompt: (projectId: string, text: string): void => send({ t: 'prompt', projectId, text }),
    resize: (projectId: string, cols: number, rows: number): void => send({ t: 'resize', projectId, cols, rows }),
    approve: (projectId: string, decision: 'yes' | 'no'): void => send({ t: 'approve', projectId, decision }),
    start: (projectId: string): void => send({ t: 'start', projectId }),
    stop: (projectId: string): void => send({ t: 'stop', projectId }),
    restart: (projectId: string): void => send({ t: 'restart', projectId }),
    addProject: (body: CreateProjectBody): Promise<ProjectConfig> => api<ProjectConfig>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
    listDirs: (path?: string): Promise<DirListing> => api<DirListing>(`/api/fs${path ? `?path=${encodeURIComponent(path)}` : ''}`),
    openProject: (id: string, app: OpenAppId): Promise<void> =>
      api<void>(`/api/projects/${encodeURIComponent(id)}/open`, { method: 'POST', body: JSON.stringify({ app } satisfies OpenProjectBody) }),
    /** 세션을 위/아래로 한 칸, 또는 맨 위로 옮긴다 */
    moveProject(id: string, to: 'up' | 'down' | 'top'): Promise<void> {
      const ids = projects.value.map((p) => p.id)
      const i = ids.indexOf(id)
      if (i < 0) return Promise.resolve()
      const j = to === 'top' ? 0 : Math.max(0, Math.min(ids.length - 1, i + (to === 'up' ? -1 : 1)))
      if (j === i) return Promise.resolve()
      ids.splice(j, 0, ids.splice(i, 1)[0]!)
      return api<void>('/api/projects/order', { method: 'PUT', body: JSON.stringify({ ids }) })
    },
    removeProject: (id: string): Promise<void> => api<void>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    reconnectNow: (): void => {
      clearTimeout(retryTimer)
      retry = 0
      ws?.close()
      if (conn.value === 'closed') connect()
    }
  }
}
