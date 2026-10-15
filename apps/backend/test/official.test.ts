import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OfficialUsageClient, planLabel } from '../src/officialUsage.ts'

const cred = { accessToken: 't', expiresAt: Date.now() + 3600_000, subscriptionType: 'pro', rateLimitTier: 'default_claude_ai' }
const body = {
  five_hour: { utilization: 26, resets_at: '2026-10-15T05:50:00.080948+00:00' },
  seven_day: { utilization: 69, resets_at: '2026-10-16T05:00:00.080973+00:00' }
}
const make = (res: () => Response | Promise<Response>, c: typeof cred | null = cred, now = () => Date.now()) =>
  new OfficialUsageClient({ credentials: async () => c, fetch: (async () => res()) as typeof fetch, now })

test('플랜 표시명', () => {
  assert.equal(planLabel({ subscriptionType: 'pro' }), 'Pro')
  assert.equal(planLabel({ subscriptionType: 'max', rateLimitTier: 'default_claude_max_5x' }), 'Max 5x')
  assert.equal(planLabel({}), undefined)
})

test('실측 사용률과 금요일 14시(KST) 리셋 시각 파싱', async () => {
  const o = await make(() => Response.json(body)).poll()
  assert.equal(o.status, 'ok')
  assert.equal(o.plan, 'Pro')
  assert.equal(o.sevenDay?.percent, 69)
  assert.equal(o.sevenDay?.resetsAt, Date.parse('2026-10-16T14:00:00+09:00'))
  assert.equal(o.fiveHour?.percent, 26)
})

test('조회 실패 시 마지막 값을 stale 로 유지', async () => {
  let ok = true
  const c = make(() => (ok ? Response.json(body) : new Response('x', { status: 500 })))
  await c.poll()
  ok = false
  const o = await c.poll()
  assert.equal(o.status, 'stale')
  assert.equal(o.sevenDay?.percent, 69)
})

test('자격 증명 없음·토큰 만료는 unavailable, 429 는 백오프', async () => {
  assert.equal((await make(() => Response.json(body), null).poll()).status, 'unavailable')
  assert.equal((await make(() => Response.json(body), { ...cred, expiresAt: 1 }).poll()).status, 'unavailable')
  let calls = 0
  const c = make(() => (calls++, new Response('x', { status: 429 })))
  await c.poll()
  await c.poll()
  assert.equal(calls, 1)
})

test('429 의 Retry-After 가 기본 백오프보다 길면 그만큼 쉰다', async () => {
  let t = 1_000_000
  let calls = 0
  const c = make(() => (calls++, new Response('x', { status: 429, headers: { 'retry-after': '900' } })), cred, () => t)
  await c.poll()
  t += 10 * 60_000 // 기본 5분은 지났지만 900초는 아직
  await c.poll()
  assert.equal(calls, 1)
  t += 6 * 60_000
  await c.poll()
  assert.equal(calls, 2)
})
