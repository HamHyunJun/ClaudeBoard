import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectStore } from '../src/projectStore.ts'

test('reorder 는 지정한 순서를 앞에 두고 빠진 항목은 뒤에 유지하며 영속화한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-store-'))
  const store = new ProjectStore(dir)
  for (const n of ['a', 'b', 'c']) {
    mkdirSync(join(dir, n))
    store.add({ name: n, cwd: join(dir, n) })
  }
  store.reorder(['c', '없는-id', 'c', 'a'])
  assert.deepEqual(store.list().map((p) => p.id), ['c', 'a', 'b'])
  assert.deepEqual(new ProjectStore(dir).list().map((p) => p.id), ['c', 'a', 'b'])
})
