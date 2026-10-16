import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Alert, ProjectConfig } from '@claudeboard/shared'
import { loadConfig } from '../src/config.ts'
import { SessionManager } from '../src/sessionManager.ts'

const setup = (autoStart: boolean, maxAttempts: number) => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-ar-'))
  const cfg = { ...loadConfig(), dataDir: dir, autoRestart: { maxAttempts, baseMs: 50 } }
  const project: ProjectConfig = { id: 'p1', name: 'crashy', cwd: dir, autoStart, command: process.execPath, args: ['-e', 'process.exit(1)'] }
  const mgr = new SessionManager(cfg)
  const alerts: Alert[] = []
  mgr.on('alert', (a: Alert) => alerts.push(a))
  return { mgr, project, alerts }
}
const until = async (pred: () => boolean, ms = 8000): Promise<void> => {
  const end = Date.now() + ms
  while (!pred()) {
    if (Date.now() > end) throw new Error('시간 초과')
    await new Promise((r) => setTimeout(r, 25))
  }
}

test('자동 재시작: 계속 비정상 종료하면 maxAttempts 번 다시 띄우고 포기를 알린다', { timeout: 15_000 }, async () => {
  const { mgr, project, alerts } = setup(true, 2)
  mgr.sync([project])
  await until(() => alerts.some((a) => a.title.includes('자동 재시작 중단')))
  assert.equal(alerts.filter((a) => a.kind === 'auto-restart').length, 2)
  assert.equal(alerts.filter((a) => a.kind === 'process-exit').length, 3) // 최초 1 + 재시작 2
  mgr.disposeAll()
})

test('자동 재시작: autoStart 가 아니거나 사용자가 중지하면 다시 띄우지 않는다', { timeout: 15_000 }, async () => {
  const off = setup(false, 3)
  off.mgr.sync([off.project])
  off.mgr.get('p1')!.start()
  await until(() => off.alerts.some((a) => a.kind === 'process-exit'))
  await new Promise((r) => setTimeout(r, 400))
  assert.equal(off.alerts.filter((a) => a.kind === 'auto-restart').length, 0)
  off.mgr.disposeAll()

  const on = setup(true, 3)
  on.mgr.sync([on.project])
  const s = on.mgr.get('p1')!
  await until(() => on.alerts.some((a) => a.kind === 'auto-restart'))
  s.stop() // 대기 중인 재시작을 취소해야 한다
  const before = on.alerts.filter((a) => a.kind === 'process-exit').length
  await new Promise((r) => setTimeout(r, 600))
  assert.equal(on.alerts.filter((a) => a.kind === 'process-exit').length, before)
  on.mgr.disposeAll()
})
