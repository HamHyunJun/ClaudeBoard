import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import type { ServerMessage, SessionSnapshot } from '@claudeboard/shared'
import { loadConfig } from '../src/config.ts'
import { createServer } from '../src/server.ts'

/**
 * 데모 모드 전체 흐름 검증:
 * WS 접속 → 세션 자동 시작 → 프롬프트 전송 → THINKING/EXECUTING/REQUIRES_APPROVAL 감지
 * → 원클릭 승인 → IDLE + 워크플로우 100% → 사용량 집계·완료 알림
 */
test('데모 세션 E2E: PTY 입출력, 상태 전이, 승인, 사용량', { timeout: 60_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), 'cb-test-'))
  process.env.CLAUDEBOARD_DEMO = '1'
  process.env.CLAUDEBOARD_HOME = home
  process.env.MOCK_SPEED = '0.35'
  const cfg = { ...loadConfig(), port: 0, staticDir: join(home, 'none') }
  const commander = await createServer(cfg)
  await commander.app.listen({ host: '127.0.0.1', port: 0 })
  const port = (commander.app.server.address() as { port: number }).port

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
  const messages: ServerMessage[] = []
  const waiters: Array<{ pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = []
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString()) as ServerMessage
    messages.push(m)
    for (const w of [...waiters]) if (w.pred(m)) {
      waiters.splice(waiters.indexOf(w), 1)
      w.resolve(m)
    }
  })
  const waitFor = <T extends ServerMessage>(pred: (m: ServerMessage) => boolean, label: string, ms = 20_000) =>
    new Promise<T>((resolve, reject) => {
      const hit = messages.find(pred)
      if (hit) return resolve(hit as T)
      const timer = setTimeout(() => reject(new Error(`시간 초과: ${label}`)), ms)
      waiters.push({ pred, resolve: (m) => (clearTimeout(timer), resolve(m as T)) })
    })
  const sessionIs = (id: string, pred: (s: SessionSnapshot) => boolean) => (m: ServerMessage) =>
    m.t === 'session' && m.session.projectId === id && pred(m.session)

  try {
    const hello = await waitFor<Extract<ServerMessage, { t: 'hello' }>>((m) => m.t === 'hello', 'hello')
    assert.equal(hello.demo, true)
    assert.equal(hello.projects.length, 3)
    const id = hello.projects[0]!.id

    // 자동 시작된 세션이 입력 대기(IDLE) 화면을 그릴 때까지
    await waitFor(sessionIs(id, (s) => s.process === 'running' && !!s.lastLine), '세션 시작')
    ws.send(JSON.stringify({ t: 'subscribe', projectId: id }))
    const replay = await waitFor<Extract<ServerMessage, { t: 'replay' }>>((m) => m.t === 'replay', 'replay')
    assert.match(replay.data, /Welcome to Claude Code/)

    messages.length = 0
    ws.send(JSON.stringify({ t: 'prompt', projectId: id, text: '결제 재시도 로직 고쳐줘' }))
    await waitFor((m) => m.t === 'output' && m.data.includes('결제 재시도'), '프롬프트 에코')
    await waitFor(sessionIs(id, (s) => s.status === 'THINKING'), 'THINKING')
    await waitFor(sessionIs(id, (s) => s.status === 'EXECUTING' && s.activeTool === 'Edit'), 'EXECUTING(Edit)')
    const approval = await waitFor<Extract<ServerMessage, { t: 'session' }>>(
      sessionIs(id, (s) => s.status === 'REQUIRES_APPROVAL'),
      'REQUIRES_APPROVAL'
    )
    assert.equal(approval.session.approval?.kind, 'menu')
    assert.equal(approval.session.workflow.stage, 'execute')
    await waitFor((m) => m.t === 'alert' && m.alert.kind === 'approval', '승인 알림')

    ws.send(JSON.stringify({ t: 'approve', projectId: id, decision: 'yes' }))
    await waitFor(sessionIs(id, (s) => s.status === 'EXECUTING' && s.activeTool === 'Bash'), '승인 후 빌드')
    const finished = await waitFor<Extract<ServerMessage, { t: 'session' }>>(
      sessionIs(id, (s) => s.status === 'IDLE' && s.workflow.percent === 100),
      '완료(IDLE, 100%)'
    )
    assert.equal(finished.session.workflow.stage, 'verify')
    await waitFor((m) => m.t === 'alert' && m.alert.kind === 'task-done', '완료 알림')

    const usage = await waitFor<Extract<ServerMessage, { t: 'usage' }>>(
      (m) => m.t === 'usage' && m.usage.projects.some((p) => p.projectId === id && p.last5m > 0),
      '사용량 집계',
      10_000
    )
    assert.ok(usage.usage.todayTotal > 0)
    assert.ok(usage.usage.todayCost > 0)
    assert.ok(usage.usage.rateWindow.resetsAt! > Date.now())

    // 리사이즈가 PTY 크기에 반영되는지
    ws.send(JSON.stringify({ t: 'resize', projectId: id, cols: 100, rows: 30 }))
    await waitFor(sessionIs(id, (s) => s.cols === 100 && s.rows === 30), 'resize')

    // 외부 Origin 은 거부
    const evil = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: 'https://evil.example' } })
    const rejected = await new Promise<boolean>((r) => {
      evil.on('error', () => r(true))
      evil.on('open', () => r(false))
    })
    assert.equal(rejected, true)
  } finally {
    ws.close()
    await commander.close()
    rmSync(home, { recursive: true, force: true })
  }
})
