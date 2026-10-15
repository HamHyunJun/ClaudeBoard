import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { Alert, ProjectConfig, ProjectUsage, TokenBreakdown, UsageSummary } from '@claudeboard/shared'
import type { ServerConfig } from './config.ts'
import { costOf } from './pricing.ts'

/**
 * Claude Code가 남기는 세션 로그(~/.claude/projects/<인코딩된 cwd>/<세션>.jsonl)를 증분으로 읽어
 * 토큰 사용량을 집계한다. 각 assistant 줄의 message.usage 를 합산하며,
 * 스트리밍 중 같은 메시지가 여러 줄로 기록될 수 있어 message.id + requestId 로 중복을 제거한다.
 */

export interface UsageRecord {
  at: number
  cwd: string
  model?: string
  tokens: TokenBreakdown
}

const ZERO = (): TokenBreakdown => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })
const sum = (t: TokenBreakdown) => t.input + t.output + t.cacheWrite + t.cacheRead
function add(a: TokenBreakdown, b: TokenBreakdown) {
  a.input += b.input
  a.output += b.output
  a.cacheWrite += b.cacheWrite
  a.cacheRead += b.cacheRead
}

/** 로그 한 줄을 사용량 레코드로 변환 (사용량이 없는 줄은 null) */
export function parseUsageLine(line: string): { key: string; record: UsageRecord } | null {
  if (!line.includes('"usage"')) return null
  let obj: any
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }
  const msg = obj?.message
  const u = msg?.usage
  if (!u || obj.type !== 'assistant') return null
  const at = Date.parse(obj.timestamp ?? '')
  if (!Number.isFinite(at)) return null
  const tokens: TokenBreakdown = {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0
  }
  return {
    key: `${msg.id ?? obj.uuid}:${obj.requestId ?? ''}`,
    record: { at, cwd: obj.cwd ?? '', model: msg.model, tokens }
  }
}

function startOfDay(now: number) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function startOfWeek(now: number) {
  const d = new Date(startOfDay(now))
  const diff = (d.getDay() + 6) % 7 // 월요일 시작
  d.setDate(d.getDate() - diff)
  return d.getTime()
}
function startOfMonth(now: number) {
  const d = new Date(startOfDay(now))
  d.setDate(1)
  return d.getTime()
}

/**
 * 5시간 롤링 블록 계산 (Claude 구독 사용량 창과 같은 방식):
 * 첫 메시지 시각을 정시로 내림해 블록을 열고, 블록이 끝났거나 5시간 이상 공백이면 새 블록을 연다.
 */
export function currentWindow(records: UsageRecord[], now: number, hours: number) {
  const span = hours * 3600_000
  let start: number | null = null
  let last = 0
  let used = 0
  for (const r of records) {
    if (r.at < now - span * 2) continue
    if (start === null || r.at >= start + span || r.at - last >= span) {
      const d = new Date(r.at)
      d.setMinutes(0, 0, 0)
      start = d.getTime()
      used = 0
    }
    used += sum(r.tokens)
    last = r.at
  }
  if (start === null || now >= start + span) return { startedAt: null, resetsAt: null, used: 0 }
  return { startedAt: start, resetsAt: start + span, used }
}

export class UsageTracker extends EventEmitter {
  private offsets = new Map<string, number>()
  private seen = new Set<string>()
  private records: UsageRecord[] = []
  private timer?: NodeJS.Timeout
  private projects: ProjectConfig[] = []
  private hogCooldown = new Map<string, number>()
  private lastSummary?: UsageSummary

  constructor(private cfg: ServerConfig) {
    super()
  }

  setProjects(projects: ProjectConfig[]) {
    this.projects = projects
  }

  start(intervalMs = 3000) {
    const tick = async () => {
      try {
        const changed = await this.scan()
        if (changed || !this.lastSummary || Date.now() - this.lastSummary.generatedAt > 15_000) {
          const s = this.summary()
          this.lastSummary = s
          this.emit('usage', s)
          this.checkHogs(s)
        }
      } catch (err) {
        console.error('[usage] 스캔 실패', err)
      }
    }
    void tick()
    this.timer = setInterval(tick, intervalMs)
  }

  stop() {
    clearInterval(this.timer)
  }

  /** 테스트·외부 주입용 */
  ingest(record: UsageRecord) {
    this.records.push(record)
  }

  /** 새로 추가된 줄만 읽는다. 변경이 있었으면 true */
  async scan(): Promise<boolean> {
    const root = this.cfg.claudeProjectsDir
    if (!existsSync(root)) return false
    const files = await listJsonl(root)
    let changed = false
    for (const file of files) {
      const st = await stat(file).catch(() => null)
      if (!st) continue
      let offset = this.offsets.get(file) ?? 0
      if (st.size < offset) offset = 0 // 파일이 잘렸으면 처음부터
      // 처음 보는 오래된 파일(32일 이전 수정)은 건너뛴다
      if (offset === 0 && st.mtimeMs < Date.now() - 32 * 86400_000) {
        this.offsets.set(file, st.size)
        continue
      }
      if (st.size === offset) continue
      const fh = await open(file, 'r')
      try {
        const len = st.size - offset
        const buf = Buffer.alloc(len)
        await fh.read(buf, 0, len, offset)
        const text = buf.toString('utf8')
        // 마지막 줄이 아직 쓰는 중일 수 있으니 완전한 줄까지만 소비
        const lastNl = text.lastIndexOf('\n')
        if (lastNl < 0) continue
        for (const line of text.slice(0, lastNl).split('\n')) {
          const parsed = parseUsageLine(line)
          if (!parsed || this.seen.has(parsed.key)) continue
          this.seen.add(parsed.key)
          this.records.push(parsed.record)
          changed = true
        }
        this.offsets.set(file, offset + Buffer.byteLength(text.slice(0, lastNl + 1)))
      } finally {
        await fh.close()
      }
    }
    if (changed) {
      this.records.sort((a, b) => a.at - b.at)
      const cutoff = Date.now() - 40 * 86400_000
      if (this.records[0] && this.records[0].at < cutoff) this.records = this.records.filter((r) => r.at >= cutoff)
    }
    return changed
  }

  private projectFor(cwd: string): ProjectConfig | undefined {
    // 가장 깊은 경로가 우선 (모노레포 하위 프로젝트 대응)
    return [...this.projects]
      .sort((a, b) => b.cwd.length - a.cwd.length)
      .find((p) => cwd === p.cwd || cwd.startsWith(p.cwd.endsWith(sep) ? p.cwd : p.cwd + sep))
  }

  summary(now = Date.now()): UsageSummary {
    const { limits } = this.cfg
    const dayStart = startOfDay(now)
    const weekStart = startOfWeek(now)
    const monthStart = startOfMonth(now)
    const today = ZERO()
    let todayCost = 0
    let week = 0
    let month = 0
    const per = new Map<string, ProjectUsage>()

    for (const r of this.records) {
      const total = sum(r.tokens)
      if (r.at >= monthStart) month += total
      if (r.at >= weekStart) week += total
      const proj = this.projectFor(r.cwd)
      const key = proj?.id ?? r.cwd
      const recent = r.at >= now - 30 * 60_000
      if (r.at < dayStart && !recent) continue
      let pu = per.get(key)
      if (!pu) {
        pu = {
          projectId: proj?.id ?? null,
          cwd: proj?.cwd ?? r.cwd,
          today: ZERO(),
          todayCost: 0,
          last5m: 0,
          sparkline: new Array(30).fill(0)
        }
        per.set(key, pu)
      }
      if (r.at >= dayStart) {
        const c = costOf(r.model, r.tokens)
        add(today, r.tokens)
        todayCost += c
        add(pu.today, r.tokens)
        pu.todayCost += c
      }
      if (r.at >= now - 5 * 60_000) pu.last5m += total
      if (recent) {
        const bucket = 29 - Math.floor((now - r.at) / 60_000)
        if (bucket >= 0 && bucket < 30) pu.sparkline[bucket]! += total
      }
    }

    const win = currentWindow(this.records, now, limits.windowHours)
    return {
      generatedAt: now,
      today,
      todayTotal: sum(today),
      todayCost,
      week: { used: week, limit: limits.weeklyTokens },
      month: { used: month, limit: limits.monthlyTokens },
      rateWindow: { ...win, limit: limits.windowTokens },
      projects: [...per.values()].sort((a, b) => sum(b.today) - sum(a.today)),
      sourceDir: this.cfg.claudeProjectsDir,
      sourceAvailable: existsSync(this.cfg.claudeProjectsDir)
    }
  }

  /**
   * 토큰 급증(Token Hog) 감지: 최근 5분 사용량이 절대 임계값을 넘고,
   * 다른 프로젝트들의 중앙값보다 3배 이상 많으면 경고. 프로젝트별 10분 쿨다운.
   */
  checkHogs(s: UsageSummary, now = Date.now()): Alert[] {
    const alerts: Alert[] = []
    const active = s.projects.filter((p) => p.last5m > 0)
    for (const p of active) {
      if (p.last5m < this.cfg.limits.hogTokens5m) continue
      const others = active.filter((o) => o !== p).map((o) => o.last5m).sort((a, b) => a - b)
      const median = others.length ? others[Math.floor(others.length / 2)]! : 0
      if (others.length && p.last5m < median * 3) continue
      const key = p.projectId ?? p.cwd
      if ((this.hogCooldown.get(key) ?? 0) > now) continue
      this.hogCooldown.set(key, now + 10 * 60_000)
      const name = this.projects.find((x) => x.id === p.projectId)?.name ?? p.cwd
      const alert: Alert = {
        id: `hog-${key}-${now}`,
        level: 'warning',
        kind: 'token-hog',
        projectId: p.projectId ?? undefined,
        title: `${name}: 토큰 사용량 급증`,
        body: `최근 5분 동안 ${formatTokens(p.last5m)} 토큰을 썼습니다. 루프에 빠졌거나 큰 파일을 반복해서 읽고 있는지 확인하세요.`,
        at: now
      }
      alerts.push(alert)
      this.emit('alert', alert)
    }
    return alerts
  }
}

export function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

async function listJsonl(root: string, depth = 0): Promise<string[]> {
  if (depth > 3) return []
  const out: string[] = []
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const p = join(root, e.name)
    if (e.isDirectory()) out.push(...(await listJsonl(p, depth + 1)))
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p)
  }
  return out
}
