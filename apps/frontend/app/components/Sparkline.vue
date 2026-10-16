<template>
  <svg class="spark" :class="{ hot }" viewBox="0 0 60 16" preserveAspectRatio="none" role="img" :aria-label="label">
    <rect
      v-for="(v, i) in values"
      :key="i"
      :x="i * 2"
      :y="16 - Math.max(v > 0 ? 1.5 : 0.5, (v / max) * 16)"
      width="1.4"
      :height="Math.max(v > 0 ? 1.5 : 0.5, (v / max) * 16)"
    />
  </svg>
</template>

<script setup lang="ts">
/** 분 단위 토큰 사용량 미니 막대 (최근 30분) */
const props = defineProps<{ values: readonly number[]; hot?: boolean; label: string }>()
const max = computed(() => Math.max(1, ...props.values))
</script>

<style scoped lang="scss">
.spark {
  display: block;
  width: 60px;
  height: 16px;
  fill: var(--text-3);
  &.hot {
    fill: var(--executing);
  }
}
</style>
