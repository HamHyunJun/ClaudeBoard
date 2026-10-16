import { execFile } from 'node:child_process'
import type { Alert } from '@claudeboard/shared'

/** 사람이 봐야 하는 알림만: 경고 이상, 그리고 작업 완료 */
export const shouldNotifyOs = (a: Alert): boolean => a.level !== 'info' || a.kind === 'task-done'

/** 제목·본문은 AppleScript 소스에 끼우지 않고 argv 로 넘겨 주입을 막는다 */
export const osNotifyArgs = (a: Alert): string[] => [
  '-e', 'on run argv',
  '-e', 'display notification (item 2 of argv) with title (item 1 of argv)',
  '-e', 'end run',
  '--', a.title.slice(0, 120), a.body.slice(0, 240)
]

export const notifyOs = (a: Alert): void => {
  execFile('osascript', osNotifyArgs(a), { timeout: 5000 }, (err) => {
    if (err) console.error('[ClaudeBoard] macOS 알림 실패', err.message)
  })
}
