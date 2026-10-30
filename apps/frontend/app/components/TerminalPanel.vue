<template>
  <section class="work" :aria-label="item ? `${item.project.name} 터미널` : '터미널'" @keydown.capture="onTermEnter">
    <header class="tabbar">
      <div ref="tabsEl" class="tabs" role="tablist" aria-label="열린 세션" @keydown="onTabKey">
        <span class="tab-marker" :class="{ ready: tabMarkerReady }" :style="tabMarkerStyle" aria-hidden="true" />
        <TransitionGroup name="tab">
        <div v-for="t in tabItems" :key="t.project.id" class="tab" :class="{ active: t.project.id === item?.project.id }">
          <button
            role="tab"
            type="button"
            class="tab-btn"
            :data-tab="t.project.id"
            :aria-selected="t.project.id === item?.project.id"
            :tabindex="t.project.id === item?.project.id ? 0 : -1"
            @click="cmd.openTerminal(t.project.id)"
          >
            <StatusPulse :status="t.session?.status ?? 'IDLE'" :offline="!isRunning(t)" :size="8" />
            <span>{{ t.project.name }}</span>
          </button>
          <button class="tab-x" type="button" :aria-label="`${t.project.name} 탭 닫기`" @click="closeTab(t.project.id)">
            <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        </TransitionGroup>
      </div>

    </header>

    <div v-if="item" class="meta" :class="s.tone.value">
      <span class="path code" :title="item.project.cwd">{{ shortPath(item.project.cwd) }}</span>
      <span class="state">{{ s.label.value }}<template v-if="s.elapsed.value"> · {{ s.elapsed.value }}</template></span>
      <span v-if="s.model.value" class="pill">{{ s.model.value }}</span>
      <span v-for="g in session?.git ?? []" :key="g.branch" class="git code" :title="gitTitle(g)">⎇ {{ g.branch }}<template v-if="gitDirty(g)"> ±{{ gitDirty(g) }}</template></span>
      <span class="nums">
        <span>{{ formatTokens(s.tokens.value) }} 토큰</span>
        <span>{{ formatCost(s.usage.value?.todayCost ?? 0) }}</span>
      </span>
      <button class="ev-toggle" type="button" :aria-pressed="view === 'events'" @click="view = view === 'events' ? 'terminal' : 'events'">
        이벤트<span v-if="events.length" class="count">{{ events.length }}</span>
      </button>
    </div>

    <div class="body">
      <Transition name="screen" mode="out-in">
      <div v-if="!item" class="blank">
        <p class="blank-title">왼쪽에서 프로젝트 폴더를 고르세요</p>
        <p>고른 폴더의 Claude Code 화면이 여기에 그대로 열립니다.</p>
      </div>
      <div v-else-if="view === 'events'" class="events" tabindex="0">
        <ol v-if="events.length" class="log">
          <li v-for="a in events" :key="a.id" :class="a.level">
            <time :datetime="new Date(a.at).toISOString()">{{ formatClock(a.at) }}</time>
            <div>
              <p class="ev-title">{{ a.title }}</p>
              <p class="ev-body">{{ a.body }}</p>
            </div>
          </li>
        </ol>
        <p v-else class="empty">아직 기록된 이벤트가 없습니다. 승인 요청, 작업 완료, 토큰 급증이 여기에 쌓입니다.</p>
      </div>
      <XtermView v-else-if="hasScreen" ref="xterm" :key="item.project.id" :project-id="item.project.id" :label="item.project.name" />
      <div v-else class="blank">
        <p class="blank-title">{{ item.project.name }} 세션이 꺼져 있습니다</p>
        <p>
          시작하면 <code>{{ shortPath(item.project.cwd) }}</code> 에서 Claude Code가 실행됩니다.
        </p>
        <p v-if="session?.error" class="err">{{ session.error }}</p>
        <button class="tool primary big" type="button" @click="cmd.start(item.project.id)">세션 시작</button>
      </div>
      </Transition>

    </div>

      <Transition name="dock">
      <div v-if="item && s.running.value && view === 'terminal' && speech.supported" class="voice-dock">
        <button
          class="mic"
          :class="{ on: speech.listening.value }"
          type="button"
          :disabled="s.status.value === 'REQUIRES_APPROVAL'"
          :aria-pressed="speech.listening.value"
          :aria-label="speech.listening.value ? '음성 입력 중지' : '음성으로 입력'"
          :title="s.status.value === 'REQUIRES_APPROVAL' ? '승인 대기 중에는 음성 입력을 쓸 수 없습니다' : speech.listening.value ? '음성 입력 중지' : '음성으로 입력 (끝에 전송이라고 말하면 전송)'"
          @click="speech.toggle()"
        >
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <Transition name="caption">
        <p v-if="caption" class="caption" :class="{ err: speech.error.value }" role="status">{{ caption }}</p>
        </Transition>
      </div>
      </Transition>
  </section>
</template>

<script setup lang="ts">
import type { GitRepoState } from '@claudeboard/shared'
import type { SessionItem } from '~/composables/useCommander'

/**
 * 중앙 작업 영역: 열린 세션 탭, 세션 도구, 상태 줄, 그리고 화면 전체를 쓰는 Claude Code 터미널.
 * 사이드바에서 폴더를 고르면 탭이 추가되고 그 세션의 PTY 가 그대로 보인다.
 */
const cmd = useCommander()

const item = computed(() => cmd.terminalTarget.value)
const session = computed(() => item.value?.session)
const s = useSessionState(() => item.value)
const view = ref<'terminal' | 'events'>('terminal')
const xterm = ref<{ focus: () => void }>()
const events = computed(() => cmd.alerts.value.filter((a) => a.projectId === item.value?.project.id))
// 한 번이라도 출력이 있었던 세션은 종료 뒤에도 마지막 화면을 보여준다
const hasScreen = computed(() => s.running.value || session.value?.process === 'exited')

// 음성 입력: 확정된 문장을 Claude 입력창에 타이핑하고, 문장 끝에 "전송"이라고 말하면 Enter 까지 보낸다
// ("전송"만 말하면 앞서 입력해 둔 내용을 전송)
const interim = ref('')
const speech = useSpeech((text, final) => {
  const id = item.value?.project.id
  if (!final || !id) return (interim.value = text)
  interim.value = ''
  const { text: body, submit } = splitSubmit(text)
  if (submit && body) cmd.prompt(id, body)
  else if (submit) cmd.input(id, '\r')
  // 말로 전송했으면 듣기도 끝낸다. 이어서 말하려면 다시 켠다
  if (submit) speech.stop()
  else if (body) cmd.input(id, body.replace(/[\r\n]+/g, ' '))
  xterm.value?.focus()
})
// 터미널에서 Enter 로 전송하면 듣기도 끝낸다 (한글 조합 중 Enter 와 Shift+Enter 줄바꿈은 전송이 아니다)
const onTermEnter = (e: KeyboardEvent): void => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !speech.listening.value) return
  if ((e.target as HTMLElement).closest('.xterm')) speech.stop()
}
const caption = computed(() => speech.error.value || (speech.listening.value ? interim.value || '듣고 있습니다…' : ''))
// 세션을 바꾸거나 승인 대기로 넘어가면 듣기를 멈춘다.
// 배열을 돌려주면 상태가 바뀔 때마다(말한 내용이 입력돼 THINKING 으로 바뀔 때도) 새 배열이라 매번 발동하므로 문자열 키로 비교한다
watch(() => `${item.value?.project.id}|${s.status.value === 'REQUIRES_APPROVAL'}`, () => speech.stop())

const isRunning = (x: SessionItem): boolean => x.session?.process === 'running' || x.session?.process === 'starting'

/* ───────────── 탭 ───────────── */

// 처음에는 실행 중인 세션을 모두 탭으로 열고, 이후 고른 세션을 덧붙인다
const openIds = ref<string[]>([])
let seeded = false
watchEffect(() => {
  const list = cmd.sessionList.value
  if (!seeded && list.length) {
    seeded = true
    openIds.value = list.filter(isRunning).map((x) => x.project.id)
  }
  const id = item.value?.project.id
  if (id && !openIds.value.includes(id)) openIds.value = [...openIds.value, id]
})
const tabItems = computed(() =>
  openIds.value.map((id) => cmd.sessionList.value.find((x) => x.project.id === id)).filter((x): x is SessionItem => !!x)
)

const closeTab = (id: string): void => {
  const i = openIds.value.indexOf(id)
  const rest = openIds.value.filter((x) => x !== id)
  if (item.value?.project.id === id) {
    // 닫은 탭이 보고 있던 세션이면 옆 탭으로 옮긴다. 남은 탭이 없으면 빈 화면
    const next = rest[Math.min(i, rest.length - 1)]
    if (next) cmd.openTerminal(next)
    else cmd.selectedId.value = null
  }
  openIds.value = rest
}

const tabsEl = ref<HTMLElement>()
const tabMarkerStyle = ref<Record<string, string | number>>({ opacity: 0 })
const tabMarkerReady = ref(false)

const placeTabMarker = (): void => {
  const id = item.value?.project.id
  const tab = id ? tabsEl.value?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(id)}"]`)?.closest<HTMLElement>('.tab') : undefined
  if (!tab) {
    tabMarkerStyle.value = { ...tabMarkerStyle.value, opacity: 0 }
    return
  }
  tabMarkerStyle.value = { transform: `translateX(${tab.offsetLeft}px)`, width: `${tab.offsetWidth}px`, opacity: 1 }
  // 첫 배치는 옆에서 밀려오지 않도록 트랜지션 없이 놓고, 다음 프레임부터 애니메이션을 켠다
  if (!tabMarkerReady.value) requestAnimationFrame(() => (tabMarkerReady.value = true))
}

const onTabKey = (e: KeyboardEvent): void => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const ids = tabItems.value.map((x) => x.project.id)
  const i = ids.indexOf(item.value?.project.id ?? '')
  if (i < 0 || !ids.length) return
  e.preventDefault()
  const next = ids[(i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]!
  cmd.openTerminal(next)
  nextTick(() => document.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next)}"]`)?.focus())
}

watch(() => [item.value?.project.id, tabItems.value.map((x) => x.project.id).join()], () => nextTick(placeTabMarker), {
  flush: 'post',
  immediate: true
})

// 다른 세션으로 바꾸면 터미널 보기로 돌아간다
watch(() => item.value?.project.id, () => (view.value = 'terminal'))

/* ───────────── 도구 ───────────── */

const gitDirty = (g: GitRepoState): number => g.staged + g.modified + g.untracked
const gitTitle = (g: GitRepoState): string =>
  `스테이징 ${g.staged} · 수정 ${g.modified} · 추적 안 됨 ${g.untracked} · 푸시 안 함 ${g.ahead} · 받을 커밋 ${g.behind}`

/** 단축키용: 터미널에서 음성 입력을 켜고 끈다. 쓸 수 없는 상태(세션 꺼짐·승인 대기 등)면 false */
const toggleVoice = (): boolean => {
  const usable = !!item.value && s.running.value && view.value === 'terminal' && speech.supported && s.status.value !== 'REQUIRES_APPROVAL'
  if (usable) speech.toggle()
  return usable
}

defineExpose({ focus: () => xterm.value?.focus(), toggleVoice })
</script>

<style scoped lang="scss">
.work {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--ink-0);
}

/* ── 탭 ── */
.tabbar {
  display: flex;
  align-items: stretch;
  min-height: 44px;
  border-bottom: 1px solid var(--rule);
  background: var(--ink-1);
}
.tabs {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab {
  display: flex;
  align-items: center;
  flex: none;
  position: relative;
  z-index: 1;
  border-right: 1px solid var(--rule);
  color: var(--text-2);
  transition: color var(--dur-fast) var(--ease-out);
  &.active {
    color: var(--text);
  }
}
// 선택된 탭 표시(배경 + 윗선)는 탭마다 칠하지 않고 하나가 탭 사이를 미끄러진다
.tab-marker {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--ink-0);
  box-shadow: inset 0 2px 0 var(--text-2);
  pointer-events: none;
  &.ready {
    transition:
      transform var(--dur-spring) var(--spring),
      width var(--dur-spring) var(--spring),
      opacity var(--dur) var(--ease-out);
  }
}
// 탭을 열고 닫거나 순서가 바뀔 때 옆 탭이 부드럽게 밀린다
.tab-move {
  transition: transform var(--dur-spring) var(--spring);
}
.tab-enter-active,
.tab-leave-active {
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
.tab-enter-from,
.tab-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
.tab-leave-active {
  position: absolute;
}
// 세션을 바꾸면 이전 화면이 빠르게 사라지고 새 화면이 아래에서 떠오른다
.screen-enter-active {
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
.screen-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out);
}
.screen-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.screen-leave-to {
  opacity: 0;
}
.tab-btn {
  @include pressable;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 4px 0 16px;
  border: 0;
  background: transparent;
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  &:active:not(:disabled) {
    transform: none;
  }
}
.tab-x {
  @include pressable;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin: 0 8px 0 4px;
  padding: 0;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-3);
  &:hover {
    background: var(--ink-3);
    color: var(--text);
  }
}

.tool {
  @include pressable;
  display: inline-grid;
  place-items: center;
  height: 30px;
  padding: 0 11px;
  white-space: nowrap;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  &:hover {
    background: var(--ink-3);
  }
  &.ghost {
    border-color: transparent;
    background: transparent;
    color: var(--text-2);
    &:hover {
      background: var(--ink-2);
      color: var(--text);
    }
  }
  &.primary {
    border-color: transparent;
    background: var(--text);
    color: var(--ink-0);
  }
  &.danger {
    color: var(--text-3);
    &:hover,
    &.armed {
      color: var(--approval);
    }
    &.armed {
      border-color: var(--approval);
      background: var(--approval-wash);
    }
  }
  &.big {
    height: 38px;
    padding: 0 18px;
  }
}

/* ── 상태 줄 ── */
.meta {
  --c: var(--idle);
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 7px 16px 7px 20px;
  border-bottom: 1px solid var(--rule);
  font-size: var(--fs-xs);
  color: var(--text-3);
  white-space: nowrap;
  &.offline {
    --c: var(--text-3);
  }
  &.thinking {
    --c: var(--thinking);
  }
  &.executing {
    --c: var(--executing);
  }
  &.approval,
  &.asking {
    --c: var(--approval);
  }
}
.path {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
}
.state {
  font-weight: 600;
  color: var(--c);
}
.pill {
  padding: 0 8px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  font-weight: 600;
  color: var(--text-2);
}
.git {
  color: var(--text-2);
}
.nums {
  display: flex;
  gap: 12px;
  margin-left: auto;
  color: var(--text-2);
}
.ev-toggle {
  @include pressable;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-2);
  &:hover,
  &[aria-pressed='true'] {
    background: var(--ink-2);
    color: var(--text);
  }
}
.count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--ink-3);
  color: var(--text-2);
}

/* ── 본문 ── */
.body {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.voice-dock {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-top: 1px solid var(--rule);
  background: var(--ink-1);
}
// 마이크 버튼은 아래에서 스프링으로 떠오르며 나타나고, 말풍선은 버튼 쪽에서 밀려 나온다
.dock-enter-active {
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur-spring) var(--spring);
}
.dock-leave-active {
  transition:
    opacity var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.dock-enter-from,
.dock-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
.caption-enter-active,
.caption-leave-active {
  transition:
    opacity var(--dur-fast) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
.caption-enter-from,
.caption-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
.caption {
  margin: 0;
  min-width: 0;
  max-width: 36ch;
  overflow: hidden;
  font-size: var(--fs-sm);
  color: var(--text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
  &.err {
    color: var(--approval);
  }
}
.mic {
  @include pressable;
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: 50%;
  background: var(--ink-2);
  color: var(--text-2);
  &:hover:not(:disabled) {
    color: var(--text);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &.on {
    border-color: var(--approval);
    background: var(--approval-wash);
    color: var(--approval);
    animation: mic-pulse 1.4s var(--ease-out) infinite;
  }
}
@keyframes mic-pulse {
  from {
    box-shadow: 0 0 0 0 var(--approval-wash);
  }
  to {
    box-shadow: 0 0 0 10px transparent;
  }
}

.blank {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 8px;
  height: 100%;
  padding: 24px;
  text-align: center;
  color: var(--text-3);
  p {
    margin: 0;
    max-width: 52ch;
  }
  .tool {
    margin-top: 10px;
  }
}
.blank-title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text);
}
.err {
  color: var(--approval);
}

.events {
  height: 100%;
  overflow-y: auto;
  padding: 16px 24px;
}
.log {
  display: grid;
  gap: 12px;
  max-width: 880px;
  margin: 0;
  padding: 0;
  list-style: none;
  li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    padding-left: 10px;
    border-left: 2px solid var(--idle);
    &.warning {
      border-color: var(--executing);
    }
    &.critical {
      border-color: var(--approval);
    }
  }
  time {
    padding-top: 2px;
    font-size: var(--fs-xs);
    color: var(--text-3);
  }
  p {
    margin: 0;
  }
}
.ev-title {
  font-weight: 600;
}
.ev-body {
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.empty {
  margin: 0;
  color: var(--text-3);
}

</style>
