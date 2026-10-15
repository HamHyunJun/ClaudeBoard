import type { SessionStatus } from '@claudeboard/shared'

/** 1234 → "1.2k", 3_400_000 → "3.4M" */
export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

export function formatCost(usd: number): string {
  return usd >= 100 ? `$${usd.toFixed(0)}` : `$${usd.toFixed(2)}`
}

/** 남은 밀리초 → "02:14:09" */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':')
}

/** 리셋 시각 → "금 오후 2:00" */
export function formatResetAt(at: number): string {
  return new Date(at).toLocaleString('ko-KR', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
}

/** 경과 시간 → "12초", "3분", "1시간 5분" */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`
}

export function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  IDLE: '대기',
  THINKING: '추론 중',
  EXECUTING: '실행 중',
  REQUIRES_APPROVAL: '승인 필요'
}

export const STATUS_CLASS: Record<SessionStatus, string> = {
  IDLE: 'idle',
  THINKING: 'thinking',
  EXECUTING: 'executing',
  REQUIRES_APPROVAL: 'approval'
}

/** 홈 디렉터리를 ~ 로 줄여 표시 */
export function shortPath(p: string): string {
  return p.replace(/^\/(Users|home)\/[^/]+/, '~')
}
