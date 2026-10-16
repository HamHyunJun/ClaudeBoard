import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Alert } from '@claudeboard/shared'
import { AlertLog } from '../src/alertLog.ts'
import { osNotifyArgs, shouldNotifyOs } from '../src/osNotify.ts'

const alert = (n: number, over: Partial<Alert> = {}): Alert => ({
  id: `a${n}`, level: 'info', kind: 'task-done', title: `t${n}`, body: `b${n}`, at: n, ...over
})

test('AlertLog: 파일이 없으면 빈 목록, 기록 후 최신이 앞에 온다', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'cb-alog-')), 'sub', 'alerts.jsonl')
  const log = new AlertLog(file)
  assert.deepEqual(log.load(50), [])
  for (let i = 1; i <= 5; i++) log.append(alert(i))
  assert.deepEqual(log.load(3).map((a) => a.id), ['a5', 'a4', 'a3'])
})

test('AlertLog: 깨진 줄은 건너뛰고 나머지는 읽는다', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'cb-alog-')), 'alerts.jsonl')
  writeFileSync(file, JSON.stringify(alert(1)) + '\n{"id":"끊긴 줄')
  appendFileSync(file, '\nnull\n' + JSON.stringify(alert(2)) + '\n')
  assert.deepEqual(new AlertLog(file).load(50).map((a) => a.id), ['a2', 'a1'])
})

test('AlertLog: 줄이 너무 많으면 불러올 때 최근 것만 남긴다', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'cb-alog-')), 'alerts.jsonl')
  const log = new AlertLog(file)
  for (let i = 1; i <= 2100; i++) log.append(alert(i))
  assert.equal(log.load(50).length, 50)
  assert.equal(readFileSync(file, 'utf8').split('\n').filter(Boolean).length, 50)
})

test('OS 알림: 경고 이상과 작업 완료만, 제목·본문은 스크립트가 아니라 argv 로 전달', () => {
  assert.equal(shouldNotifyOs(alert(1, { level: 'critical', kind: 'approval' })), true)
  assert.equal(shouldNotifyOs(alert(1, { level: 'info', kind: 'task-done' })), true)
  assert.equal(shouldNotifyOs(alert(1, { level: 'info', kind: 'process-exit' })), false)
  const evil = alert(1, { title: '" & do shell script "x', body: 'a\nb' })
  const args = osNotifyArgs(evil)
  assert.equal(args.slice(-2)[0], evil.title)
  assert.ok(!args.slice(0, -3).some((a) => a.includes('do shell script')))
})
