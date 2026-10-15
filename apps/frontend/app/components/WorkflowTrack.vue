<script setup lang="ts">
import type { SessionStatus, WorkflowProgress } from '@claudeboard/shared'
import { WORKFLOW_STAGES } from '@claudeboard/shared'

/**
 * plan → execute → review → verify 4구간 트랙.
 * 각 구간은 진행률에 따라 채워지고, 실행 중이면 주황색 바가 흐른다.
 */
const props = defineProps<{ workflow: WorkflowProgress; status: SessionStatus; compact?: boolean }>()

const LABELS: Record<string, string> = { plan: '계획', execute: '실행', review: '검토', verify: '검증' }
// 백엔드 STAGE_BASE 와 같은 경계값
const BOUNDS = [0, 35, 65, 85, 100]

const segments = computed(() =>
  WORKFLOW_STAGES.map((stage, i) => {
    const lo = BOUNDS[i]!
    const hi = BOUNDS[i + 1]!
    const fill = Math.max(0, Math.min(1, (props.workflow.percent - lo) / (hi - lo)))
    const current = props.workflow.stage === stage && props.workflow.percent < 100
    return { stage, label: LABELS[stage]!, fill, current, done: fill >= 1 }
  })
)
const tone = computed(() => (props.status === 'EXECUTING' ? 'executing' : props.status === 'REQUIRES_APPROVAL' ? 'approval' : 'calm'))
const valueText = computed(() => {
  const w = props.workflow
  if (w.source === 'none') return '워크플로우 단계가 아직 감지되지 않았습니다'
  const stage = w.stage ? LABELS[w.stage] : '진행'
  const todos = w.todos ? `, 할 일 ${w.todos.done}/${w.todos.total}` : ''
  return `${stage} 단계, ${w.percent}%${todos}`
})
</script>

<template>
  <div
    class="track"
    :class="[tone, { compact, empty: workflow.source === 'none' }]"
    role="progressbar"
    aria-label="워크플로우 진행률"
    :aria-valuenow="workflow.percent"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuetext="valueText"
  >
    <div v-for="seg in segments" :key="seg.stage" class="seg" :class="{ current: seg.current, done: seg.done }">
      <div class="bar"><span class="fill" :style="{ transform: `scaleX(${seg.fill})` }" /></div>
      <span v-if="!compact" class="label">{{ seg.label }}</span>
    </div>
    <span v-if="!compact" class="pct">{{ workflow.source === 'none' ? '—' : `${workflow.percent}%` }}</span>
  </div>
</template>

<style scoped lang="scss">
.track {
  display: grid;
  grid-template-columns: repeat(4, 1fr) auto;
  align-items: end;
  gap: 4px;
  --fill: var(--text-2);

  &.compact {
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
  }
  &.executing {
    --fill: var(--executing);
  }
  &.approval {
    --fill: var(--approval);
  }
}

.seg {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.bar {
  position: relative;
  height: 4px;
  border-radius: 2px;
  background: var(--ink-3);
  overflow: hidden;
  .compact & {
    height: 3px;
  }
}

.fill {
  position: absolute;
  inset: 0;
  background: var(--fill);
  transform-origin: left;
  transition: transform 600ms var(--ease-out);
}

.done .fill {
  background: color-mix(in srgb, var(--fill) 55%, var(--ink-3));
}

// 실행 중인 현재 구간에는 빛이 흐르는 줄무늬
.executing .current .fill {
  background: linear-gradient(90deg, var(--executing) 0%, #ffc07a 50%, var(--executing) 100%);
  background-size: 200% 100%;
  animation: flow 1.2s linear infinite;
}

.label {
  font-size: var(--fs-xs);
  color: var(--text-3);
  font-stretch: 87%;
  white-space: nowrap;
  .current & {
    color: var(--text);
    font-weight: 600;
  }
  .done & {
    color: var(--text-2);
  }
}

.pct {
  min-width: 3.2ch;
  padding-left: 6px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-2);
  text-align: right;
  align-self: start;
}

@keyframes flow {
  to {
    background-position: -200% 0;
  }
}
</style>
