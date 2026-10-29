<template>
  <div class="shell">
    <a class="skip" href="#workspace">터미널로 건너뛰기</a>
    <ProjectSidebar class="area-side" @add="addOpen = true" @palette="paletteOpen = true" />

    <main id="workspace" class="area-main">
      <div class="banner-slot">
        <ApprovalBanner :except-id="cmd.terminalTarget.value?.project.id" />
      </div>
      <TerminalPanel ref="panel" class="term" />
      <p v-if="cmd.conn.value === 'closed'" class="offline" role="status">
        백엔드에 연결할 수 없습니다. <code>pnpm dev</code> 로 백엔드를 실행했는지 확인하세요. 자동으로 다시 연결합니다.
      </p>
    </main>

    <CommandPalette :open="paletteOpen" :listen="voiceOpen" @close="closePalette" @add-project="addOpen = true" @focus-prompt="focusTerminal" />
    <AddProjectDialog :open="addOpen" @close="addOpen = false" />
    <OpenProjectDialog />
    <ToastStack />
  </div>
</template>

<script setup lang="ts">
/**
 * 화면 구성: [프로젝트 폴더 사이드바 | 승인 배너 + 세션 탭 + 화면 전체 Claude Code 터미널]
 */
const cmd = useCommander()
const notify = useNotify()

const paletteOpen = ref(false)
// V 키로 열면 명령창이 바로 음성 인식을 시작한다
const voiceOpen = ref(false)
const addOpen = ref(false)
const panel = ref<{ focus: () => void }>()

// 서버 알림 → 토스트 + 데스크톱 알림 (승인 요청은 상단 배너가 담당하므로 토스트 생략)
// 핸들러는 모듈 전역에 남으므로, 해제하지 않으면 화면이 다시 마운트될 때마다(HMR 포함) 알림이 겹쳐 뜬다
let offAlert: (() => void) | undefined

onMounted(() => {
  offAlert = cmd.onAlert((a) => {
    if (a.kind !== 'approval') notify.toast({ level: a.level, title: a.title, body: a.body, projectId: a.projectId })
    notify.desktop(a, () => a.projectId && cmd.openTerminal(a.projectId))
  })
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  offAlert?.()
  window.removeEventListener('keydown', onGlobalKey)
})

/** 명령창의 "지시하기": 그 세션의 터미널을 열고 입력 포커스를 준다 */
const focusTerminal = (id: string): void => {
  cmd.openTerminal(id)
  // 탭이 바뀌면 xterm 이 새로 마운트되므로 한 박자 늦게 포커스한다
  nextTick(() => setTimeout(() => panel.value?.focus(), 60))
}

const closePalette = (): void => {
  paletteOpen.value = false
  voiceOpen.value = false
}

const isTyping = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

const onGlobalKey = (e: KeyboardEvent): void => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value ? closePalette() : (paletteOpen.value = true)
    return
  }
  // 한글 자판에서는 key 가 'ㅍ' 이므로 물리 키(code)로 판별한다. 터미널·입력창에 포커스가 있으면 글자 입력이 우선이다
  if (e.code === 'KeyV' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.repeat && !isTyping(e.target) && !paletteOpen.value && !addOpen.value) {
    e.preventDefault()
    voiceOpen.value = true
    paletteOpen.value = true
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
  display: grid;
  grid-template-columns: 288px minmax(0, 1fr);
  // 행을 뷰포트 높이로 고정: auto 행은 터미널 내용만큼 늘어나 하단(상태줄)이 잘린다
  grid-template-rows: minmax(0, 1fr);
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
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

.area-side {
  min-height: 0;
}

.area-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.banner-slot {
  flex: none;
  max-height: 40vh;
  overflow-y: auto;
  padding: 0 16px;
  background: var(--ink-1);
  &:has(.banner) {
    padding-block: 10px;
    border-bottom: 1px solid var(--rule);
  }
}

.term {
  flex: 1;
}

.offline {
  flex: none;
  margin: 0;
  padding: 8px 20px;
  border-top: 1px solid var(--approval);
  background: var(--approval-wash);
  font-size: var(--fs-sm);
}

@media (max-width: $bp-wide) {
  .shell {
    grid-template-columns: 248px minmax(0, 1fr);
  }
}

// 좁은 화면: 폴더 목록을 위로, 터미널을 아래로 쌓는다
@media (max-width: $bp-mid) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }
  .area-side {
    max-height: 42dvh;
  }
}
</style>
