import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { OPEN_APPS, type OpenAppId } from '@claudeboard/shared'

const run = promisify(execFile)

// macOS 응용 프로그램 이름. shortcut: darwin 전용, Linux·Windows 지원이 필요해지면 플랫폼별 명령을 추가
const MAC_APP: Record<OpenAppId, string> = {
  vscode: 'Visual Studio Code',
  cursor: 'Cursor',
  finder: 'Finder',
  terminal: 'Terminal'
}

// 에디터는 번들 CLI 로 열어야 이미 그 폴더가 열린 창이 있으면 새 창 대신 그 창을 앞으로 가져온다 (open -a 는 새 창을 연다)
const MAC_CLI: Partial<Record<OpenAppId, string>> = {
  vscode: '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
  cursor: '/Applications/Cursor.app/Contents/Resources/app/bin/cursor'
}

export function isOpenApp(v: unknown): v is OpenAppId {
  return typeof v === 'string' && OPEN_APPS.some((a) => a.id === v)
}

/** 셸을 거치지 않고 인자 배열로 실행한다. cwd 는 등록된 절대 경로만 들어온다 */
export function openCommand(app: OpenAppId, cwd: string, platform = process.platform, exists = existsSync): [string, string[]] {
  if (platform !== 'darwin') throw new Error('폴더 열기는 macOS에서만 지원합니다')
  const cli = MAC_CLI[app]
  if (cli && exists(cli)) return [cli, [cwd]]
  return ['open', ['-a', MAC_APP[app], cwd]]
}

export async function openInApp(app: OpenAppId, cwd: string): Promise<void> {
  const [cmd, args] = openCommand(app, cwd)
  try {
    await run(cmd, args, { timeout: 10_000 })
  } catch {
    const label = OPEN_APPS.find((a) => a.id === app)!.label
    throw new Error(`${label}을(를) 열 수 없습니다. 설치되어 있는지 확인하세요`)
  }
}
