<template>
  <div class="session-menu">
    <button
      ref="btn"
      class="menu-btn"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="`${item.project.name} 세션 메뉴`"
      @click.stop="toggle"
      @keydown.esc="close(true)"
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
    <Teleport to="body">
      <Transition name="menu">
        <ul
          v-if="open"
          ref="menu"
          class="menu"
          role="menu"
          :aria-label="`${item.project.name} 세션 메뉴`"
          :style="pos"
          @keydown.esc="close(true)"
        >
          <li role="none">
            <button role="menuitem" type="button" @click="run(() => (cmd.openTargetId.value = item.project.id))">폴더 열기</button>
          </li>
          <template v-if="s.running.value">
            <li role="none">
              <button role="menuitem" type="button" title="Esc 키 전송: 현재 작업 중단" @click="run(interrupt)">작업 중단</button>
            </li>
            <li role="none">
              <button role="menuitem" type="button" @click="run(() => cmd.restart(item.project.id))">재시작</button>
            </li>
            <li role="none">
              <button role="menuitem" type="button" @click="run(() => cmd.stop(item.project.id))">중지</button>
            </li>
          </template>
          <li v-else role="none">
            <button role="menuitem" type="button" @click="run(() => cmd.start(item.project.id))">시작</button>
          </li>
          <li class="sep" role="separator" />
          <li role="none">
            <button
              role="menuitem"
              type="button"
              class="danger"
              :class="{ armed: confirmRemove }"
              :aria-label="`${item.project.name} 프로젝트 삭제`"
              @click="removeProject"
            >
              {{ confirmRemove ? '정말 삭제?' : '삭제' }}
            </button>
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { SessionItem } from '~/composables/useCommander'

/**
 * 사이드바 폴더 줄 오른쪽의 ☰ 버튼과 그 세션 도구 메뉴(폴더 열기·작업 중단·재시작·중지·시작·삭제).
 * 사이드바 목록이 스크롤·잘림 영역이라 메뉴는 body 로 꺼내 버튼 옆에 고정 배치한다.
 */
const props = defineProps<{ item: SessionItem }>()

const cmd = useCommander()
const s = useSessionState(() => props.item)

const btn = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const open = ref(false)
const pos = ref<Record<string, string>>({})
// 실수로 지우지 않도록 두 번 눌러야 삭제: 첫 클릭은 확인 상태로 전환, 3초 뒤 자동 해제
const confirmRemove = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | undefined

const close = (refocus = false): void => {
  if (!open.value) return
  open.value = false
  if (refocus) btn.value?.focus()
}
const toggle = (): void => {
  if (open.value) return close()
  const r = btn.value!.getBoundingClientRect()
  // 버튼 아래 오른쪽 정렬. 아래 공간이 모자라면 위로 연다
  const below = window.innerHeight - r.bottom > 220
  pos.value = {
    right: `${window.innerWidth - r.right}px`,
    ...(below ? { top: `${r.bottom + 4}px` } : { bottom: `${window.innerHeight - r.top + 4}px` })
  }
  open.value = true
  nextTick(() => menu.value?.querySelector<HTMLElement>('button')?.focus())
}
const run = (action: () => unknown): void => {
  close()
  action()
}
const interrupt = (): void => cmd.input(props.item.project.id, '\x1b')

const removeProject = async (): Promise<void> => {
  if (!confirmRemove.value) {
    confirmRemove.value = true
    confirmTimer = setTimeout(() => (confirmRemove.value = false), 3000)
    return
  }
  clearTimeout(confirmTimer)
  confirmRemove.value = false
  close()
  try {
    await cmd.removeProject(props.item.project.id)
  } catch (err) {
    useNotify().toast({ level: 'warning', title: (err as Error).message })
  }
}

const onDocPointer = (e: PointerEvent): void => {
  const t = e.target as Node
  if (open.value && !menu.value?.contains(t) && !btn.value?.contains(t)) close()
}
const onScroll = (): void => close()
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
  clearTimeout(confirmTimer)
})

watch(open, (v) => {
  if (!v) confirmRemove.value = false
})
</script>

<style scoped lang="scss">
.session-menu {
  position: absolute;
  top: 6px;
  right: 8px;
}
.menu-btn {
  @include pressable;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-3);
  &:hover,
  &[aria-expanded='true'] {
    background: var(--ink-3);
    color: var(--text);
  }
}
.menu {
  position: fixed;
  z-index: 40;
  min-width: 150px;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  background: var(--ink-1);
  box-shadow: 0 6px 18px var(--shadow-soft);
  transform-origin: top right;
  button {
    display: block;
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    font-size: var(--fs-sm);
    font-weight: 600;
    text-align: left;
    color: var(--text-2);
    white-space: nowrap;
    &:hover {
      background: var(--ink-2);
      color: var(--text);
    }
    &.danger {
      color: var(--text-3);
      &:hover {
        color: var(--approval);
      }
      &.armed {
        background: var(--approval-wash);
        color: var(--approval);
      }
    }
  }
}
.sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--rule);
}
.menu-enter-active,
.menu-leave-active {
  transition:
    opacity var(--dur-fast) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
</style>
