<script setup lang="ts">
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

/**
 * 한 프로젝트의 PTY 스트림을 그대로 보여주는 xterm.js 뷰.
 * 키 입력은 원시 그대로 PTY stdin 으로 보내므로 Claude Code와 직접 상호작용할 수 있다.
 */
const props = defineProps<{ projectId: string; label: string }>()
const cmd = useCommander()
const host = ref<HTMLDivElement>()
let term: Terminal | undefined
let fit: FitAddon | undefined
let unsubscribe: (() => void) | undefined
let ro: ResizeObserver | undefined
let resizeTimer: ReturnType<typeof setTimeout> | undefined

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

onMounted(() => {
  term = new Terminal({
    cursorBlink: true,
    fontFamily: css('--font-code'),
    fontSize: 13,
    lineHeight: 1.2,
    scrollback: 5000,
    allowProposedApi: true,
    screenReaderMode: false,
    theme: {
      background: css('--ink-0'),
      foreground: css('--text'),
      cursor: css('--focus'),
      selectionBackground: 'rgba(159, 209, 255, 0.3)',
      black: '#1b2633',
      brightBlack: '#5b6b7e',
      red: '#f2577a',
      brightRed: '#ff8aa3',
      green: '#57c79a',
      brightGreen: '#7fe0b7',
      yellow: '#f0c46b',
      brightYellow: '#ffd98f',
      blue: '#7fa3c2',
      brightBlue: '#a6c6e2',
      magenta: '#a99bf0',
      brightMagenta: '#c7bdff',
      cyan: '#6fc3d1',
      brightCyan: '#9be0ea',
      white: '#c9d3dd',
      brightWhite: '#f3f6f9'
    }
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon())
  term.open(host.value!)
  term.textarea?.setAttribute('aria-label', `${props.label} 터미널 입력`)

  term.onData((data) => cmd.input(props.projectId, data))

  const doFit = () => {
    if (!term || !fit || !host.value?.offsetWidth) return
    fit.fit()
    clearTimeout(resizeTimer)
    // PTY 리사이즈는 드래그 중 폭주하지 않도록 묶어서 보낸다
    resizeTimer = setTimeout(() => term && cmd.resize(props.projectId, term.cols, term.rows), 120)
  }
  // 재생 데이터는 PTY 의 현재 크기로 그려진 것이므로, 같은 크기로 먼저 그린 뒤에
  // 화면에 맞게 리사이즈해야 상자·커서 이동이 깨지지 않는다 (줄은 xterm 이 리플로우)
  let replayed = false
  unsubscribe = cmd.subscribe(props.projectId, (data, kind) => {
    if (!term) return
    if (kind === 'replay') {
      const snap = cmd.sessions.value[props.projectId]
      term.reset()
      if (snap) term.resize(snap.cols, snap.rows)
      term.write(data, () => {
        replayed = true
        doFit()
      })
      return
    }
    term.write(data)
  })

  ro = new ResizeObserver(() => replayed && requestAnimationFrame(doFit))
  ro.observe(host.value!)
  // 웹폰트가 늦게 로드되면 셀 크기가 달라지므로 다시 맞춘다
  document.fonts?.ready.then(() => replayed && doFit())
  term.focus()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  ro?.disconnect()
  clearTimeout(resizeTimer)
  term?.dispose()
})

defineExpose({ focus: () => term?.focus() })
</script>

<template>
  <div ref="host" class="xterm-host" />
</template>

<style scoped lang="scss">
.xterm-host {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 10px 0 6px 12px;
  background: var(--ink-0);
  :deep(.xterm) {
    height: 100%;
  }
  :deep(.xterm-viewport) {
    background: transparent !important;
  }
}
</style>
