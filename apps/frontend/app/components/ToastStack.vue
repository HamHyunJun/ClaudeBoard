<script setup lang="ts">
/** 오른쪽 아래 토스트. 스크린리더에는 polite 로 읽힌다. */
const { toasts, dismiss } = useNotify()
const cmd = useCommander()
</script>

<template>
  <div class="toasts" aria-live="polite" aria-relevant="additions">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.level">
        <div class="text">
          <p class="title">{{ t.title }}</p>
          <p v-if="t.body" class="body">{{ t.body }}</p>
        </div>
        <button v-if="t.projectId" class="link" type="button" @click="cmd.openTerminal(t.projectId), dismiss(t.id)">보기</button>
        <button class="x" type="button" aria-label="알림 닫기" @click="dismiss(t.id)">
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 12px 10px 12px 14px;
  border: 1px solid var(--rule-strong);
  border-left: 3px solid var(--idle);
  border-radius: var(--r-md);
  background: var(--ink-2);
  box-shadow: 0 12px 32px -8px var(--shadow);
  pointer-events: auto;
  &.warning {
    border-left-color: var(--executing);
  }
  &.critical {
    border-left-color: var(--approval);
  }
}
.text {
  flex: 1;
  min-width: 0;
  p {
    margin: 0;
  }
}
.title {
  font-weight: 600;
}
.body {
  margin-top: 2px !important;
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.link,
.x {
  @include pressable;
  border: 0;
  background: transparent;
  color: var(--text-2);
  &:hover {
    color: var(--text);
  }
}
.link {
  font-size: var(--fs-sm);
  font-weight: 600;
}
.x {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
}

.toast-enter-active {
  transition:
    transform var(--dur-spring) var(--spring),
    opacity var(--dur) var(--ease-out);
}
.toast-leave-active {
  transition:
    transform var(--dur) var(--ease-out),
    opacity var(--dur) var(--ease-out);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
.toast-move {
  transition: transform var(--dur) var(--ease-out);
}
</style>
