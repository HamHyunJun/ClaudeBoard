/**
 * ClaudeBoard 공유 프로토콜 정의
 * 백엔드와 프론트엔드가 같은 타입을 바라보도록 WebSocket 메시지·도메인 스키마를 한곳에 모은다.
 */

/** 터미널 출력을 파싱해 얻는 세션 상태 4단계 */
export type SessionStatus = 'IDLE' | 'THINKING' | 'EXECUTING' | 'REQUIRES_APPROVAL'

/** PTY 프로세스 자체의 생명주기 */
export type ProcessState = 'stopped' | 'starting' | 'running' | 'exited' | 'error'

/** OMC 워크플로우 단계 (순서가 곧 진행률의 기준) */
export const WORKFLOW_STAGES = ['plan', 'execute', 'review', 'verify'] as const
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number]

/** 승인 프롬프트 종류: Claude Code 선택 메뉴인지, 일반 [y/n] 프롬프트인지 */
export type ApprovalKind = 'menu' | 'yn'

export interface ApprovalRequest {
  kind: ApprovalKind
  /** 사람이 읽을 수 있게 정리한 질문 (예: "Bash(rm -rf dist) 실행을 허용할까요?") */
  question: string
  /** 감지 시점의 주변 출력 몇 줄 (ANSI 제거) */
  context: string[]
  detectedAt: number
}

export interface WorkflowProgress {
  /** 현재 감지된 단계, 아직 없으면 null */
  stage: WorkflowStage | null
  /** 0~100 */
  percent: number
  /** 진행률 근거: 단계 기반인지, Claude Code Todo 체크리스트 기반인지 */
  source: 'none' | 'stage' | 'todos' | 'explicit'
  todos?: { done: number; total: number }
}

export interface ProjectConfig {
  id: string
  name: string
  /** Claude Code를 실행할 로컬 디렉터리 */
  cwd: string
  /** 기본값은 서버 설정의 claude 명령. 프로젝트별로 덮어쓸 수 있다. */
  command?: string
  args?: string[]
  /** 대시보드에서 띄울 퀵 액션 (비어 있으면 기본 세트) */
  quickActions?: QuickAction[]
  /** 서버 시작 시 자동 실행 여부 */
  autoStart?: boolean
}

export interface QuickAction {
  label: string
  /** PTY에 그대로 보낼 프롬프트 텍스트 (엔터는 서버가 붙인다) */
  prompt: string
}

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { label: '/ia scan', prompt: '/ia scan' },
  { label: 'verify', prompt: '변경 사항을 빌드·테스트로 검증하고 결과를 요약해줘' },
  { label: 'clean dead code', prompt: '사용되지 않는 코드(dead code)를 찾아 정리해줘' },
  { label: '/compact', prompt: '/compact' }
]

export interface SessionSnapshot {
  projectId: string
  process: ProcessState
  pid?: number
  status: SessionStatus
  /** 상태가 마지막으로 바뀐 시각 (epoch ms) */
  statusSince: number
  /** 마지막 출력 시각 */
  lastOutputAt?: number
  /** 화면 요약용 마지막 의미 있는 출력 한 줄 */
  lastLine?: string
  /** 현재 실행 중인 도구 (예: "Bash", "Edit") */
  activeTool?: string
  approval?: ApprovalRequest
  workflow: WorkflowProgress
  exitCode?: number
  error?: string
  cols: number
  rows: number
}

export interface TokenBreakdown {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

export interface ProjectUsage {
  projectId: string | null
  /** 사용량을 기록한 원본 cwd (등록되지 않은 프로젝트도 표시하기 위함) */
  cwd: string
  today: TokenBreakdown
  todayCost: number
  /** 최근 5분 토큰 합계 (급증 감지용) */
  last5m: number
  /** 분 단위 스파크라인 (최근 30분, 오래된 것 → 최신) */
  sparkline: number[]
}

/** Claude 가 직접 알려주는 한도 하나 (로컬 토큰 추정이 아님) */
export interface OfficialLimit {
  /** 0~100 사용률 */
  percent: number
  resetsAt: number | null
}

/** Claude 구독 계정이 보고하는 실측 사용량 */
export interface OfficialUsage {
  /** ok: 방금 조회 / stale: 조회 실패로 마지막 값 유지 / unavailable: 값 없음 */
  status: 'ok' | 'stale' | 'unavailable'
  /** 구독 플랜 표시명 (예: Pro, Max 5x) */
  plan?: string
  fiveHour?: OfficialLimit | null
  sevenDay?: OfficialLimit | null
  fetchedAt?: number
  message?: string
}

export interface UsageSummary {
  generatedAt: number
  today: TokenBreakdown
  todayTotal: number
  todayCost: number
  week: { used: number; limit: number }
  month: { used: number; limit: number }
  /** 5시간 롤링 블록 기준 레이트 리밋 창 */
  rateWindow: {
    startedAt: number | null
    resetsAt: number | null
    used: number
    limit: number
  }
  /** 구독 계정 실측값. 없으면(데모 등) 위 로컬 추정치만 의미가 있다 */
  official?: OfficialUsage
  projects: ProjectUsage[]
  /** 사용량 로그 디렉터리를 찾지 못했을 때 안내용 */
  sourceDir: string
  sourceAvailable: boolean
}

export type AlertLevel = 'info' | 'warning' | 'critical'

export interface Alert {
  id: string
  level: AlertLevel
  kind: 'token-hog' | 'approval' | 'task-done' | 'process-exit' | 'error'
  projectId?: string
  title: string
  body: string
  at: number
}

/* ───────────── WebSocket 메시지 ───────────── */

export type ClientMessage =
  | { t: 'subscribe'; projectId: string }
  | { t: 'unsubscribe'; projectId: string }
  /** xterm.js에서 들어온 원시 키 입력 */
  | { t: 'input'; projectId: string; data: string }
  /** 카드 프롬프트 입력창: 텍스트 + 엔터 */
  | { t: 'prompt'; projectId: string; text: string }
  | { t: 'resize'; projectId: string; cols: number; rows: number }
  | { t: 'approve'; projectId: string; decision: 'yes' | 'no' }
  | { t: 'start'; projectId: string }
  | { t: 'stop'; projectId: string }
  | { t: 'restart'; projectId: string }
  | { t: 'ping' }

export type ServerMessage =
  | {
      t: 'hello'
      serverVersion: string
      demo: boolean
      projects: ProjectConfig[]
      sessions: SessionSnapshot[]
      usage: UsageSummary
      alerts: Alert[]
    }
  | { t: 'projects'; projects: ProjectConfig[] }
  | { t: 'session'; session: SessionSnapshot }
  | { t: 'session-removed'; projectId: string }
  /** 구독 직후 링버퍼 내용 재생 */
  | { t: 'replay'; projectId: string; data: string }
  | { t: 'output'; projectId: string; data: string }
  | { t: 'usage'; usage: UsageSummary }
  | { t: 'alert'; alert: Alert }
  | { t: 'error'; message: string; projectId?: string }
  | { t: 'pong' }

/* ───────────── REST ───────────── */

export interface CreateProjectBody {
  name: string
  cwd: string
  command?: string
  args?: string[]
  autoStart?: boolean
}

export const WS_PATH = '/ws'
export const DEFAULT_BACKEND_PORT = 4317
