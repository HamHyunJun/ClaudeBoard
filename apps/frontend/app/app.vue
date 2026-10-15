<template>
  <div class="shell" :class="{ 'has-terminal': hasTerminal, 'term-open': termOpen }">
    <a class="skip" href="#rack-title">세션 목록으로 건너뛰기</a>
    <AppHeader @palette="paletteOpen = true" />

    <div class="banner-slot">
      <ApprovalBanner />
    </div>

    <main class="grid">
      <UsageRail class="area-rail" />
      <SessionRack ref="rack" class="area-rack" @add="addOpen = true" />
      <div v-if="hasTerminal" class="area-term">
        <button
          class="handle"
          type="button"
          aria-controls="terminal-drawer"
          :aria-expanded="termOpen"
          :aria-label="termOpen ? '터미널 접기' : '터미널 펼치기'"
          :title="termOpen ? '터미널 접기 (Esc)' : '터미널 펼치기'"
          @click="cmd.terminalOpen.value = !cmd.terminalOpen.value"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div id="terminal-drawer" class="drawer" :inert="!termOpen">
          <TerminalPanel />
        </div>
      </div>
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
    <OpenProjectDialog />
    <ToastStack />
  </div>
</template>

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
// 핸들러는 모듈 전역에 남으므로, 해제하지 않으면 화면이 다시 마운트될 때마다(HMR 포함) 알림이 겹쳐 뜬다
let offAlert: (() => void) | undefined

onMounted(() => {
  offAlert = cmd.onAlert((a) => {
    if (a.kind !== 'approval') notify.toast({ level: a.level, title: a.title, body: a.body, projectId: a.projectId })
    notify.desktop(a, () => a.projectId && cmd.openTerminal(a.projectId))
  })
})
onBeforeUnmount(() => offAlert?.())
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))

const hasTerminal = computed(() => !!cmd.terminalTarget.value)
const termOpen = computed(() => cmd.terminalOpen.value && hasTerminal.value)

function onGlobalKey(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value = !paletteOpen.value
    return
  }
  // xterm 안의 Esc 는 Claude Code(작업 중단)로, 입력창의 Esc 는 입력 해제용이라 터미널을 접지 않는다
  if (e.key === 'Escape' && cmd.terminalOpen.value && !paletteOpen.value && !addOpen.value) {
    if ((e.target as HTMLElement)?.closest?.('.xterm, input, textarea')) return
    cmd.terminalOpen.value = false
  }
}

useHead({
  title: computed(() => {
    const { approval, asking } = cmd.counts.value
    const n = approval + asking
    return n ? `(${n}) ${approval ? '승인' : '답변'} 대기 | ClaudeBoard` : 'ClaudeBoard'
  })
})
</script>

<style scoped lang="scss">
.shell {
  // 서랍이 접히는 애니메이션 중 잠깐 생기는 가로 스크롤을 막는다 (clip 은 스크롤 컨테이너를 만들지 않는다)
  overflow-x: clip;
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
  min-width: 0;
  padding: 18px 20px 0;
  transition: grid-template-columns var(--dur-spring) var(--spring);

  // 터미널 열 = [화살표 핸들 28px + 패널]. 접으면 핸들만 남는다
  .has-terminal & {
    grid-template-columns: 272px minmax(0, 1fr) 28px;
    gap: 20px;
  }
  .term-open & {
    grid-template-columns: 248px minmax(0, 1fr) clamp(488px, 44%, 788px);
  }
}

.area-rail,
.area-rack {
  min-height: 0;
  min-width: 0;
}

.area-term {
  display: flex;
  min-height: 0;
  min-width: 0;
  margin-bottom: 16px;
}

.handle {
  @include pressable;
  flex: none;
  align-self: center;
  display: grid;
  place-items: center;
  width: 28px;
  height: 64px;
  padding: 0;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--ink-2);
  color: var(--text-2);
  &:hover {
    background: var(--ink-3);
    color: var(--text);
  }
  svg {
    // 접힌 상태: ‹ (펼치기), 열린 상태: › (접기)
    transform: rotate(180deg);
    transition: transform var(--dur-spring) var(--spring);
    .term-open & {
      transform: none;
    }
  }
}

.drawer {
  flex: 1;
  min-width: 0;
  min-height: 0;
  margin-left: 8px;
  overflow: hidden;
  // 접히는 동안은 보이다가 끝나면 숨겨 탭 포커스가 닿지 않게 한다
  visibility: hidden;
  opacity: 0;
  transition:
    opacity var(--dur) var(--ease-out),
    visibility 0s linear var(--dur-spring);
  .term-open & {
    visibility: visible;
    opacity: 1;
    transition-delay: 0s;
  }
}

.offline {
  margin: 0;
  padding: 8px 20px;
  border-top: 1px solid var(--approval);
  background: var(--approval-wash);
  font-size: var(--fs-sm);
}

// 좁은 화면: 터미널은 오른쪽에서 덮는 시트로 (핸들은 접혀도 항상 보인다)
@media (max-width: $bp-wide) {
  .grid,
  .has-terminal .grid,
  .term-open .grid {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .has-terminal .grid {
    padding-right: 44px;
  }
  .area-term {
    position: fixed;
    top: 8px;
    right: 8px;
    bottom: 8px;
    z-index: 40;
    width: 28px;
    margin: 0;
    transition: width var(--dur-spring) var(--spring);
  }
  .term-open .area-term {
    width: min(788px, calc(100vw - 16px));
  }
  .term-open .drawer {
    box-shadow: -24px 0 64px -16px var(--shadow);
  }
}

@media (max-width: $bp-mid) {
  .shell {
    height: auto;
    min-height: 100dvh;
  }
  .grid,
  .has-terminal .grid,
  .term-open .grid {
    grid-template-columns: minmax(0, 1fr);
    padding: 16px;
  }
  .has-terminal .grid {
    padding-right: 44px;
  }
  .area-rack {
    order: -1;
  }
  .banner-slot {
    padding: 0 16px;
  }
}
</style>
