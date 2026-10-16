import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentWindow, parseUsageLine, UsageTracker } from '../src/usageTracker.ts'
import { costOf } from '../src/pricing.ts'
import { loadConfig } from '../src/config.ts'

const line = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: new Date().toISOString(),
    cwd: '/work/a',
    requestId: 'r1',
    message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 1000 } },
    ...over
  })

test('사용량 줄 파싱', () => {
  const p = parseUsageLine(line())
  assert.ok(p)
  assert.equal(p.key, 'm1:r1')
  assert.deepEqual(p.record.tokens, { input: 100, output: 50, cacheWrite: 10, cacheRead: 1000 })
  assert.equal(parseUsageLine('{"type":"user"}'), null)
  assert.equal(parseUsageLine('not json "usage"'), null)
})

test('비용 계산: Opus 5.5 단가', () => {
  const c = costOf('claude-opus-5-5', { input: 1_000_000, output: 1_000_000, cacheWrite: 0, cacheRead: 1_000_000 })
  assert.equal(Number(c.toFixed(2)), 4 + 20 + 0.2)
})

test('5시간 블록: 정시 내림 시작, 만료 후 비활성', () => {
  const base = new Date('2026-10-14T10:37:00').getTime()
  const rec = (at: number) => ({ at, cwd: '', tokens: { input: 10, output: 0, cacheWrite: 0, cacheRead: 0 } })
  const w = currentWindow([rec(base), rec(base + 3600_000)], base + 2 * 3600_000, 5)
  assert.equal(w.startedAt, new Date('2026-10-14T10:00:00').getTime())
  assert.equal(w.resetsAt, new Date('2026-10-14T15:00:00').getTime())
  assert.equal(w.used, 20)
  assert.equal(currentWindow([rec(base)], base + 6 * 3600_000, 5).resetsAt, null)
})

test('프로젝트별 최근 모델을 담고 가짜 모델명은 무시한다', () => {
  const t = new UsageTracker(loadConfig())
  t.setProjects([{ id: 'a', name: 'A', cwd: '/work/a' }])
  const now = Date.now()
  const tok = { input: 10, output: 0, cacheWrite: 0, cacheRead: 0 }
  t.ingest({ at: now - 3 * 60_000, cwd: '/work/a', model: 'claude-sonnet-5-5', tokens: tok })
  t.ingest({ at: now - 2 * 60_000, cwd: '/work/a', model: 'claude-opus-5-5', tokens: tok })
  t.ingest({ at: now - 60_000, cwd: '/work/a', model: '<synthetic>', tokens: tok })
  assert.equal(t.summary(now).projects[0]!.model, 'claude-opus-5-5')
})

test('프로젝트별 집계와 토큰 급증 감지', () => {
  const cfg = loadConfig()
  cfg.limits.hogTokens5m = 10_000
  const t = new UsageTracker(cfg)
  t.setProjects([
    { id: 'a', name: 'A', cwd: '/work/a' },
    { id: 'b', name: 'B', cwd: '/work/b' }
  ])
  const now = Date.now()
  const tok = (n: number) => ({ input: n, output: 0, cacheWrite: 0, cacheRead: 0 })
  t.ingest({ at: now - 60_000, cwd: '/work/a/sub', model: 'claude-opus-5-5', tokens: tok(50_000) })
  t.ingest({ at: now - 60_000, cwd: '/work/b', model: 'claude-opus-5-5', tokens: tok(1_000) })
  const s = t.summary(now)
  assert.equal(s.projects[0]!.projectId, 'a')
  assert.equal(s.todayTotal, 51_000)
  const alerts = t.checkHogs(s, now)
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0]!.projectId, 'a')
  // 쿨다운 중에는 다시 울리지 않는다
  assert.equal(t.checkHogs(s, now + 1000).length, 0)
})
