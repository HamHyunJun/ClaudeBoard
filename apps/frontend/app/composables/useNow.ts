/** 1초마다 갱신되는 현재 시각 (카운트다운·경과 시간 표시용, 앱 전체에서 타이머 하나 공유) */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

export function useNow() {
  if (!timer && import.meta.client) timer = setInterval(() => (now.value = Date.now()), 1000)
  return now
}
