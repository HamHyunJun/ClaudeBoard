export type Theme = 'dark' | 'light'

const KEY = 'claudeboard-theme'
const theme = ref<Theme>('dark')

function apply(t: Theme) {
  theme.value = t
  document.documentElement.dataset.theme = t
}

/** 저장된 선택 → 없으면 OS 설정 순으로 정하고, 이후 토글은 localStorage 에 기억한다 */
export function useTheme() {
  const preset = import.meta.client ? document.documentElement.dataset.theme : undefined
  if (preset === 'light' || preset === 'dark') theme.value = preset
  else if (import.meta.client) {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(KEY)
    } catch {}
    apply(saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  }
  function toggle() {
    const next: Theme = theme.value === 'dark' ? 'light' : 'dark'
    apply(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {}
  }
  return { theme, toggle }
}
