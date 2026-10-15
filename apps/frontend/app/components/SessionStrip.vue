<template>
  <article
    class="strip"
    :class="[running ? STATUS_CLASS[status] : 'offline', { selected, hot, done: unseenDone }]"
    :aria-labelledby="nameId"
    :data-project="project.id"
    @click="onBoxClick($event, 'select')"
    @dblclick="onBoxClick($event, 'open')"
  >
    <span class="rail" aria-hidden="true" />

    <div class="main">
      <button
        :id="nameId"
        class="ident"
        type="button"
        :aria-expanded="selected"
        :aria-controls="detailId"
        @click="emit('select')"
        @dblclick="emit('open')"
      >
        <span class="name">{{ project.name }}</span>
        <span class="path">{{ shortPath(project.cwd) }}</span>
      </button>

      <div class="state">
        <StatusPulse :status="status" :offline="!running" />
        <span class="state-label">{{ statusLabel }}</span>
        <span v-if="session?.activeTool && running && status !== 'IDLE'" class="tool">{{ session.activeTool }}</span>
        <span v-if="elapsed" class="elapsed">{{ elapsed }}</span>
        <ul v-if="session?.git?.length" class="git" aria-label="git 상태">
          <li v-for="g in session.git" :key="g.branch" class="repo">
            <span class="branch" :title="g.branch">{{ g.branch }}</span>
            <span v-for="c in gitCounts(g)" :key="c.label" class="chg" :class="c.cls" :title="`${c.label} ${c.n}개`">
              {{ c.sym }}{{ c.n }}
            </span>
            <span v-if="!gitCounts(g).length" class="chg clean" title="변경 없음">깨끗함</span>
          </li>
        </ul>
      </div>

      <WorkflowTrack
        class="wf"
        :workflow="session?.workflow ?? { stage: null, percent: 0, source: 'none' }"
        :status="status"
        :busy-since="running ? session?.busySince : undefined"
      />

      <div class="tokens" :title="hot ? '최근 5분 토큰 사용량이 급증했습니다' : undefined">
        <span class="tok-num">{{ formatTokens(usage ? usage.today.input + usage.today.output + usage.today.cacheWrite + usage.today.cacheRead : 0) }}</span>
        <span class="tok-cost">{{ formatCost(usage?.todayCost ?? 0) }}</span>
        <Sparkline :values="usage?.sparkline ?? []" :hot="hot" :label="`${project.name} 최근 30분 토큰 추이`" />
      </div>

      <div class="actions">
        <button v-if="!running" class="btn primary" type="button" @click="cmd.start(project.id)">시작</button>
        <button v-else class="btn" type="button" :aria-label="`${project.name} 터미널 열기`" @click="emit('open')">
          터미널
        </button>
      </div>

      <p class="activity" :class="{ muted: !activity }">
        <template v-if="session?.error">{{ session.error }}</template>
        <template v-else>{{ activity ?? (running ? '출력을 기다리는 중' : '세션이 꺼져 있습니다. 시작하면 이 디렉터리에서 Claude Code가 실행됩니다.') }}</template>
      </p>
    </div>

    <div :id="detailId" class="detail" :inert="!selected">
      <div class="detail-inner">
        <form class="prompt" @submit.prevent="send(draft)">
          <label :for="`prompt-${project.id}`" class="sr-only">{{ project.name }}에 보낼 프롬프트</label>
          <input
            :id="`prompt-${project.id}`"
            ref="promptInput"
            v-model="draft"
            class="prompt-input"
            type="text"
            autocomplete="off"
            :placeholder="running ? `${project.name}에 지시하기` : '세션을 시작한 뒤 지시할 수 있습니다'"
            :disabled="!running"
            @keydown.esc="($event.target as HTMLInputElement).blur()"
          />
          <button class="btn primary" type="submit" :disabled="!running || !draft.trim()">보내기</button>
        </form>
        <div class="quick" role="group" :aria-label="`${project.name} 퀵 액션`">
          <button
            v-for="qa in quickActions"
            :key="qa.label"
            class="chip"
            type="button"
            :disabled="!running"
            :title="qa.prompt"
            @click="send(qa.prompt)"
          >
            {{ qa.label }}
          </button>
          <span class="spacer" />
          <button
            ref="moreBtn"
            class="more"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            :aria-controls="menuId"
            :aria-label="`${project.name} 더보기`"
            @click="toggleMenu"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <circle cx="3" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="13" cy="8" r="1.4" />
            </svg>
          </button>
          <div :id="menuId" ref="menuEl" class="menu" popover role="menu" :aria-label="`${project.name} 더보기 메뉴`" @toggle="onMenuToggle" @keydown="onMenuKeydown">
            <button class="mi" type="button" role="menuitem" @click="act(() => move('top'))">맨 위로</button>
            <button class="mi" type="button" role="menuitem" @click="act(() => move('up'))">위로 이동</button>
            <button class="mi" type="button" role="menuitem" @click="act(() => move('down'))">아래로 이동</button>
            <hr class="sep" />
            <button class="mi" type="button" role="menuitem" @click="act(() => (cmd.openTargetId.value = project.id))">폴더 열기</button>
            <template v-if="running">
              <button class="mi" type="button" role="menuitem" @click="act(() => cmd.restart(project.id))">재시작</button>
              <button class="mi danger" type="button" role="menuitem" @click="act(() => cmd.stop(project.id))">중지</button>
            </template>
            <hr class="sep" />
            <button
              class="mi danger"
              :class="{ armed: confirmRemove }"
              type="button"
              role="menuitem"
              :aria-label="`${project.name} 세션 삭제`"
              @click="removeSession"
              @blur="confirmRemove = false"
            >
              {{ confirmRemove ? '정말 삭제?' : '삭제' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { GitRepoState, ProjectConfig, ProjectUsage, SessionSnapshot } from '@claudeboard/shared'
import { DEFAULT_QUICK_ACTIONS } from '@claudeboard/shared'
import type { DeepReadonly } from 'vue'

/**
 * 관제탑의 "비행 진행 스트립" 한 장 = Claude Code 세션 하나.
 * 왼쪽 상태 레일, 이름·경로, 상태, 워크플로우 트랙, 토큰, 동작이 한 줄에 놓이고
 * 선택하면 프롬프트 입력과 퀵 액션이 아래로 펼쳐진다.
 */
const props = defineProps<{
  project: DeepReadonly<ProjectConfig>
  session?: DeepReadonly<SessionSnapshot>
  usage?: DeepReadonly<ProjectUsage>
  selected: boolean
  hogThreshold: number
}>()
const emit = defineEmits<{ select: []; open: [] }>()

const cmd = useCommander()
const now = useNow()

const draft = ref('')
const promptInput = ref<HTMLInputElement>()

// 실수로 지우지 않도록 두 번 눌러야 삭제: 첫 클릭은 확인 상태로 전환, 3초 뒤 자동 해제
const confirmRemove = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | undefined

// 더보기 메뉴: 팝오버(최상위 레이어)라 펼침 영역의 overflow 에 잘리지 않는다. 위치는 버튼 기준으로 직접 잡는다
const moreBtn = ref<HTMLButtonElement>()
const menuEl = ref<HTMLElement>()
const menuOpen = ref(false)

const GIT_CHANGES = [
  { key: 'staged', sym: '+', label: '스테이징됨', cls: 'ok' },
  { key: 'modified', sym: '±', label: '수정됨', cls: 'warn' },
  { key: 'untracked', sym: '●', label: '추적 안 됨', cls: 'info' },
  { key: 'ahead', sym: '↑', label: '푸시 안 한 커밋', cls: 'info' },
  { key: 'behind', sym: '↓', label: '받아야 할 커밋', cls: 'warn' }
] as const

onBeforeUnmount(() => clearTimeout(confirmTimer))

const running = computed(() => props.session?.process === 'running' || props.session?.process === 'starting')
const status = computed(() => props.session?.status ?? 'IDLE')
// 명령을 내려 끝난 뒤 아직 확인하지 않은 대기. 명령 없이 그냥 대기 중인 세션과 구분한다
const unseenDone = computed(() => {
  const at = props.session?.finishedAt
  return !!at && running.value && status.value === 'IDLE' && at > (cmd.seenDoneAt.value[props.project.id] ?? 0)
})
const statusLabel = computed(() => {
  const p = props.session?.process
  if (!p || p === 'stopped') return '꺼짐'
  if (p === 'starting') return '시작 중'
  if (p === 'exited') return '종료됨'
  if (p === 'error') return '실행 실패'
  return unseenDone.value ? '완료 · 확인 대기' : STATUS_LABEL[status.value]
})
const elapsed = computed(() => (props.session && running.value ? formatElapsed(now.value - props.session.statusSince) : ''))
const hot = computed(() => (props.usage?.last5m ?? 0) >= props.hogThreshold)
const quickActions = computed(() => props.project.quickActions?.length ? props.project.quickActions : DEFAULT_QUICK_ACTIONS)
const nameId = computed(() => `strip-${props.project.id}`)
const detailId = computed(() => `strip-detail-${props.project.id}`)
const menuId = computed(() => `strip-menu-${props.project.id}`)

// 터미널 출력 앞의 장식 기호(⏺ ● ⎿ > 등)는 대시보드에서 의미가 없으므로 걷어낸다
const activity = computed(() => props.session?.lastLine?.replace(/^[\s⏺●○⎿✻✢✶·>│┃*-]+/u, '').trim() || undefined)

async function removeSession(): Promise<void> {
  if (!confirmRemove.value) {
    confirmRemove.value = true
    confirmTimer = setTimeout(() => (confirmRemove.value = false), 3000)
    return
  }
  clearTimeout(confirmTimer)
  confirmRemove.value = false
  menuEl.value?.hidePopover()
  try {
    await cmd.removeProject(props.project.id)
  } catch (err) {
    useNotify().toast({ level: 'warning', title: (err as Error).message })
  }
}

// 박스의 빈 곳을 눌러도 이름을 누른 것과 같게 동작한다 (버튼·입력 등 자체 동작이 있는 요소는 제외)
function onBoxClick(e: MouseEvent, action: 'select' | 'open'): void {
  if ((e.target as HTMLElement).closest('button, input, a, form, [role=group], [role=menu]')) return
  if (action === 'select') emit('select')
  else emit('open')
}
function toggleMenu(): void {
  const menu = menuEl.value
  const btn = moreBtn.value
  if (!menu || !btn) return
  if (menu.matches(':popover-open')) return menu.hidePopover()
  menu.showPopover()
  const r = btn.getBoundingClientRect()
  const { width, height } = menu.getBoundingClientRect()
  const below = r.bottom + 6 + height <= window.innerHeight
  menu.style.left = `${Math.max(8, r.right - width)}px`
  menu.style.top = `${below ? r.bottom + 6 : r.top - 6 - height}px`
  menu.querySelector<HTMLElement>('[role=menuitem]')?.focus()
}
function onMenuToggle(e: Event): void {
  menuOpen.value = (e as ToggleEvent).newState === 'open'
  if (!menuOpen.value) confirmRemove.value = false
}
function onMenuKeydown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  e.stopPropagation() // 랙의 세션 간 이동 단축키와 겹치지 않게
  const items = [...(menuEl.value?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
  const i = items.indexOf(document.activeElement as HTMLElement)
  items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
}
function act(fn: () => unknown): void {
  menuEl.value?.hidePopover()
  fn()
}

function move(to: 'up' | 'down' | 'top'): void {
  cmd.moveProject(props.project.id, to).catch((err: Error) =>
    useNotify().toast({ level: 'warning', title: err.message })
  )
}

function send(text: string): void {
  const t = text.trim()
  if (!t) return
  cmd.prompt(props.project.id, t)
  draft.value = ''
}
const gitCounts = (g: GitRepoState): Array<(typeof GIT_CHANGES)[number] & { n: number }> =>
  GIT_CHANGES.filter((c) => g[c.key] > 0).map((c) => ({ ...c, n: g[c.key] }))

defineExpose({ focusPrompt: () => promptInput.value?.focus() })
</script>

<style scoped lang="scss">
.strip {
  --c: var(--idle);
  --wash: transparent;
  position: relative;
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  // 터미널 패널 개폐로 폭이 바뀌므로 뷰포트가 아니라 스트립 폭 기준으로 배치를 바꾼다
  container-type: inline-size;
  min-width: 0;
  background: var(--ink-1);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  box-shadow: 0 1px 2px var(--shadow-soft);
  transition:
    border-color var(--dur) var(--ease-out),
    background-color var(--dur) var(--ease-out);

  cursor: pointer;
  &:hover {
    border-color: var(--rule-strong);
  }
  &.selected {
    background: var(--ink-2);
    border-color: var(--rule-strong);
  }

  &.offline {
    --c: var(--rule-strong);
  }
  &.idle {
    --c: var(--idle);
  }
  &.thinking {
    --c: var(--thinking);
    --wash: var(--thinking-wash);
  }
  &.executing {
    --c: var(--executing);
    --wash: var(--executing-wash);
  }
  &.done {
    --c: var(--ok);
    --wash: var(--ok-wash);
    border-color: color-mix(in srgb, var(--ok) 45%, var(--rule));
  }
  &.asking {
    --c: var(--asking);
    --wash: var(--asking-wash);
    border-color: color-mix(in srgb, var(--asking) 55%, var(--rule));
  }
  &.approval {
    --c: var(--approval);
    --wash: var(--approval-wash);
    border-color: color-mix(in srgb, var(--approval) 55%, var(--rule));
  }
}

.rail {
  grid-row: 1 / span 2;
  border-radius: var(--r-md) 0 0 var(--r-md);
  background: var(--c);
  transition: background-color var(--dur) var(--ease-out);
}

.main {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.8fr) minmax(0, 1.6fr) 110px auto;
  grid-template-areas:
    'ident state wf tokens actions'
    'activity activity activity activity activity';
  align-items: center;
  column-gap: 28px;
  row-gap: 10px;
  padding: 18px 22px 16px 20px;
  // 상태색이 아주 옅게 스트립 왼쪽에서 번진다
  background: linear-gradient(90deg, var(--wash), transparent 45%);
  border-radius: 0 var(--r-md) 0 0;
}

.ident {
  grid-area: ident;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
  padding: 2px 4px;
  margin: -2px -4px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  text-align: left;
}
.name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-lg);
  font-weight: 650;
  letter-spacing: -0.01em;
}
.path {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.state {
  grid-area: state;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
}
.state-label {
  font-weight: 600;
  color: var(--c);
  .offline & {
    color: var(--text-3);
  }
}
.tool {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--ink-3);
  font-size: var(--fs-xs);
  color: var(--text-2);
}
.elapsed {
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.wf {
  grid-area: wf;
}

.tokens {
  grid-area: tokens;
  display: grid;
  grid-template-columns: auto auto;
  justify-content: end;
  align-items: baseline;
  column-gap: 8px;
  row-gap: 3px;
  text-align: right;
  :deep(.spark) {
    grid-column: 1 / -1;
    justify-self: end;
  }
}
.tok-num {
  font-weight: 650;
  .hot & {
    color: var(--executing);
  }
}
.tok-cost {
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.actions {
  grid-area: actions;
  display: flex;
  justify-content: flex-end;
}

.activity {
  grid-area: activity;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-md);
  color: var(--text-2);
  &.muted {
    color: var(--text-3);
  }
}

.git {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  margin: 0 0 0 4px;
  padding: 0;
  list-style: none;
  font-size: var(--fs-sm);
}
.repo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--idle-wash);
  color: var(--text-2);
}
.branch {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--text);
}
.chg {
  flex: none;
  font-variant-numeric: tabular-nums;
  &.ok { color: var(--ok); }
  &.warn { color: var(--executing); }
  &.info { color: var(--text-2); }
  &.clean { color: var(--text-3); }
}

// 선택 시 펼쳐지는 영역: grid-template-rows 0fr → 1fr 로 높이를 자연스럽게 애니메이션
.detail {
  grid-column: 2;
  min-width: 0;
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-spring) var(--spring);
  .selected & {
    grid-template-rows: 1fr;
  }
}
.detail-inner {
  min-height: 0;
  overflow: hidden;
}

.prompt {
  display: flex;
  min-width: 0;
  gap: 8px;
  padding: 4px 22px 12px 20px;
}
.prompt-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-0);
  font-size: var(--fs-md);
  transition: border-color var(--dur-fast) var(--ease-out);
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

.quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 22px 18px 20px;
}
.spacer {
  flex: 1;
}

.more {
  @include pressable;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  fill: currentColor;
  &:hover,
  &[aria-expanded='true'] {
    background: var(--ink-3);
    color: var(--text);
  }
}

.menu {
  position: fixed;
  inset: auto;
  margin: 0;
  min-width: 168px;
  padding: 6px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--ink-1);
  color: var(--text);
  box-shadow: 0 12px 32px var(--shadow-soft);
  // 열릴 때 살짝 커지며 나타난다
  opacity: 0;
  transform: scale(0.96);
  transform-origin: top right;
  transition:
    opacity 140ms var(--ease-out),
    transform 140ms var(--ease-out),
    overlay 140ms allow-discrete,
    display 140ms allow-discrete;
  &:popover-open {
    opacity: 1;
    transform: scale(1);
    @starting-style {
      opacity: 0;
      transform: scale(0.96);
    }
  }
}
.mi {
  @include pressable;
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  font-size: var(--fs-sm);
  text-align: left;
  color: var(--text);
  &:hover,
  &:focus-visible {
    background: var(--ink-3);
  }
  &.danger {
    color: var(--approval);
  }
  &.armed {
    background: var(--approval-wash);
    font-weight: 600;
  }
}
.sep {
  height: 1px;
  margin: 4px 6px;
  border: 0;
  background: var(--rule);
}

.btn {
  @include pressable;
  height: 38px;
  padding: 0 18px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  &:hover:not(:disabled) {
    background: var(--ink-3);
  }
  &.primary {
    border-color: transparent;
    background: var(--text);
    color: var(--ink-0);
    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--text) 82%, var(--ink-1));
    }
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.chip {
  @include pressable;
  height: 32px;
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
  &.ghost {
    border-color: transparent;
  }
  &.danger:hover:not(:disabled),
  &.danger.armed {
    color: var(--approval);
  }
  &.danger.armed {
    border-color: var(--approval);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

// 스트립 폭 기준 반응형 (터미널을 열면 랙이 ~500px 까지 좁아진다)
@container (max-width: 760px) {
  .main {
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) 100px auto;
    grid-template-areas:
      'ident state tokens actions'
      'wf wf wf wf'
      'activity activity activity activity';
  }
}

@container (max-width: 520px) {
  .main {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'ident actions'
      'state tokens'
      'wf wf'
      'activity activity';
    column-gap: 12px;
  }
  .tokens :deep(.spark) {
    display: none;
  }
  // 좁으면 퀵 액션 칩은 한 줄 가로 스크롤 대신 줄바꿈, 지시 입력은 버튼 아래로
  .prompt {
    flex-wrap: wrap;
  }
  .prompt-input {
    flex-basis: 100%;
  }
  .prompt .btn {
    flex: 1;
  }
}
</style>
