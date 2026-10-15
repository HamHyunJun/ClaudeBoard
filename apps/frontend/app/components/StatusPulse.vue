<template>
  <span class="pulse" :class="cls" :style="{ '--size': `${size ?? 10}px` }" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { SessionStatus } from '@claudeboard/shared'

/** 상태 점 + 펄스 링. 색만으로 의미를 전달하지 않도록 라벨은 항상 옆에 텍스트로 둔다. */
const props = defineProps<{ status: SessionStatus; offline?: boolean; size?: number }>()
const cls = computed(() => (props.offline ? 'offline' : STATUS_CLASS[props.status]))
</script>

<style scoped lang="scss">
.pulse {
  position: relative;
  display: inline-block;
  flex: none;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: var(--c);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--c);
    opacity: 0;
  }
}

.offline {
  --c: var(--text-3);
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--text-3);
}
.idle {
  --c: var(--idle);
}
// 추론: 느리게 숨쉬기
.thinking {
  --c: var(--thinking);
  animation: breathe 2.4s ease-in-out infinite;
}
// 실행: 바깥으로 퍼지는 링
.executing {
  --c: var(--executing);
  &::after {
    animation: ring 1.4s var(--ease-out) infinite;
  }
}
// 승인: 빠르고 강한 링 — 가장 먼저 눈에 들어와야 한다
.approval {
  --c: var(--approval);
  &::after {
    animation: ring 0.9s var(--ease-out) infinite;
  }
}

// 질문: 승인보다 한 박자 느린 링 — 확인이 필요하다는 점만 다르게 알린다
.asking {
  --c: var(--asking);
  &::after {
    animation: ring 1.2s var(--ease-out) infinite;
  }
}

@keyframes breathe {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.8);
  }
}

@keyframes ring {
  0% {
    opacity: 0.7;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(2.8);
  }
}
</style>
