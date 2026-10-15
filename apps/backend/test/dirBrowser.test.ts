import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listDirs } from '../src/dirBrowser.ts'

test('하위 디렉터리만 이름순으로 돌려주고 숨김 폴더·파일은 뺀다', () => {
  const root = mkdtempSync(join(tmpdir(), 'cb-dir-'))
  mkdirSync(join(root, 'b'))
  mkdirSync(join(root, 'a'))
  mkdirSync(join(root, '.hidden'))
  writeFileSync(join(root, 'file.txt'), '')
  symlinkSync(join(root, 'a'), join(root, 'link'))
  symlinkSync(join(root, 'file.txt'), join(root, 'filelink'))
  const r = listDirs(root)
  assert.deepEqual(r.dirs, ['a', 'b', 'link'])
  assert.equal(r.path, root)
  assert.ok(r.parent)
})

test('루트의 parent 는 null, 없는 경로·파일 경로는 오류', () => {
  assert.equal(listDirs('/').parent, null)
  assert.throws(() => listDirs('/없는/경로'), /폴더를 열 수 없습니다/)
  const root = mkdtempSync(join(tmpdir(), 'cb-dir-'))
  writeFileSync(join(root, 'f'), '')
  assert.throws(() => listDirs(join(root, 'f')), /폴더를 열 수 없습니다/)
})
