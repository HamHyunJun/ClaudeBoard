<script setup lang="ts">
/** 할당량 대비 사용량 바. 70% 이상 주의, 90% 이상 위험 색으로 바뀐다. */
const props = defineProps<{ label: string; used: number; limit: number; detail?: string }>()
const pct = computed(() => (props.limit > 0 ? Math.min(100, (props.used / props.limit) * 100) : 0))
const remaining = computed(() => Math.max(0, 100 - pct.value))
const level = computed(() => (pct.value >= 90 ? 'danger' : pct.value >= 70 ? 'warn' : 'ok'))
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
      :aria-valuetext="`${formatTokens(used)} / ${formatTokens(limit)} 토큰 사용, ${remaining.toFixed(0)}% 남음`"
    >
      <span class="fill" :style="{ transform: `scaleX(${pct / 100})` }" />
    </div>
    <div class="row sub">
      <span>{{ formatTokens(used) }} / {{ formatTokens(limit) }}</span>
      <span v-if="detail">{{ detail }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.meter {
  --fill: var(--idle);
  display: grid;
  gap: 5px;
  &.warn {
    --fill: var(--executing);
  }
  &.danger {
    --fill: var(--approval);
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
    color: var(--text);
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
