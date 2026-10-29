<template>
  <aside class="side" aria-label="프로젝트 폴더">
    <div class="brand">
      <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="7" y="8" width="3" height="16" rx="1.5" fill="var(--executing)" />
        <rect x="13" y="8" width="12" height="3" rx="1.5" fill="var(--text-2)" />
        <rect x="13" y="14.5" width="9" height="3" rx="1.5" fill="var(--text-2)" />
        <rect x="13" y="21" width="6" height="3" rx="1.5" fill="var(--ok)" />
      </svg>
      <h1>ClaudeBoard</h1>
      <span v-if="cmd.demo.value" class="demo" title="실제 claude 대신 모의 CLI로 실행 중입니다">데모</span>
    </div>

    <button class="search" type="button" aria-keyshortcuts="Meta+K Control+K" @click="emit('palette')">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span>폴더·명령 검색</span>
      <kbd>{{ isMac ? '⌘' : 'Ctrl' }} K</kbd>
    </button>

    <dl class="stats" aria-label="세션 요약">
      <div>
        <dt>실행</dt>
        <dd>{{ cmd.counts.value.running }}</dd>
      </div>
      <div>
        <dt>작업</dt>
        <dd>{{ cmd.counts.value.busy }}</dd>
      </div>
      <div :class="{ alarm: cmd.counts.value.approval > 0 }">
        <dt>승인</dt>
        <dd>{{ cmd.counts.value.approval }}</dd>
      </div>
      <div :class="{ alarm: cmd.counts.value.asking > 0 }">
        <dt>답변</dt>
        <dd>{{ cmd.counts.value.asking }}</dd>
      </div>
    </dl>

    <div class="sect">
      <h2 id="folders-title">프로젝트 폴더</h2>
      <button
        v-if="cmd.sessionList.value.length"
        class="icon-btn"
        type="button"
        :aria-pressed="bulkMode"
        title="여러 세션에 같은 지시 보내기"
        @click="toggleBulk"
      >
        일괄
      </button>
      <button class="icon-btn add" type="button" aria-label="프로젝트 추가" title="프로젝트 추가" @click="emit('add')">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <form v-if="bulkMode" class="bulk" aria-label="선택한 세션에 일괄 지시" @submit.prevent="sendBulk(bulkDraft)">
      <p class="bulk-count" aria-live="polite">
        실행 중 <strong>{{ runningChecked.length }}</strong>/{{ checkedIds.length }}개 선택
        <button class="link" type="button" @click="checkAllRunning">모두</button>
      </p>
      <label for="bulk-input" class="sr-only">선택한 세션들에 보낼 지시</label>
      <input
        id="bulk-input"
        v-model="bulkDraft"
        class="bulk-input"
        type="text"
        autocomplete="off"
        :placeholder="runningChecked.length ? `${runningChecked.length}개 세션에 지시` : '아래에서 세션을 고르세요'"
        :disabled="!runningChecked.length"
      />
      <div class="bulk-quick" role="group" aria-label="퀵 액션">
        <button
          v-for="qa in DEFAULT_QUICK_ACTIONS"
          :key="qa.label"
          class="chip"
          type="button"
          :disabled="!runningChecked.length"
          :title="qa.prompt"
          @click="sendBulk(qa.prompt)"
        >
          {{ qa.label }}
        </button>
      </div>
    </form>

    <ol v-if="cmd.sessionList.value.length" ref="listEl" class="folders" aria-labelledby="folders-title" @keydown="onKeydown">
      <li class="marker" :class="{ ready: markerReady }" :style="markerStyle" role="presentation" aria-hidden="true" />
      <TransitionGroup name="flip">
      <li
        v-for="item in cmd.sessionList.value"
        :key="item.project.id"
        draggable="true"
        :class="{ dragging: dragId === item.project.id, over: overId === item.project.id && dragId !== item.project.id, below: dragBelow }"
        @dragstart="onDragStart($event, item.project.id)"
        @dragover="onDragOver($event, item.project.id)"
        @drop.prevent="onDrop(item.project.id)"
        @dragend="dragId = overId = undefined"
      >
        <input
          v-if="bulkMode"
          class="pick"
          type="checkbox"
          :checked="checkedIds.includes(item.project.id)"
          :aria-label="`${item.project.name} 일괄 지시 대상으로 선택`"
          @change="toggleChecked(item.project.id)"
        />
        <FolderRow :item="item" :active="cmd.terminalTarget.value?.project.id === item.project.id" @select="cmd.openTerminal(item.project.id)" />
        <SessionMenu :item="item" />
      </li>
      </TransitionGroup>
    </ol>
    <div v-else class="empty">
      <p>관제할 프로젝트가 없습니다. Claude Code를 실행할 로컬 폴더를 추가하세요.</p>
      <button class="primary" type="button" @click="emit('add')">첫 프로젝트 추가</button>
    </div>
    <p v-if="cmd.sessionList.value.length > 1" class="hint"><kbd>↑</kbd><kbd>↓</kbd> 이동 · <kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd>·드래그로 순서</p>

    <section class="quota" aria-label="사용량과 한도">
      <p class="today">
        <span>오늘</span>
        <strong>{{ formatTokens(u?.todayTotal ?? 0) }}</strong>
        <span class="cost">{{ formatCost(u?.todayCost ?? 0) }}</span>
        <span v-if="live && official?.plan" class="plan">{{ official.plan }}</span>
      </p>
      <QuotaMeter
        v-if="fiveHour"
        label="5시간 창"
        :percent="fiveHourPercent"
        :detail="resetIn !== null ? `${formatCountdown(resetIn)} 후 리셋` : '활성 창 없음'"
      />
      <QuotaMeter
        v-else
        label="5시간 창"
        :used="u?.rateWindow.used ?? 0"
        :limit="u?.rateWindow.limit ?? 1"
        :detail="resetIn !== null ? `${formatCountdown(resetIn)} 후 리셋 · 추정` : '로컬 추정'"
      />
      <QuotaMeter
        v-if="sevenDay"
        label="이번 주"
        :percent="sevenDay.percent"
        :detail="sevenDay.resetsAt ? `${formatResetAt(sevenDay.resetsAt)} 리셋` : 'Claude 실측'"
      />
      <QuotaMeter v-else label="이번 주" :used="u?.week.used ?? 0" :limit="u?.week.limit ?? 1" detail="로컬 추정 · 월요일 기준" />
      <p v-if="official && official.status !== 'ok'" class="warn" role="status">
        {{ official.status === 'stale' ? '최신 조회에 실패해 마지막 값을 보여줍니다.' : 'Claude 실측값을 가져오지 못해 로컬 추정치를 보여줍니다.' }}
      </p>
    </section>

    <footer class="foot">
      <button class="conn" :class="cmd.conn.value" type="button" :disabled="cmd.conn.value === 'open'" @click="cmd.reconnectNow()">
        <span class="dot" aria-hidden="true" />
        {{ connLabel }}
        <span v-if="cmd.conn.value === 'closed'" class="sr-only">, 눌러서 다시 연결</span>
      </button>
      <button v-if="notify.permission.value === 'default'" class="ghost" type="button" @click="notify.requestPermission()">알림 켜기</button>
      <button class="ghost theme-btn" type="button" :aria-label="themeLabel" :title="themeLabel" @click="toggleTheme">
        <svg v-if="theme === 'dark'" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
      </button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { DEFAULT_QUICK_ACTIONS } from '@claudeboard/shared'

/**
 * 왼쪽 사이드바: 프로젝트 폴더 목록(상태 펄스), 일괄 지시, 사용량 한도, 연결·테마.
 * 폴더를 누르면 중앙 터미널이 그 세션으로 바뀐다. ↑/↓ 로 이동, Alt+↑/↓ 또는 드래그로 순서를 바꾼다.
 */
const emit = defineEmits<{ add: []; palette: [] }>()

const cmd = useCommander()
const notify = useNotify()
const now = useNow()
const { theme, toggle: toggleTheme } = useTheme()
const themeLabel = computed(() => (theme.value === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'))
const isMac = computed(() => import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform))
const connLabel = computed(() => ({ open: '연결됨', connecting: '연결 중', closed: '연결 끊김' })[cmd.conn.value])

const listEl = ref<HTMLOListElement>()

/* ───────────── 사용량 ───────────── */

const u = computed(() => cmd.usage.value)
// Claude 가 알려준 실측값. 조회 불가일 때만 로컬 로그 추정치로 돌아간다
const official = computed(() => u.value?.official)
const live = computed(() => !!official.value && official.value.status !== 'unavailable')
const fiveHour = computed(() => (live.value ? official.value?.fiveHour : null) ?? null)
const sevenDay = computed(() => (live.value ? official.value?.sevenDay : null) ?? null)
const resetIn = computed(() => {
  const r = live.value ? fiveHour.value?.resetsAt : u.value?.rateWindow.resetsAt
  return r && r > now.value ? r - now.value : null
})
// 리셋 시각이 지났으면 새 창이 열리기 전이므로 0%
const fiveHourPercent = computed(() => (resetIn.value === null ? 0 : (fiveHour.value?.percent ?? 0)))

/* ───────────── 일괄 지시 ───────────── */

const bulkMode = ref(false)
const checkedIds = ref<string[]>([])
const bulkDraft = ref('')
// 삭제된 프로젝트가 남아 있어도 세지 않도록 현재 목록과 교차한다
const runningChecked = computed(() =>
  cmd.sessionList.value.filter((x) => checkedIds.value.includes(x.project.id) && x.session?.process === 'running')
)

const toggleBulk = (): void => {
  bulkMode.value = !bulkMode.value
  if (!bulkMode.value) {
    checkedIds.value = []
    bulkDraft.value = ''
  }
}
const toggleChecked = (id: string): void => {
  checkedIds.value = checkedIds.value.includes(id) ? checkedIds.value.filter((x) => x !== id) : [...checkedIds.value, id]
}
const checkAllRunning = (): void => {
  checkedIds.value = cmd.sessionList.value.filter((x) => x.session?.process === 'running').map((x) => x.project.id)
}
/** 체크한 세션 중 실행 중인 것에만 같은 지시를 보낸다. 꺼진 세션은 건너뛴다 */
const sendBulk = (text: string): void => {
  const t = text.trim()
  const targets = runningChecked.value
  if (!t || !targets.length) return
  for (const x of targets) cmd.prompt(x.project.id, t)
  const skipped = checkedIds.value.length - targets.length
  notify.toast({
    level: 'info',
    title: `${targets.length}개 세션에 지시를 보냈습니다`,
    body: skipped > 0 ? `꺼져 있는 ${skipped}개 세션은 건너뛰었습니다` : undefined
  })
  bulkDraft.value = ''
}

/* ───────────── 순서 변경 ───────────── */

const dragId = ref<string>()
const overId = ref<string>()
const dragBelow = ref(false)

const onDragStart = (e: DragEvent, id: string): void => {
  dragId.value = id
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
const onDragOver = (e: DragEvent, id: string): void => {
  if (!dragId.value) return
  e.preventDefault()
  overId.value = id
  const ids = cmd.sessionList.value.map((x) => x.project.id)
  dragBelow.value = ids.indexOf(dragId.value) < ids.indexOf(id)
}
const onDrop = (id: string): void => {
  const from = dragId.value
  dragId.value = overId.value = undefined
  if (!from) return
  cmd.moveProjectBefore(from, id).catch((err: Error) => notify.toast({ level: 'warning', title: '순서를 바꾸지 못했습니다', body: err.message }))
}

const focusRow = (id: string): void => {
  listEl.value?.querySelector<HTMLButtonElement>(`[data-project="${CSS.escape(id)}"]`)?.focus()
}

// 선택된 줄의 배경은 줄마다 칠하지 않고 하나의 마커가 줄 사이를 미끄러져 이동한다
const markerStyle = ref({ transform: 'translateY(0)', height: '0px', opacity: 0 })
const markerReady = ref(false)

const placeMarker = (): void => {
  const id = cmd.terminalTarget.value?.project.id
  const row = id ? listEl.value?.querySelector<HTMLElement>(`[data-project="${CSS.escape(id)}"]`)?.closest('li') : undefined
  if (!row) {
    markerStyle.value = { ...markerStyle.value, opacity: 0 }
    return
  }
  markerStyle.value = { transform: `translateY(${row.offsetTop}px)`, height: `${row.offsetHeight}px`, opacity: 1 }
  // 첫 배치는 위에서 흘러내려오지 않도록 트랜지션 없이 놓고, 다음 프레임부터 애니메이션을 켠다
  if (!markerReady.value) requestAnimationFrame(() => (markerReady.value = true))
}

const onKeydown = (e: KeyboardEvent): void => {
  if ((e.target as HTMLElement).closest('input')) return
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const ids = cmd.sessionList.value.map((x) => x.project.id)
  const current = ids.indexOf(cmd.terminalTarget.value?.project.id ?? '')
  e.preventDefault()
  if (e.altKey && current >= 0) {
    const id = ids[current]!
    cmd.moveProject(id, e.key === 'ArrowUp' ? 'up' : 'down').then(() => nextTick(() => focusRow(id)))
    return
  }
  const next = e.key === 'ArrowDown' ? Math.min(ids.length - 1, current + 1) : Math.max(0, current - 1)
  cmd.selectedId.value = ids[next]!
  focusRow(ids[next]!)
}

watch(
  [() => cmd.terminalTarget.value?.project.id, () => cmd.sessionList.value.map((x) => x.project.id).join('|'), bulkMode],
  () => nextTick(placeMarker),
  { flush: 'post', immediate: true }
)
</script>

<style scoped lang="scss">
.side {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--rule);
  background: var(--ink-1);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 18px 12px;
  h1 {
    margin: 0;
    font-size: 1.12rem;
    font-weight: 760;
    font-stretch: 118%;
    letter-spacing: -0.01em;
  }
}
.mark {
  width: 24px;
  height: 24px;
}
.demo {
  padding: 0 7px;
  border: 1px solid var(--thinking);
  border-radius: 999px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--thinking);
}

.search {
  @include pressable;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 14px;
  padding: 7px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--ink-0);
  color: var(--text-3);
  font-size: var(--fs-sm);
  text-align: left;
  &:hover {
    border-color: var(--rule-strong);
    color: var(--text-2);
  }
  kbd {
    margin-left: auto;
  }
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin: 10px 14px 4px;
  div {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 5px;
    padding: 3px 0;
    border-radius: var(--r-sm);
  }
  dt {
    font-size: var(--fs-xs);
    color: var(--text-3);
  }
  dd {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 700;
  }
  .alarm {
    background: var(--approval-wash);
    dt,
    dd {
      color: var(--approval);
    }
  }
}

.sect {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px 6px 18px;
  h2 {
    margin: 0 auto 0 0;
    font-size: var(--fs-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-3);
  }
}
.icon-btn {
  @include pressable;
  display: inline-grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-2);
  &:hover,
  &[aria-pressed='true'] {
    background: var(--ink-2);
    border-color: var(--rule-strong);
    color: var(--text);
  }
}

.bulk {
  display: grid;
  gap: 6px;
  margin: 0 14px 8px;
  padding: 10px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--ink-0);
}
.bulk-count {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-2);
}
.link {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--focus);
  font-size: var(--fs-xs);
}
.bulk-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-1);
  font-size: var(--fs-sm);
  &:focus-visible {
    @include focus-ring;
  }
}
.bulk-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  @include pressable;
  padding: 1px 8px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  background: transparent;
  font-size: var(--fs-xs);
  color: var(--text-2);
  &:hover:not(:disabled) {
    background: var(--ink-2);
    color: var(--text);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// 순서가 바뀌면 줄이 제자리로 미끄러지듯 이동하고(FLIP), 추가·삭제는 살짝 밀려 나타나고 사라진다
// .folders li 규칙(position·margin)보다 우선하도록 자식 선택자로 올린다
.folders > .marker {
  position: absolute;
  inset: 0 10px auto;
  margin: 0;
  border-radius: var(--r-md);
  background: var(--ink-3);
  pointer-events: none;
  &.ready {
    transition:
      transform var(--dur-spring) var(--spring),
      height var(--dur) var(--ease-out),
      opacity var(--dur-fast) var(--ease-out);
  }
}
.flip-move {
  transition: transform var(--dur-spring) var(--spring);
}
.flip-enter-active,
.flip-leave-active {
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
.flip-enter-from,
.flip-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
.flip-leave-active {
  position: absolute;
  left: 10px;
  right: 10px;
}
.folders {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 0 10px;
  list-style: none;
  li {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
    border-radius: var(--r-md);
    &.dragging {
      opacity: 0.4;
    }
    // 놓일 자리: 아래로 끌면 대상 아래, 위로 끌면 대상 위에 선을 긋는다
    &.over::after {
      content: '';
      position: absolute;
      left: 8px;
      right: 8px;
      top: -2px;
      height: 2px;
      border-radius: 1px;
      background: var(--focus);
    }
    &.over.below::after {
      top: auto;
      bottom: -2px;
    }
  }
}
.pick {
  flex: none;
  width: 16px;
  height: 16px;
  margin-left: 4px;
  accent-color: var(--focus);
}

.empty {
  flex: 1;
  padding: 8px 18px;
  font-size: var(--fs-sm);
  color: var(--text-3);
  p {
    margin: 0 0 12px;
  }
}
.primary {
  @include pressable;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--r-sm);
  background: var(--text);
  color: var(--ink-0);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.hint {
  margin: 0;
  padding: 6px 18px 10px;
  font-size: var(--fs-xs);
  color: var(--text-3);
  kbd {
    margin-right: 2px;
  }
}

.quota {
  display: grid;
  gap: 10px;
  padding: 14px 18px 12px;
  border-top: 1px solid var(--rule);
  font-size: var(--fs-sm);
}
.today {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  color: var(--text-3);
  strong {
    color: var(--text);
    font-size: var(--fs-lg);
  }
  .cost {
    color: var(--text-2);
  }
  .plan {
    margin-left: auto;
    color: var(--text-2);
    font-weight: 600;
  }
}
.warn {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--executing);
}

.foot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--rule);
}
.conn,
.ghost {
  @include pressable;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  font-size: var(--fs-xs);
  color: var(--text-2);
  &:hover:not(:disabled) {
    background: var(--ink-2);
    color: var(--text);
  }
}
.conn {
  margin-right: auto;
  &:disabled {
    cursor: default;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ok);
  }
  &.connecting .dot {
    background: var(--executing);
    animation: blink 1s steps(2) infinite;
  }
  &.closed {
    color: var(--approval);
    .dot {
      background: var(--approval);
    }
  }
}
.theme-btn {
  width: 30px;
  justify-content: center;
  padding: 0;
}

// 좁은 화면에서는 폴더 목록이 위로 올라가므로 한도·도움말은 접는다 (명령창에서 다룰 수 있다)
@media (max-width: $bp-mid) {
  .side {
    border-right: 0;
    border-bottom: 1px solid var(--rule);
  }
  .quota,
  .hint,
  .stats {
    display: none;
  }
}

@keyframes blink {
  50% {
    opacity: 0.2;
  }
}
</style>
