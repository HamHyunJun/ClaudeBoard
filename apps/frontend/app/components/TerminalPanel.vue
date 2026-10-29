<template>
  <section class="work" :aria-label="item ? `${item.project.name} 터미널` : '터미널'">
    <header class="tabbar">
      <div class="tabs" role="tablist" aria-label="열린 세션" @keydown="onTabKey">
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
      </div>

      <div v-if="item" ref="menuRoot" class="tools" @keydown.esc="closeMenu(true)">
        <button
          class="menu-btn"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          :aria-label="`${item.project.name} 세션 메뉴`"
          @click="menuOpen = !menuOpen"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
        <Transition name="menu">
          <ul v-if="menuOpen" class="menu" role="menu" :aria-label="`${item.project.name} 세션 메뉴`">
            <li role="none">
              <button role="menuitem" type="button" @click="runMenu(() => (cmd.openTargetId.value = item!.project.id))">폴더 열기</button>
            </li>
            <template v-if="s.running.value">
              <li role="none">
                <button role="menuitem" type="button" title="Esc 키 전송: 현재 작업 중단" @click="runMenu(interrupt)">작업 중단</button>
              </li>
              <li role="none">
                <button role="menuitem" type="button" @click="runMenu(() => cmd.restart(item!.project.id))">재시작</button>
              </li>
              <li role="none">
                <button role="menuitem" type="button" @click="runMenu(() => cmd.stop(item!.project.id))">중지</button>
              </li>
            </template>
            <li v-else role="none">
              <button role="menuitem" type="button" @click="runMenu(() => cmd.start(item!.project.id))">시작</button>
            </li>
            <li class="sep" role="separator" />
            <li role="none">
              <button
                role="menuitem"
                type="button"
                class="danger"
                :class="{ armed: confirmRemove }"
                :aria-label="`${item.project.name} 프로젝트 삭제`"
                @click="removeProject"
              >
                {{ confirmRemove ? '정말 삭제?' : '삭제' }}
              </button>
            </li>
          </ul>
        </Transition>
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

      <div v-if="item && s.running.value && view === 'terminal' && speech.supported" class="voice-dock">
        <p v-if="caption" class="caption" :class="{ err: speech.error.value }" role="status">{{ caption }}</p>
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
      </div>
    </div>
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
  else if (body) cmd.input(id, body.replace(/[\r\n]+/g, ' '))
  xterm.value?.focus()
})
const caption = computed(() => speech.error.value || (speech.listening.value ? interim.value || '듣고 있습니다…' : ''))
// 세션을 바꾸거나 승인 대기로 넘어가면 듣기를 멈춘다
watch(() => [item.value?.project.id, s.status.value === 'REQUIRES_APPROVAL'], () => speech.stop())

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

// 다른 세션으로 바꾸면 터미널 보기로 돌아간다
watch(() => item.value?.project.id, () => (view.value = 'terminal'))

/* ───────────── 도구 ───────────── */

const interrupt = (): void => {
  if (!item.value) return
  cmd.input(item.value.project.id, '\x1b')
  xterm.value?.focus()
}

// 세션 도구 메뉴: 바깥을 누르거나 Esc 면 닫힌다
const menuOpen = ref(false)
const menuRoot = ref<HTMLElement>()

const closeMenu = (refocus = false): void => {
  if (!menuOpen.value) return
  menuOpen.value = false
  if (refocus) menuRoot.value?.querySelector<HTMLElement>('.menu-btn')?.focus()
}
const runMenu = (action: () => unknown): void => {
  closeMenu()
  action()
}
const onDocPointer = (e: PointerEvent): void => {
  if (menuOpen.value && !menuRoot.value?.contains(e.target as Node)) closeMenu()
}
onMounted(() => document.addEventListener('pointerdown', onDocPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer))
watch(() => item.value?.project.id, () => closeMenu())

// 실수로 지우지 않도록 두 번 눌러야 삭제: 첫 클릭은 확인 상태로 전환, 3초 뒤 자동 해제
const confirmRemove = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(confirmTimer))
watch(() => item.value?.project.id, () => (confirmRemove.value = false))
watch(menuOpen, (open) => {
  if (!open) confirmRemove.value = false
})

const removeProject = async (): Promise<void> => {
  const id = item.value?.project.id
  if (!id) return
  if (!confirmRemove.value) {
    confirmRemove.value = true
    confirmTimer = setTimeout(() => (confirmRemove.value = false), 3000)
    return
  }
  clearTimeout(confirmTimer)
  confirmRemove.value = false
  closeMenu()
  try {
    await cmd.removeProject(id)
    closeTab(id)
  } catch (err) {
    useNotify().toast({ level: 'warning', title: (err as Error).message })
  }
}

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
  grid-template-rows: auto auto minmax(0, 1fr);
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
  display: flex;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab {
  display: flex;
  align-items: center;
  flex: none;
  border-right: 1px solid var(--rule);
  color: var(--text-2);
  &.active {
    background: var(--ink-0);
    color: var(--text);
    box-shadow: inset 0 2px 0 var(--text-2);
  }
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

.tools {
  position: relative;
  display: flex;
  align-items: center;
  flex: none;
  margin-left: auto;
  padding: 0 10px;
  border-left: 1px solid var(--rule);
}
.menu-btn {
  @include pressable;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-2);
  &:hover,
  &[aria-expanded='true'] {
    background: var(--ink-2);
    color: var(--text);
  }
}
.menu {
  position: absolute;
  top: calc(100% - 4px);
  right: 10px;
  z-index: 20;
  min-width: 150px;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  background: var(--ink-1);
  box-shadow: 0 6px 18px var(--shadow-soft);
  transform-origin: top right;
  button {
    display: block;
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    font-size: var(--fs-sm);
    font-weight: 600;
    text-align: left;
    color: var(--text-2);
    white-space: nowrap;
    &:hover {
      background: var(--ink-2);
      color: var(--text);
    }
    &.danger {
      color: var(--text-3);
      &:hover {
        color: var(--approval);
      }
      &.armed {
        background: var(--approval-wash);
        color: var(--approval);
      }
    }
  }
}
.sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--rule);
}
.menu-enter-active,
.menu-leave-active {
  transition: opacity var(--dur, 0.15s) ease, transform var(--dur, 0.15s) var(--ease-out);
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
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
  position: absolute;
  right: 24px;
  bottom: 16px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 48px);
}
.caption {
  margin: 0;
  max-width: 44ch;
  padding: 6px 12px;
  overflow: hidden;
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  background: var(--ink-1);
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
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: 50%;
  background: var(--ink-2);
  box-shadow: 0 4px 14px var(--shadow-soft);
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
