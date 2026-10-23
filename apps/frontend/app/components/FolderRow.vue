<template>
  <button
    class="row"
    :class="[s.tone.value, { active, done: s.unseenDone.value }]"
    type="button"
    :aria-current="active ? 'true' : undefined"
    :data-project="item.project.id"
    @click="emit('select')"
  >
    <StatusPulse class="pulse" :status="s.status.value" :offline="!s.running.value" />
    <span class="name">{{ item.project.name }}</span>
    <span v-if="badge" class="badge">{{ badge }}</span>
    <span v-else class="tok">{{ formatTokens(s.tokens.value) }}</span>
    <span class="sub">
      <span class="st">{{ s.label.value }}</span>
      <template v-if="s.running.value">
        <span v-if="item.session?.activeTool && s.status.value !== 'IDLE'">· {{ item.session.activeTool }}</span>
        <span v-if="s.elapsed.value">· {{ s.elapsed.value }}</span>
      </template>
      <span v-else class="path">· {{ shortPath(item.project.cwd) }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import type { SessionItem } from '~/composables/useCommander'

/** 사이드바의 프로젝트 폴더 한 줄: 상태 펄스, 이름, 오늘 토큰(또는 승인·답변 배지), 상태 요약 */
const props = defineProps<{ item: SessionItem; active: boolean }>()
const emit = defineEmits<{ select: [] }>()

const s = useSessionState(() => props.item)
const badge = computed(() => {
  if (!s.running.value) return ''
  if (s.status.value === 'REQUIRES_APPROVAL') return '승인'
  if (s.status.value === 'ASKING') return '답변'
  return ''
})
</script>

<style scoped lang="scss">
.row {
  --c: var(--idle);
  @include pressable;
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 10px;
  row-gap: 1px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  text-align: left;
  &:hover {
    background: var(--ink-2);
  }
  &:active:not(:disabled) {
    transform: scale(0.99);
  }

  &.active {
    background: var(--ink-3);
    &::before {
      content: '';
      position: absolute;
      left: -10px;
      top: 8px;
      bottom: 8px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: var(--c);
    }
  }

  &.offline {
    --c: var(--text-3);
  }
  &.idle {
    --c: var(--idle);
  }
  &.thinking {
    --c: var(--thinking);
  }
  &.executing {
    --c: var(--executing);
  }
  &.approval {
    --c: var(--approval);
  }
  &.asking {
    --c: var(--asking);
  }
  &.done {
    --c: var(--ok);
  }
}

.pulse {
  justify-self: center;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.tok {
  font-family: var(--font-code);
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.badge {
  padding: 0 7px;
  border-radius: 999px;
  background: var(--c);
  color: var(--ink-0);
  font-size: var(--fs-xs);
  font-weight: 700;
  line-height: 1.5;
}

.sub {
  grid-column: 2 / 4;
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.st {
  flex: none;
  font-weight: 600;
  color: var(--c);
  .offline & {
    color: var(--text-3);
  }
}
.path {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
