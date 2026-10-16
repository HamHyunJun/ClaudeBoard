import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Alert } from '@claudeboard/shared'

/** 이 줄 수를 넘으면 불러올 때 최근 것만 남기고 파일을 줄인다 */
const COMPACT_OVER = 2000

/** 알림을 JSON Lines 파일에 이어 적어 서버를 다시 띄워도 기록이 남게 한다 */
export class AlertLog {
  constructor(private file: string) {}

  /** 최근 max 개 (최신이 앞). 깨진 줄은 건너뛴다 */
  load(max: number): Alert[] {
    let lines: string[]
    try {
      lines = readFileSync(this.file, 'utf8').split('\n').filter(Boolean)
    } catch {
      return []
    }
    const alerts: Alert[] = []
    for (const line of lines) {
      try {
        const a = JSON.parse(line) as Alert
        if (a && typeof a.id === 'string' && typeof a.at === 'number') alerts.push(a)
      } catch {
        // 쓰는 도중 끊긴 줄
      }
    }
    if (lines.length > COMPACT_OVER) {
      try {
        writeFileSync(this.file, alerts.slice(-max).map((a) => JSON.stringify(a)).join('\n') + '\n')
      } catch {
        // 줄이기는 실패해도 기록 자체에는 영향이 없다
      }
    }
    return alerts.slice(-max).reverse()
  }

  append(alert: Alert): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      appendFileSync(this.file, JSON.stringify(alert) + '\n')
    } catch (err) {
      // 기록 실패가 알림 전달을 막아서는 안 된다
      console.error('[ClaudeBoard] 알림 기록 실패', (err as Error).message)
    }
  }
}
