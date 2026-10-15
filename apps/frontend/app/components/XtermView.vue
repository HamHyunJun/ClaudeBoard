<template>
  <div class="xterm-wrap" :aria-busy="!ready">
    <div ref="host" class="xterm-host" :class="{ pending: !ready }" />
    <div v-if="!ready" class="skeleton" aria-hidden="true">
      <span v-for="w in SKELETON" :key="w" :style="{ width: w }" />
    </div>
  </div>
</template>

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
const { theme } = useTheme()
const host = ref<HTMLDivElement>()
let term: Terminal | undefined
let fit: FitAddon | undefined
let unsubscribe: (() => void) | undefined
let ro: ResizeObserver | undefined
let resizeTimer: ReturnType<typeof setTimeout> | undefined
const MIN_FIT_WIDTH = 160
// 서랍 열림 애니메이션 중 폭이 멈췄다고 보는 시간
const SETTLE_MS = 120
// 맞추기 전의 내용(예전 cols 로 그려져 줄바꿈이 어긋난 상태)을 보이지 않도록 가리고 스켈레톤을 대신 보여준다
const ready = ref(false)
let collapsed = true
let settleTimer: ReturnType<typeof setTimeout> | undefined
// 리사이즈 직후 Claude Code 가 화면(입력창 아래 상태줄 등)을 다시 그리므로, 출력이 이 시간 동안 멈출 때까지 가린다
const QUIET_MS = 150
// 작업 중에는 스피너 때문에 출력이 끊기지 않으므로, 계속 와도 이 시간이 지나면 보여준다
const MAX_WAIT_MS = 400
let waiting = false
let quietTimer: ReturnType<typeof setTimeout> | undefined
let deadlineTimer: ReturnType<typeof setTimeout> | undefined

function cancelReveal() {
  waiting = false
  clearTimeout(quietTimer)
  clearTimeout(deadlineTimer)
}
function reveal() {
  cancelReveal()
  ready.value = true
}
// 출력이 올 때마다 호출: 마지막 출력 뒤 QUIET_MS 가 지나야 보여준다
function holdReveal() {
  if (!waiting) return
  clearTimeout(quietTimer)
  quietTimer = setTimeout(reveal, QUIET_MS)
}
const SKELETON = ['38%', '72%', '56%', '24%', '64%', '48%']

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// 밝은 테마에서는 흰색·노랑 계열이 바탕에 묻히므로 ANSI 색을 어두운 쪽으로 옮긴다
function termTheme() {
  const light = document.documentElement.dataset.theme === 'light'
  return {
    background: css('--ink-0'),
    foreground: css('--text'),
    cursor: css('--focus'),
    selectionBackground: light ? 'rgba(29, 111, 209, 0.25)' : 'rgba(159, 209, 255, 0.3)',
    black: light ? '#18212b' : '#1b2633',
    brightBlack: light ? '#6b7b8e' : '#5b6b7e',
    red: light ? '#d0305a' : '#f2577a',
    brightRed: light ? '#e5486f' : '#ff8aa3',
    green: light ? '#1f9568' : '#57c79a',
    brightGreen: light ? '#2bae7e' : '#7fe0b7',
    yellow: light ? '#a87908' : '#f0c46b',
    brightYellow: light ? '#c08e1a' : '#ffd98f',
    blue: light ? '#3f7aa8' : '#7fa3c2',
    brightBlue: light ? '#5593c4' : '#a6c6e2',
    magenta: light ? '#6d57d6' : '#a99bf0',
    brightMagenta: light ? '#8872e6' : '#c7bdff',
    cyan: light ? '#1b8a9a' : '#6fc3d1',
    brightCyan: light ? '#2aa3b5' : '#9be0ea',
    white: light ? '#4a5a6c' : '#c9d3dd',
    brightWhite: light ? '#18212b' : '#f3f6f9'
  }
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
    theme: termTheme()
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon())
  term.open(host.value!)
  term.textarea?.setAttribute('aria-label', `${props.label} 터미널 입력`)

  term.onData((data) => cmd.input(props.projectId, data))

  const doFit = () => {
    // 서랍이 접히거나 펼쳐지는 중에는 폭이 0 에 가까워 cols 가 2~3 으로 줄고, 내용이 글자 단위로 리플로우돼 한 줄처럼 보인다.
    // PTY 에도 그 크기가 전달되므로 충분히 넓을 때만 맞춘다
    if (!term || !fit || (host.value?.offsetWidth ?? 0) < MIN_FIT_WIDTH) return
    fit.fit()
    collapsed = false
    clearTimeout(resizeTimer)
    if (ready.value) {
      // PTY 리사이즈는 드래그 중 폭주하지 않도록 묶어서 보낸다
      resizeTimer = setTimeout(() => term && cmd.resize(props.projectId, term.cols, term.rows), 120)
      return
    }
    // 가려진 상태: 바로 리사이즈를 보내고, 그에 따른 재그리기가 끝난 뒤에 보여준다
    cmd.resize(props.projectId, term.cols, term.rows)
    waiting = true
    clearTimeout(deadlineTimer)
    deadlineTimer = setTimeout(reveal, MAX_WAIT_MS)
    holdReveal()
  }
  // 재생 데이터는 PTY 의 현재 크기로 그려진 것이므로, 같은 크기로 먼저 그린 뒤에
  // 화면에 맞게 리사이즈해야 상자·커서 이동이 깨지지 않는다 (줄은 xterm 이 리플로우)
  let replayed = false
  unsubscribe = cmd.subscribe(props.projectId, (data, kind) => {
    if (!term) return
    if (kind === 'replay') {
      const snap = cmd.sessions.value[props.projectId]
      // 재연결 replay 도 프로세스 크기로 먼저 그려지므로, 맞추기 전까지 다시 가린다
      cancelReveal()
      ready.value = false
      term.reset()
      if (snap) term.resize(snap.cols, snap.rows)
      term.write(data, () => {
        replayed = true
        doFit()
      })
      return
    }
    term.write(data)
    holdReveal()
  })

  ro = new ResizeObserver(() => {
    if (!replayed) return
    if ((host.value?.offsetWidth ?? 0) < MIN_FIT_WIDTH) {
      collapsed = true
      cancelReveal()
      ready.value = false
      clearTimeout(settleTimer)
      return
    }
    if (!collapsed) return requestAnimationFrame(doFit)
    // 접힌 상태에서 펼쳐지는 중: 폭이 멈출 때까지 기다렸다가 한 번만 맞추고 보여준다
    clearTimeout(settleTimer)
    settleTimer = setTimeout(doFit, SETTLE_MS)
  })
  ro.observe(host.value!)
  // 웹폰트가 늦게 로드되면 셀 크기가 달라지므로 다시 맞춘다
  document.fonts?.ready.then(() => replayed && doFit())
  term.focus()
})

watch(theme, () => nextTick(() => term && (term.options.theme = termTheme())))

onBeforeUnmount(() => {
  unsubscribe?.()
  ro?.disconnect()
  clearTimeout(resizeTimer)
  clearTimeout(settleTimer)
  cancelReveal()
  term?.dispose()
  // 이미 예약된 프레임이 dispose 된 터미널을 건드리지 않도록 비운다
  term = undefined
  fit = undefined
})

defineExpose({ focus: () => term?.focus() })
</script>

<style scoped lang="scss">
.xterm-wrap {
  position: relative;
  // 서랍 폭이 줄어드는 동안 옛 cols 로 그려진 화면이 삐져나와 가로 스크롤이 생기지 않게 한다
  overflow: hidden;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.xterm-host {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 10px 0 6px 12px;
  background: var(--ink-0);
  transition: opacity var(--dur) var(--ease-out);
  // 레이아웃은 유지해야 fit 이 크기를 잴 수 있으므로 display 가 아니라 opacity 로 가린다
  &.pending {
    opacity: 0;
  }
  :deep(.xterm) {
    height: 100%;
  }
  :deep(.xterm-viewport) {
    background: transparent !important;
  }
}

.skeleton {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 18px 16px;
  pointer-events: none;
  span {
    height: 10px;
    border-radius: 5px;
    background: linear-gradient(90deg, var(--ink-2), var(--ink-3), var(--ink-2)) 0 0 / 200% 100%;
    animation: shimmer 1.4s linear infinite;
  }
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
