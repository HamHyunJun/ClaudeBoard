<script setup lang="ts">
/**
 * 할당량 대비 사용량 바. 50% 미만 초록, 50% 이상 노랑, 80% 이상 빨강. 잔여 수치와 바 모두 같은 색을 쓴다.
 * percent 를 주면 Claude 가 알려준 실측 사용률을 그대로 쓰고, 아니면 used/limit 로 계산한다.
 */
const props = defineProps<{ label: string; used?: number; limit?: number; percent?: number; detail?: string }>()
const pct = computed(() => {
  if (props.percent !== undefined) return Math.max(0, Math.min(100, props.percent))
  return props.limit && props.limit > 0 ? Math.min(100, ((props.used ?? 0) / props.limit) * 100) : 0
})
const remaining = computed(() => Math.max(0, 100 - pct.value))
const level = computed(() => (pct.value >= 80 ? 'danger' : pct.value >= 50 ? 'warn' : 'ok'))
</script>

<template>
  <div class="meter" :class="level">
    <div class="row">
      <span class="label">{{ label }}</span>
      <span class="value">잔여 <strong>{{ remaining.toFixed(0) }}%</strong></span>
    </div>
    <div
      class="bar"
      role="meter"
      :aria-label="`${label} 사용률`"
      :aria-valuenow="Math.round(pct)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuetext="`${pct.toFixed(0)}% 사용, ${remaining.toFixed(0)}% 남음`"
    >
      <span class="fill" :style="{ transform: `scaleX(${pct / 100})` }" />
    </div>
    <div class="row sub">
      <span>{{ percent !== undefined ? `${pct.toFixed(0)}% 사용` : `${formatTokens(used ?? 0)} / ${formatTokens(limit ?? 0)}` }}</span>
      <span v-if="detail">{{ detail }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.meter {
  --fill: var(--quota-ok);
  display: grid;
  gap: 5px;
  &.warn {
    --fill: var(--quota-mid);
  }
  &.danger {
    --fill: var(--quota-high);
  }
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.label {
  font-weight: 600;
}
.value {
  font-size: var(--fs-sm);
  color: var(--text-2);
  strong {
    color: var(--fill);
    transition: color var(--dur) var(--ease-out);
  }
}
.sub {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.bar {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: var(--ink-3);
  overflow: hidden;
}
.fill {
  position: absolute;
  inset: 0;
  background: var(--fill);
  transform-origin: left;
  transition: transform 700ms var(--ease-out), background-color var(--dur) var(--ease-out);
}
</style>
