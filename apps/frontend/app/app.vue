<script setup lang="ts">
/**
 * 화면 구성: 상단 헤더 → 승인 배너 → [사용량 레일 | 세션 스트립 랙 | 터미널 패널]
 */
const cmd = useCommander()
const notify = useNotify()
const paletteOpen = ref(false)
const addOpen = ref(false)
const rack = ref<{ focusPrompt: (id: string) => void }>()

// 서버 알림 → 토스트 + 데스크톱 알림 (승인 요청은 상단 배너가 담당하므로 토스트 생략)
onMounted(() => {
  cmd.onAlert((a) => {
    if (a.kind !== 'approval') notify.toast({ level: a.level, title: a.title, body: a.body, projectId: a.projectId })
    notify.desktop(a, () => a.projectId && cmd.openTerminal(a.projectId))
  })
})

function onGlobalKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value = !paletteOpen.value
    return
  }
  // xterm 안의 Esc 는 Claude Code(작업 중단)로 가야 하므로 가로채지 않는다
  if (e.key === 'Escape' && cmd.terminalOpen.value && !paletteOpen.value && !addOpen.value) {
    if ((e.target as HTMLElement)?.closest?.('.xterm')) return
    cmd.terminalOpen.value = false
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))

useHead({
  title: computed(() => {
    const n = cmd.counts.value.approval
    return n ? `(${n}) 승인 대기 | ClaudeBoard` : 'ClaudeBoard'
  })
})
</script>

<template>
  <div class="shell" :class="{ 'with-terminal': cmd.terminalOpen.value && cmd.selected.value }">
    <a class="skip" href="#rack-title">세션 목록으로 건너뛰기</a>
    <AppHeader @palette="paletteOpen = true" />

    <div class="banner-slot">
      <ApprovalBanner />
    </div>

    <main class="grid">
      <UsageRail class="area-rail" />
      <SessionRack ref="rack" class="area-rack" @add="addOpen = true" />
      <Transition name="slide">
        <TerminalPanel v-if="cmd.terminalOpen.value && cmd.selected.value" class="area-term" />
      </Transition>
    </main>

    <p v-if="cmd.conn.value === 'closed'" class="offline" role="status">
      백엔드에 연결할 수 없습니다. <code>pnpm dev</code> 로 백엔드를 실행했는지 확인하세요. 자동으로 다시 연결합니다.
    </p>

    <CommandPalette
      :open="paletteOpen"
      @close="paletteOpen = false"
      @add-project="addOpen = true"
      @focus-prompt="(id) => rack?.focusPrompt(id)"
    />
    <AddProjectDialog :open="addOpen" @close="addOpen = false" />
    <ToastStack />
  </div>
</template>

<style scoped lang="scss">
.shell {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  height: 100vh;
  height: 100dvh;
}

.skip {
  position: absolute;
  left: 8px;
  top: -40px;
  z-index: 100;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  background: var(--text);
  color: var(--ink-0);
  &:focus {
    top: 8px;
  }
}

.banner-slot {
  padding: 0 20px;
  &:has(.banner) {
    padding-top: 12px;
  }
}

.grid {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  gap: 28px;
  min-height: 0;
  padding: 18px 20px 0;
  transition: grid-template-columns var(--dur-spring) var(--spring);

  .with-terminal & {
    grid-template-columns: 248px minmax(0, 1fr) minmax(460px, 44%);
    gap: 20px;
  }
}

.area-rail,
.area-rack {
  min-height: 0;
}
.area-term {
  min-height: 0;
  margin-bottom: 16px;
}

.offline {
  margin: 0;
  padding: 8px 20px;
  border-top: 1px solid var(--approval);
  background: var(--approval-wash);
  font-size: var(--fs-sm);
}

.slide-enter-active {
  transition:
    transform var(--dur-spring) var(--spring),
    opacity var(--dur) var(--ease-out);
}
.slide-leave-active {
  transition:
    transform var(--dur) var(--ease-out),
    opacity var(--dur-fast) var(--ease-out);
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

// 좁은 화면: 터미널은 오른쪽에서 덮는 시트로
@media (max-width: $bp-wide) {
  .grid,
  .with-terminal .grid {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .area-term {
    position: fixed;
    top: 8px;
    right: 8px;
    bottom: 8px;
    z-index: 40;
    width: min(760px, calc(100vw - 16px));
    margin: 0;
    box-shadow: -24px 0 64px -16px rgb(0 0 0 / 0.6);
  }
}

@media (max-width: $bp-mid) {
  .shell {
    height: auto;
    min-height: 100dvh;
  }
  .grid,
  .with-terminal .grid {
    grid-template-columns: minmax(0, 1fr);
    padding: 16px;
  }
  .area-rack {
    order: -1;
  }
  .banner-slot {
    padding: 0 16px;
  }
}
</style>
