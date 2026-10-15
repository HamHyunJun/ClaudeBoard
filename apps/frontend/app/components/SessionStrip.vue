<script setup lang="ts">
import type { ProjectConfig, ProjectUsage, SessionSnapshot } from '@claudeboard/shared'
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

const running = computed(() => props.session?.process === 'running' || props.session?.process === 'starting')
const status = computed(() => props.session?.status ?? 'IDLE')
const statusLabel = computed(() => {
  const p = props.session?.process
  if (!p || p === 'stopped') return '꺼짐'
  if (p === 'starting') return '시작 중'
  if (p === 'exited') return '종료됨'
  if (p === 'error') return '실행 실패'
  return STATUS_LABEL[status.value]
})
const elapsed = computed(() => (props.session && running.value ? formatElapsed(now.value - props.session.statusSince) : ''))
const hot = computed(() => (props.usage?.last5m ?? 0) >= props.hogThreshold)
const quickActions = computed(() => props.project.quickActions?.length ? props.project.quickActions : DEFAULT_QUICK_ACTIONS)
const nameId = computed(() => `strip-${props.project.id}`)
const detailId = computed(() => `strip-detail-${props.project.id}`)

// 실수로 지우지 않도록 두 번 눌러야 삭제: 첫 클릭은 확인 상태로 전환, 3초 뒤 자동 해제
const confirmRemove = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | undefined
async function removeSession() {
  if (!confirmRemove.value) {
    confirmRemove.value = true
    confirmTimer = setTimeout(() => (confirmRemove.value = false), 3000)
    return
  }
  clearTimeout(confirmTimer)
  confirmRemove.value = false
  try {
    await cmd.removeProject(props.project.id)
  } catch (err) {
    useNotify().toast({ level: 'warning', title: (err as Error).message, projectId: props.project.id })
  }
}
onBeforeUnmount(() => clearTimeout(confirmTimer))

// 박스의 빈 곳을 눌러도 이름을 누른 것과 같게 동작한다 (버튼·입력 등 자체 동작이 있는 요소는 제외)
function onBoxClick(e: MouseEvent, action: 'select' | 'open') {
  if ((e.target as HTMLElement).closest('button, input, a, form, [role=group]')) return
  if (action === 'select') emit('select')
  else emit('open')
}

function send(text: string) {
  const t = text.trim()
  if (!t) return
  cmd.prompt(props.project.id, t)
  draft.value = ''
}

defineExpose({ focusPrompt: () => promptInput.value?.focus() })
</script>

<template>
  <article
    class="strip"
    :class="[running ? STATUS_CLASS[status] : 'offline', { selected, hot }]"
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
        <span class="path code">{{ shortPath(project.cwd) }}</span>
      </button>

      <div class="state">
        <StatusPulse :status="status" :offline="!running" />
        <span class="state-label">{{ statusLabel }}</span>
        <span v-if="session?.activeTool && running && status !== 'IDLE'" class="tool code">{{ session.activeTool }}</span>
        <span v-if="elapsed" class="elapsed">{{ elapsed }}</span>
      </div>

      <WorkflowTrack class="wf" :workflow="session?.workflow ?? { stage: null, percent: 0, source: 'none' }" :status="status" />

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

      <p class="activity code" :class="{ muted: !session?.lastLine }">
        <template v-if="session?.error">{{ session.error }}</template>
        <template v-else>{{ session?.lastLine ?? (running ? '출력을 기다리는 중' : '세션이 꺼져 있습니다. 시작하면 이 디렉터리에서 Claude Code가 실행됩니다.') }}</template>
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
          <button v-if="running" class="chip ghost" type="button" @click="cmd.restart(project.id)">재시작</button>
          <button v-if="running" class="chip ghost danger" type="button" @click="cmd.stop(project.id)">중지</button>
          <button
            class="chip ghost danger"
            :class="{ armed: confirmRemove }"
            type="button"
            :aria-label="`${project.name} 세션 삭제`"
            @click="removeSession"
            @blur="confirmRemove = false"
          >
            {{ confirmRemove ? '정말 삭제?' : '삭제' }}
          </button>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.strip {
  --c: var(--idle);
  --wash: transparent;
  position: relative;
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr);
  // 터미널 패널 개폐로 폭이 바뀌므로 뷰포트가 아니라 스트립 폭 기준으로 배치를 바꾼다
  container-type: inline-size;
  min-width: 0;
  background: var(--ink-1);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
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
  column-gap: 20px;
  row-gap: 6px;
  padding: 12px 14px 10px 14px;
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
  font-stretch: 92%;
  letter-spacing: -0.005em;
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
  padding: 0 5px;
  border-radius: 3px;
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
  font-size: var(--fs-sm);
  color: var(--text-2);
  &.muted {
    color: var(--text-3);
  }
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
  padding: 4px 14px 8px;
}
.prompt-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-0);
  font-family: var(--font-code);
  font-size: var(--fs-sm);
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
  padding: 0 14px 12px;
}
.spacer {
  flex: 1;
}

.btn {
  @include pressable;
  height: 34px;
  padding: 0 14px;
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
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-code);
  font-size: var(--fs-xs);
  color: var(--text-2);
  &:hover:not(:disabled) {
    border-color: var(--text-3);
    color: var(--text);
  }
  &.ghost {
    font-family: var(--font-ui);
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
