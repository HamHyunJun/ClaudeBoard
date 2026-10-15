<template>
  <section class="rack" aria-labelledby="rack-title" @keydown="onKeydown">
    <header class="rack-head">
      <h2 id="rack-title">세션</h2>
      <p class="hint">
        <kbd>↑</kbd><kbd>↓</kbd> 이동 <kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd> 순서 변경 <kbd>t</kbd> 터미널 <kbd>/</kbd> 지시하기
      </p>
      <button class="add" type="button" @click="emit('add')">프로젝트 추가</button>
    </header>

    <ol v-if="cmd.sessionList.value.length" ref="listEl" class="list">
      <li v-for="item in cmd.sessionList.value" :key="item.project.id">
        <SessionStrip
          :ref="(el) => setStrip(item.project.id, el)"
          :project="item.project"
          :session="item.session"
          :usage="usageById[item.project.id]"
          :selected="cmd.selectedId.value === item.project.id"
          :hog-threshold="hogThreshold"
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
import SessionStrip from './SessionStrip.vue'

/** 세션 스트립 묶음. ↑/↓ 로 스트립 사이를 이동하고 t 로 터미널, / 로 프롬프트에 포커스한다. */
const emit = defineEmits<{ add: [] }>()
const cmd = useCommander()
// v-for 의 ref 배열은 순서가 보장되지 않으므로 프로젝트 id 로 보관
const strips = new Map<string, InstanceType<typeof SessionStrip>>()
function setStrip(id: string, el: unknown) {
  if (el) strips.set(id, el as InstanceType<typeof SessionStrip>)
  else strips.delete(id)
}
const listEl = ref<HTMLOListElement>()

const usageById = computed(() => {
  const map: Record<string, NonNullable<typeof cmd.usage.value>['projects'][number]> = {}
  for (const p of cmd.usage.value?.projects ?? []) if (p.projectId) map[p.projectId] = p
  return map
})
const hogThreshold = computed(() => (cmd.demo.value ? 300_000 : 400_000))

function select(id: string) {
  cmd.selectedId.value = cmd.selectedId.value === id ? null : id
}

function focusStrip(id: string) {
  listEl.value?.querySelector<HTMLButtonElement>(`[data-project="${CSS.escape(id)}"] .ident`)?.focus()
}

function onKeydown(e: KeyboardEvent) {
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
  focusPrompt(id: string) {
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

.list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0 0 28px;
  list-style: none;
  overflow-y: auto;
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
