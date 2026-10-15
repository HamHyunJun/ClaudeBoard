<template>
  <div
    class="track"
    :class="[tone, { compact, empty: workflow.source === 'none', indeterminate }]"
    role="progressbar"
    aria-label="워크플로우 진행률"
    :aria-valuenow="indeterminate ? undefined : workflow.percent"
    :aria-valuemin="indeterminate ? undefined : 0"
    :aria-valuemax="indeterminate ? undefined : 100"
    :aria-valuetext="valueText"
  >
    <div v-for="seg in segments" :key="seg.stage" class="seg" :class="{ current: seg.current, done: seg.done }">
      <div class="bar"><span class="fill" :style="{ transform: `scaleX(${seg.fill})` }" /></div>
      <span v-if="!compact" class="label">{{ seg.label }}</span>
    </div>
    <span v-if="!compact" class="pct">{{ workflow.source !== 'none' ? `${workflow.percent}%` : elapsed || '—' }}</span>
  </div>
</template>

<script setup lang="ts">
import type { SessionStatus, WorkflowProgress } from '@claudeboard/shared'
import { WORKFLOW_STAGES } from '@claudeboard/shared'

/**
 * plan → execute → review → verify 4구간 트랙.
 * 각 구간은 진행률에 따라 채워지고, 실행 중이면 주황색 바가 흐른다.
 */
const props = defineProps<{ workflow: WorkflowProgress; status: SessionStatus; busySince?: number; compact?: boolean }>()
const now = useNow()

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
// 단계·Todo 신호가 없는 작업(일반 질문 등)은 퍼센트를 지어내지 않고 흐르는 바 + 경과 시간만 보여준다
const indeterminate = computed(() => props.workflow.source === 'none' && props.busySince !== undefined)
const elapsed = computed(() => (props.busySince === undefined ? '' : formatElapsed(now.value - props.busySince)))
const tone = computed(() => (props.status === 'EXECUTING' ? 'executing' : props.status === 'REQUIRES_APPROVAL' ? 'approval' : props.status === 'ASKING' ? 'asking' : 'calm'))
const valueText = computed(() => {
  const w = props.workflow
  if (w.source === 'none') return indeterminate.value ? `작업 중, 경과 ${elapsed.value}` : '워크플로우 단계가 아직 감지되지 않았습니다'
  const stage = w.stage ? LABELS[w.stage] : '진행'
  const todos = w.todos ? `, 할 일 ${w.todos.done}/${w.todos.total}` : ''
  return `${stage} 단계, ${w.percent}%${todos}`
})
</script>

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
  &.asking {
    --fill: var(--asking);
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
  min-width: 4.5ch;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  padding-left: 6px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-2);
  text-align: right;
  align-self: start;
}

// 진행률을 알 수 없는 작업: 4구간 전체에 줄무늬가 흐른다
.indeterminate .bar {
  background: linear-gradient(90deg, var(--ink-3) 0%, color-mix(in srgb, var(--fill) 70%, var(--ink-3)) 50%, var(--ink-3) 100%);
  background-size: 200% 100%;
  animation: flow 1.6s linear infinite;
}

@keyframes flow {
  to {
    background-position: -200% 0;
  }
}
</style>
