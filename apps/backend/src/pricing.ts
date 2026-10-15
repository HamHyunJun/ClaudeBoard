import type { TokenBreakdown } from '@claudeboard/shared'

/**
 * 모델별 100만 토큰당 단가(USD). Anthropic 1st-party API 공시 단가 기준 추정치이며,
 * 구독(Pro/Max) 사용자는 실제 청구액이 아니라 "API였다면 얼마였을지"로 읽어야 한다.
 * 캐시 쓰기는 입력 단가의 1.25배(5분 TTL), 캐시 읽기는 공시값이 없으면 입력의 0.1배로 둔다.
 */
interface Price {
  input: number
  output: number
  cacheRead?: number
}

/** 접두사가 긴 것부터 매칭되도록 정렬해 사용한다 */
const TABLE: Record<string, Price> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4': { input: 1, output: 5 },
  // 데모·알 수 없는 모델의 기본값 (Sonnet 계열 단가)
  default: { input: 3, output: 15 }
}

const KEYS = Object.keys(TABLE)
  .filter((k) => k !== 'default')
  .sort((a, b) => b.length - a.length)

export function priceFor(model: string | undefined): Price {
  if (!model) return TABLE.default!
  const id = model.toLowerCase().replace(/\[.*\]$/, '')
  const key = KEYS.find((k) => id.startsWith(k))
  return key ? TABLE[key]! : TABLE.default!
}

export function costOf(model: string | undefined, t: TokenBreakdown): number {
  const p = priceFor(model)
  const cacheRead = p.cacheRead ?? p.input * 0.1
  return (
    (t.input * p.input + t.output * p.output + t.cacheWrite * p.input * 1.25 + t.cacheRead * cacheRead) / 1_000_000
  )
}
