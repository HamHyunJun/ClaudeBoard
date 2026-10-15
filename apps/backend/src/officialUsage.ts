import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { OfficialLimit, OfficialUsage } from '@claudeboard/shared'

/**
 * 로그 합산이 아니라 Claude 계정이 직접 보고하는 5시간·주간 사용률과 리셋 시각을 읽는다.
 * Claude Code 가 저장한 OAuth 자격 증명(macOS 키체인 또는 ~/.claude/.credentials.json)의
 * 액세스 토큰으로 사용량 엔드포인트를 조회한다. 토큰 갱신은 Claude Code 몫이라 여기서는 하지 않는다.
 */

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const run = promisify(execFile)

export interface Credentials {
  accessToken: string
  expiresAt?: number
  subscriptionType?: string
  rateLimitTier?: string
}

export async function readCredentials(): Promise<Credentials | null> {
  let raw: string | null = null
  if (process.platform === 'darwin') {
    raw = await run('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'])
      .then((r) => r.stdout)
      .catch(() => null)
  }
  raw ??= await readFile(join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), '.credentials.json'), 'utf8').catch(() => null)
  if (!raw) return null
  try {
    const o = JSON.parse(raw).claudeAiOauth
    return typeof o?.accessToken === 'string' ? o : null
  } catch {
    return null
  }
}

/** subscriptionType/rateLimitTier → "Pro", "Max 5x" */
export function planLabel(c: Pick<Credentials, 'subscriptionType' | 'rateLimitTier'>): string | undefined {
  const t = c.subscriptionType?.toLowerCase()
  if (!t) return undefined
  const base = t.charAt(0).toUpperCase() + t.slice(1)
  const mult = c.rateLimitTier?.match(/(\d+)x/)?.[1]
  return t === 'max' && mult ? `${base} ${mult}x` : base
}

function toLimit(v: any): OfficialLimit | null {
  if (typeof v?.utilization !== 'number') return null
  const at = Date.parse(v.resets_at ?? '')
  return { percent: Math.max(0, Math.min(100, v.utilization)), // 13:59:59.9 처럼 오는 값을 분 단위로 맞춘다
    resetsAt: Number.isFinite(at) ? Math.round(at / 60_000) * 60_000 : null }
}

export class OfficialUsageClient {
  private last?: OfficialUsage
  private backoffUntil = 0

  constructor(
    private deps: { credentials: () => Promise<Credentials | null>; fetch: typeof fetch; now: () => number } = {
      credentials: readCredentials,
      fetch: (...a): Promise<Response> => fetch(...a),
      now: Date.now
    }
  ) {}

  async poll(): Promise<OfficialUsage> {
    const now = this.deps.now()
    if (now < this.backoffUntil && this.last) return this.last
    const fail = (message: string): OfficialUsage =>
      (this.last = this.last?.fiveHour || this.last?.sevenDay
        ? { ...this.last, status: 'stale', message }
        : { status: 'unavailable', message })

    const cred = await this.deps.credentials()
    if (!cred) return fail('Claude Code 로그인 정보를 찾지 못했습니다. `claude`에서 /login 을 실행하세요.')
    const plan = planLabel(cred)
    if (cred.expiresAt && cred.expiresAt <= now) return fail('토큰이 만료되었습니다. Claude Code를 한 번 실행하면 갱신됩니다.')
    try {
      const res = await this.deps.fetch(USAGE_URL, {
        headers: { authorization: `Bearer ${cred.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20', 'user-agent': 'claudeboard' },
        signal: AbortSignal.timeout(10_000)
      })
      if (res.status === 429) {
        // 기본 5분 쉬되, 서버가 Retry-After(초)로 더 길게 요구하면 그만큼 쉰다
        const hinted = Number(res.headers.get('retry-after')) * 1000
        const wait = 5 * 60_000
        this.backoffUntil = now + (Number.isFinite(hinted) && hinted > wait ? hinted : wait)
      }
      if (!res.ok) return fail(`사용량 조회 실패 (HTTP ${res.status})`)
      const j: any = await res.json()
      return (this.last = {
        status: 'ok',
        plan,
        fiveHour: toLimit(j.five_hour),
        sevenDay: toLimit(j.seven_day),
        fetchedAt: now
      })
    } catch (err) {
      return fail(`사용량 조회 실패: ${(err as Error).message}`)
    }
  }
}
