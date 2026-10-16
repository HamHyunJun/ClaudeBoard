import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DEFAULT_BACKEND_PORT } from '@claudeboard/shared'

/** 환경 변수에서 정수 읽기 (빈 값이나 잘못된 값이면 기본값) */
const intEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw.replace(/_/g, ''))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export interface ServerConfig {
  host: string
  port: number
  /** 데모 모드: 실제 claude 대신 mock-claude 스크립트를 띄운다 */
  demo: boolean
  /** ClaudeBoard 자체 데이터 (projects.json 등) */
  dataDir: string
  /** Claude Code 세션 로그 루트 (~/.claude/projects) */
  claudeProjectsDir: string
  claudeCommand: string
  claudeArgs: string[]
  /** 선택적 접속 토큰. 설정하면 WS·REST 모두 ?token= 또는 헤더가 필요하다 */
  accessToken?: string
  /** 빌드된 프론트엔드 정적 파일 경로 (있으면 같은 포트에서 서빙) */
  staticDir: string
  limits: {
    weeklyTokens: number
    monthlyTokens: number
    /** 5시간 롤링 창 한도 */
    windowTokens: number
    windowHours: number
    /** 최근 5분 토큰이 이 값을 넘으면 급증 후보 */
    hogTokens5m: number
  }
  /** 링버퍼 크기(바이트) */
  replayBytes: number
  /** 비정상 종료한 autoStart 세션을 다시 띄운다. maxAttempts 가 0 이면 끈다 */
  autoRestart: { maxAttempts: number; baseMs: number }
  /** 브라우저가 열려 있지 않을 때 macOS 알림 센터로 알린다 */
  osNotify: boolean
}

export function loadConfig(): ServerConfig {
  const demo = process.env.CLAUDEBOARD_DEMO === '1' || process.argv.includes('--demo')
  const dataDir = resolve(
    process.env.CLAUDEBOARD_HOME ?? (demo ? join(tmpdir(), 'claudeboard-demo') : join(homedir(), '.claudeboard'))
  )
  // 데모 모드에서는 실제 ~/.claude 로그를 건드리지 않도록 별도 디렉터리를 쓴다
  const claudeRoot = process.env.CLAUDE_CONFIG_DIR ?? (demo ? join(dataDir, 'claude') : join(homedir(), '.claude'))

  return {
    host: process.env.CLAUDEBOARD_HOST ?? '127.0.0.1',
    port: intEnv('CLAUDEBOARD_PORT', DEFAULT_BACKEND_PORT),
    demo,
    dataDir,
    claudeProjectsDir: join(claudeRoot, 'projects'),
    claudeCommand: process.env.CLAUDEBOARD_CMD ?? 'claude',
    claudeArgs: (process.env.CLAUDEBOARD_ARGS ?? '').split(' ').filter(Boolean),
    accessToken: process.env.CLAUDEBOARD_TOKEN || undefined,
    staticDir: resolve(
      process.env.CLAUDEBOARD_STATIC ?? new URL('../../frontend/.output/public', import.meta.url).pathname
    ),
    limits: {
      weeklyTokens: intEnv('CLAUDEBOARD_WEEKLY_TOKENS', 150_000_000),
      monthlyTokens: intEnv('CLAUDEBOARD_MONTHLY_TOKENS', 600_000_000),
      windowTokens: intEnv('CLAUDEBOARD_WINDOW_TOKENS', 25_000_000),
      windowHours: intEnv('CLAUDEBOARD_WINDOW_HOURS', 5),
      hogTokens5m: intEnv('CLAUDEBOARD_HOG_TOKENS_5M', demo ? 300_000 : 400_000)
    },
    replayBytes: intEnv('CLAUDEBOARD_REPLAY_BYTES', 512 * 1024),
    autoRestart: {
      maxAttempts: process.env.CLAUDEBOARD_AUTORESTART === '0' ? 0 : intEnv('CLAUDEBOARD_RESTART_MAX', 5),
      baseMs: 2000
    },
    osNotify: process.platform === 'darwin' && !demo && process.env.CLAUDEBOARD_NOTIFY !== '0'
  }
}
