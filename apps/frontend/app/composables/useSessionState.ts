import type { ProjectUsage, SessionStatus } from '@claudeboard/shared'
import type { ComputedRef, DeepReadonly } from 'vue'
import type { SessionItem } from './useCommander'

export interface SessionState {
  running: ComputedRef<boolean>
  status: ComputedRef<SessionStatus>
  /** 명령을 내려 끝난 뒤 아직 확인하지 않은 대기. 명령 없이 그냥 대기 중인 세션과 구분한다 */
  unseenDone: ComputedRef<boolean>
  /** 펄스·색에 쓰는 클래스: 상태 클래스 또는 offline */
  tone: ComputedRef<string>
  label: ComputedRef<string>
  model: ComputedRef<string>
  elapsed: ComputedRef<string>
  usage: ComputedRef<DeepReadonly<ProjectUsage> | undefined>
  tokens: ComputedRef<number>
}

/**
 * 세션 하나의 표시용 상태(실행 여부, 라벨, 모델, 경과 시간, 오늘 토큰)를 모은다.
 * 사이드바 폴더 줄과 중앙 작업 영역이 같은 판정을 쓰도록 한곳에 둔다.
 */
export function useSessionState(item: () => SessionItem | null | undefined): SessionState {
  const cmd = useCommander()
  const now = useNow()

  const session = computed(() => item()?.session)
  const running = computed(() => session.value?.process === 'running' || session.value?.process === 'starting')
  const status = computed(() => session.value?.status ?? 'IDLE')
  const unseenDone = computed(() => {
    const id = item()?.project.id
    const at = session.value?.finishedAt
    return !!id && !!at && running.value && status.value === 'IDLE' && at > (cmd.seenDoneAt.value[id] ?? 0)
  })
  const tone = computed(() => (running.value ? STATUS_CLASS[status.value] : 'offline'))
  const label = computed(() => {
    const p = session.value?.process
    if (!p || p === 'stopped') return '꺼짐'
    if (p === 'starting') return '시작 중'
    if (p === 'exited') return '종료됨'
    if (p === 'error') return '실행 실패'
    return unseenDone.value ? '완료 · 확인 대기' : STATUS_LABEL[status.value]
  })
  const usage = computed(() => {
    const id = item()?.project.id
    return id ? cmd.usage.value?.projects.find((p) => p.projectId === id) : undefined
  })
  // 화면 HUD 에서 읽은 모델이 가장 정확하고, 없으면 로그의 최근 모델. 꺼진 세션의 오래된 값은 보여주지 않는다
  const model = computed(() => {
    if (!running.value) return ''
    return session.value?.model ?? (usage.value?.model ? formatModel(usage.value.model) : '')
  })
  const elapsed = computed(() => (session.value && running.value ? formatElapsed(now.value - session.value.statusSince) : ''))
  const tokens = computed(() => {
    const t = usage.value?.today
    return t ? t.input + t.output + t.cacheWrite + t.cacheRead : 0
  })

  return { running, status, unseenDone, tone, label, model, elapsed, usage, tokens }
}
