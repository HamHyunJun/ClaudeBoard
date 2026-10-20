<template>
  <section class="rack" aria-labelledby="rack-title" @keydown="onKeydown">
    <header class="rack-head">
      <h2 id="rack-title">세션</h2>
      <p class="hint">
        <kbd>↑</kbd><kbd>↓</kbd> 이동 <kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd> 순서 변경 <kbd>t</kbd> 터미널 <kbd>/</kbd> 지시하기
      </p>
      <button v-if="cmd.sessionList.value.length > 1" class="bulk-toggle" type="button" :aria-pressed="reorderMode" @click="reorderMode = !reorderMode">
        순서 변경
      </button>
      <button v-if="cmd.sessionList.value.length" class="bulk-toggle" type="button" :aria-pressed="bulkMode" @click="toggleBulk">
        일괄 지시
      </button>
      <button class="add" type="button" @click="emit('add')">프로젝트 추가</button>
    </header>

    <Transition name="bulk">
      <form v-if="bulkMode" class="bulk" aria-label="선택한 세션에 일괄 지시" @submit.prevent="sendBulk(bulkDraft)">
        <div class="bulk-top">
          <p class="bulk-count" aria-live="polite">
            <strong>{{ checkedCount }}</strong>개 선택 · 실행 중 <strong>{{ runningChecked.length }}</strong>개
          </p>
          <button class="link" type="button" @click="checkAllRunning">실행 중 모두 선택</button>
          <button class="link" type="button" :disabled="!checkedCount" @click="checkedIds = []">선택 해제</button>
        </div>
        <div class="bulk-row">
          <label for="bulk-input" class="sr-only">선택한 세션들에 보낼 지시</label>
          <input
            id="bulk-input"
            v-model="bulkDraft"
            class="bulk-input"
            type="text"
            autocomplete="off"
            :placeholder="runningChecked.length ? `${runningChecked.length}개 세션에 지시` : '세션을 선택하세요'"
            :disabled="!runningChecked.length"
          />
          <button class="send" type="submit" :disabled="!runningChecked.length || !bulkDraft.trim()">모두에게 보내기</button>
        </div>
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
    </Transition>

    <p v-if="reorderMode" class="reorder-note" role="status">세션을 끌어서 원하는 위치에 놓으세요.</p>

    <ol v-if="cmd.sessionList.value.length" ref="listEl" class="list" :class="{ reordering: reorderMode }">
      <li
        v-for="item in cmd.sessionList.value"
        :key="item.project.id"
        :draggable="reorderMode"
        :class="{ dragging: dragId === item.project.id, over: reorderMode && overId === item.project.id && dragId !== item.project.id, below: dragBelow }"
        @dragstart="onDragStart($event, item.project.id)"
        @dragover="onDragOver($event, item.project.id)"
        @drop.prevent="onDrop(item.project.id)"
        @dragend="dragId = overId = undefined"
      >
        <SessionStrip
          :ref="(el) => setStrip(item.project.id, el)"
          :project="item.project"
          :session="item.session"
          :usage="usageById[item.project.id]"
          :selected="cmd.selectedId.value === item.project.id"
          :hog-threshold="hogThreshold"
          :bulk="bulkMode"
          :checked="checkedIds.includes(item.project.id)"
          @check="toggleChecked(item.project.id)"
          @select="select(item.project.id)"
          @open="cmd.openTerminal(item.project.id)"
        />
      </li>
    </ol>

    <div v-else class="empty">
      <p class="empty-title">관제할 프로젝트가 없습니다</p>
      <p class="empty-body">
        Claude Code를 실행할 로컬 디렉터리를 추가하면 이곳에 세션이 한 줄씩 쌓입니다.
      </p>
      <button class="add big" type="button" @click="emit('add')">첫 프로젝트 추가</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { DEFAULT_QUICK_ACTIONS } from '@claudeboard/shared'
import SessionStrip from './SessionStrip.vue'

/** 세션 스트립 묶음. ↑/↓ 로 스트립 사이를 이동하고 t 로 터미널, / 로 프롬프트에 포커스한다. */
const emit = defineEmits<{ add: [] }>()

const cmd = useCommander()
const notify = useNotify()

// v-for 의 ref 배열은 순서가 보장되지 않으므로 프로젝트 id 로 보관
const strips = new Map<string, InstanceType<typeof SessionStrip>>()
const listEl = ref<HTMLOListElement>()
// 일괄 지시: 체크한 세션 id 와 보낼 문구
const bulkMode = ref(false)
const checkedIds = ref<string[]>([])
const bulkDraft = ref('')
// 순서 변경: 끌고 있는 세션과 그 아래로 지나가는 세션 id
const reorderMode = ref(false)
const dragId = ref<string>()
const overId = ref<string>()
const dragBelow = ref(false)

const usageById = computed(() => {
  const map: Record<string, NonNullable<typeof cmd.usage.value>['projects'][number]> = {}
  for (const p of cmd.usage.value?.projects ?? []) if (p.projectId) map[p.projectId] = p
  return map
})
const hogThreshold = computed(() => (cmd.demo.value ? 300_000 : 400_000))
// 삭제된 프로젝트가 남아 있어도 세지 않도록 현재 목록과 교차한다
const checkedItems = computed(() => cmd.sessionList.value.filter((x) => checkedIds.value.includes(x.project.id)))
const checkedCount = computed(() => checkedItems.value.length)
const runningChecked = computed(() => checkedItems.value.filter((x) => x.session?.process === 'running'))

const setStrip = (id: string, el: unknown): void => {
  if (el) strips.set(id, el as InstanceType<typeof SessionStrip>)
  else strips.delete(id)
}

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
  const skipped = checkedCount.value - targets.length
  notify.toast({
    level: 'info',
    title: `${targets.length}개 세션에 지시를 보냈습니다`,
    body: skipped ? `꺼져 있는 ${skipped}개 세션은 건너뛰었습니다` : undefined
  })
  bulkDraft.value = ''
}

const onDragStart = (e: DragEvent, id: string): void => {
  if (!reorderMode.value) return
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

const select = (id: string): void => {
  cmd.selectedId.value = cmd.selectedId.value === id ? null : id
}

const focusStrip = (id: string): void => {
  listEl.value?.querySelector<HTMLButtonElement>(`[data-project="${CSS.escape(id)}"] .ident`)?.focus()
}

const onKeydown = (e: KeyboardEvent): void => {
  const target = e.target as HTMLElement
  if (target.closest('input, textarea')) return
  const ids = cmd.sessionList.value.map((x) => x.project.id)
  if (!ids.length) return
  const current = cmd.selectedId.value ? ids.indexOf(cmd.selectedId.value) : -1
  if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && current >= 0) {
    e.preventDefault()
    const id = ids[current]!
    cmd.moveProject(id, e.key === 'ArrowUp' ? 'up' : 'down').then(() => nextTick(() => focusStrip(id)))
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const next = e.key === 'ArrowDown' ? Math.min(ids.length - 1, current + 1) : Math.max(0, current - 1)
    cmd.selectedId.value = ids[next]!
    focusStrip(ids[next]!)
  } else if (e.key === 't' && cmd.selectedId.value) {
    e.preventDefault()
    cmd.openTerminal(cmd.selectedId.value)
  } else if (e.key === '/' && current >= 0) {
    e.preventDefault()
    strips.get(ids[current]!)?.focusPrompt()
  }
}

defineExpose({
  focusPrompt(id: string): void {
    cmd.selectedId.value = id
    nextTick(() => setTimeout(() => strips.get(id)?.focusPrompt(), 60))
  }
})
</script>

<style scoped lang="scss">
.rack {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.rack-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 2px 12px;

  h2 {
    margin: 0;
    font-size: var(--fs-xl);
    font-weight: 700;
    font-stretch: 85%;
  }
}

.hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 auto 0 0;
  font-size: var(--fs-xs);
  color: var(--text-3);
  kbd {
    margin-left: 2px;
  }
}

.add {
  @include pressable;
  height: 32px;
  padding: 0 12px;
  border: 1px dashed var(--rule-strong);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-2);
  &:hover {
    border-style: solid;
    color: var(--text);
  }
  &.big {
    height: 40px;
    padding: 0 18px;
    border-style: solid;
    background: var(--text);
    color: var(--ink-0);
  }
}

.bulk-toggle {
  @include pressable;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-2);
  &:hover {
    color: var(--text);
    border-color: var(--text-3);
  }
  &[aria-pressed='true'] {
    border-color: transparent;
    background: var(--text);
    color: var(--ink-0);
  }
}

.bulk {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 14px 14px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--ink-1);
  box-shadow: 0 1px 2px var(--shadow-soft);
}
.bulk-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
}
.bulk-count {
  margin: 0 auto 0 0;
  white-space: nowrap;
  font-size: var(--fs-sm);
  color: var(--text-2);
  strong {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
}
.link {
  @include pressable;
  padding: 2px 4px;
  border: 0;
  background: none;
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-2);
  &:hover:not(:disabled) {
    color: var(--text);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
.bulk-row {
  display: flex;
  gap: 8px;
  min-width: 0;
}
.bulk-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-0);
  font-size: var(--fs-md);
  transition: border-color var(--dur-fast) var(--ease-out);
  @media (max-width: $bp-mid) {
    font-size: 16px;
  }
  &::placeholder {
    color: var(--text-3);
  }
  &:focus-visible {
    outline: none;
    border-color: var(--focus);
  }
  &:disabled {
    opacity: 0.55;
  }
}
.send {
  @include pressable;
  height: 40px;
  padding: 0 18px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: var(--text);
  color: var(--ink-0);
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 82%, var(--ink-1));
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
.bulk-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  @include pressable;
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  background: transparent;
  font-size: var(--fs-sm);
  color: var(--text-2);
  &:hover:not(:disabled) {
    border-color: var(--text-3);
    color: var(--text);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
.bulk-enter-active,
.bulk-leave-active {
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
.bulk-enter-from,
.bulk-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.reorder-note {
  margin: 0 2px 10px;
  font-size: var(--fs-sm);
  color: var(--text-2);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0 0 28px;
  list-style: none;
  overflow-y: auto;
}

.list li {
  position: relative;
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
// 순서 변경 중에는 스트립 안의 버튼·입력이 드래그를 가로채지 않게 한다
.reordering li {
  cursor: grab;
  :deep(.strip) {
    pointer-events: none;
  }
  &.dragging {
    opacity: 0.45;
    transform: scale(0.985);
    cursor: grabbing;
  }
  &.over::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -8px;
    height: 3px;
    border-radius: 2px;
    background: var(--focus);
  }
  &.over.below::after {
    top: auto;
    bottom: -8px;
  }
}

.empty {
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 48px 32px;
  border: 1px dashed var(--rule-strong);
  border-radius: var(--r-lg);
}
.empty-title {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: 650;
}
.empty-body {
  max-width: 46ch;
  margin: 0 0 8px;
  color: var(--text-2);
}

@media (max-width: $bp-narrow) {
  .hint {
    display: none;
  }
  .rack-head h2 {
    margin-right: auto;
  }
}
</style>
