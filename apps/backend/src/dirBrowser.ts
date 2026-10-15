import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import type { DirListing } from '@claudeboard/shared'

/** 프로젝트 경로 선택용: path(생략 시 홈)의 하위 디렉터리만 돌려준다. 파일 내용은 읽지 않는다 */
export function listDirs(path?: string): DirListing {
  const abs = resolve((path?.trim() || '~').replace(/^~(?=$|\/)/, homedir()))
  let entries
  try {
    if (!statSync(abs).isDirectory()) throw new Error()
    entries = readdirSync(abs, { withFileTypes: true })
  } catch {
    throw new Error(`폴더를 열 수 없습니다: ${abs}`)
  }
  const dirs = entries
    .filter((e) => !e.name.startsWith('.') && (e.isDirectory() || (e.isSymbolicLink() && isDir(resolve(abs, e.name)))))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
  const parent = dirname(abs)
  return { path: abs, parent: parent === abs ? null : parent, dirs }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
