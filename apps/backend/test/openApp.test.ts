import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOpenApp, openCommand } from '../src/openApp.ts'

test('허용 목록의 앱만 통과한다', () => {
  assert.equal(isOpenApp('vscode'), true)
  assert.equal(isOpenApp('rm -rf /'), false)
  assert.equal(isOpenApp(undefined), false)
})

test('macOS 에서는 셸 없이 open -a 인자 배열을 만든다', () => {
  assert.deepEqual(openCommand('vscode', '/Users/a/my proj;x', 'darwin'), ['open', ['-a', 'Visual Studio Code', '/Users/a/my proj;x']])
  assert.deepEqual(openCommand('terminal', '/tmp', 'darwin')[1].slice(0, 2), ['-a', 'Terminal'])
})

test('macOS 가 아니면 오류', () => {
  assert.throws(() => openCommand('vscode', '/tmp', 'linux'), /macOS/)
})
