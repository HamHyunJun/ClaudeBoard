<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="backdrop" :class="placement ?? 'center'" @mousedown.self="emit('close')">
        <div ref="panel" class="panel" role="dialog" aria-modal="true" :aria-labelledby="labelledby" @keydown="trap">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * 공용 모달. 배경은 페이드, 패널은 스프링으로 살짝 튀며 등장한다.
 * 포커스를 안에 가두고, 닫히면 열기 전 요소로 포커스를 돌려준다.
 */
const props = defineProps<{ open: boolean; labelledby: string; placement?: 'center' | 'top' }>()
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement>()
let restoreFocus: HTMLElement | null = null

const trap = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || !panel.value) return
  const items = [...panel.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
  if (!items.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      restoreFocus = document.activeElement as HTMLElement | null
      nextTick(() => {
        const first = panel.value?.querySelector<HTMLElement>('[autofocus], input, button, [tabindex="0"]')
        first?.focus()
      })
    } else {
      restoreFocus?.focus?.()
    }
  }
)
</script>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  justify-items: center;
  padding: 16px;
  background: var(--scrim);
  backdrop-filter: blur(3px);
  &.center {
    align-items: center;
  }
  &.top {
    align-items: start;
    padding-top: min(16vh, 140px);
  }
}

.panel {
  width: min(560px, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-lg);
  background: var(--ink-1);
  box-shadow: 0 24px 64px -12px var(--shadow);
  transform-origin: 50% 0;
}

.dialog-enter-active {
  transition: opacity var(--dur) var(--ease-out);
  .panel {
    transition:
      transform var(--dur-spring) var(--spring),
      opacity var(--dur-fast) var(--ease-out);
  }
}
.dialog-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out);
  .panel {
    transition:
      transform var(--dur-fast) var(--ease-out),
      opacity var(--dur-fast) var(--ease-out);
  }
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
  .panel {
    opacity: 0;
    transform: scale(0.96) translateY(-6px);
  }
}
</style>
