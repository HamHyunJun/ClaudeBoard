<template>
  <section v-if="item" class="panel" :aria-label="`${item.project.name} 터미널`">
    <header class="head">
      <div class="who">
        <StatusPulse :status="session?.status ?? 'IDLE'" :offline="!running" />
        <h2>{{ item.project.name }}</h2>
        <span class="state">{{ running ? STATUS_LABEL[session?.status ?? 'IDLE'] : '꺼짐' }}</span>
        <span v-if="session?.pid" class="pid code">pid {{ session.pid }}</span>
      </div>
      <div class="tools">
        <button v-if="!running" class="tool" type="button" @click="cmd.start(item.project.id)">시작</button>
        <button v-else class="tool" type="button" @click="cmd.input(item.project.id, '\x1b')" title="Esc 키 전송: 현재 작업 중단">
          작업 중단
        </button>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="보기 선택" @keydown="onTabKey">
      <button
        v-for="t in tabs"
        :id="`tab-${t.id}`"
        :key="t.id"
        :ref="(el) => el && (tabEls[t.id] = el as HTMLButtonElement)"
        role="tab"
        type="button"
        :aria-selected="tab === t.id"
        :aria-controls="`tabpanel-${t.id}`"
        :tabindex="tab === t.id ? 0 : -1"
        class="tab"
        @click="tab = t.id"
      >
        {{ t.label }}
        <span v-if="t.id === 'events' && events.length" class="count">{{ events.length }}</span>
      </button>
      <span class="indicator" :style="{ transform: `translateX(${indicator.x}px)`, width: `${indicator.w}px` }" aria-hidden="true" />
    </div>

    <div class="views">
      <Transition name="fade" mode="out-in">
        <div v-if="tab === 'terminal'" id="tabpanel-terminal" key="t" role="tabpanel" aria-labelledby="tab-terminal" class="view">
          <XtermView ref="xterm" :key="item.project.id" :project-id="item.project.id" :label="item.project.name" />
        </div>
        <div v-else id="tabpanel-events" key="e" role="tabpanel" aria-labelledby="tab-events" class="view events" tabindex="0">
          <ol v-if="events.length" class="log">
            <li v-for="a in events" :key="a.id" :class="a.level">
              <time :datetime="new Date(a.at).toISOString()">{{ formatClock(a.at) }}</time>
              <div>
                <p class="ev-title">{{ a.title }}</p>
                <p class="ev-body">{{ a.body }}</p>
              </div>
            </li>
          </ol>
          <p v-else class="empty">아직 기록된 이벤트가 없습니다. 승인 요청, 작업 완료, 토큰 급증이 여기에 쌓입니다.</p>
        </div>
      </Transition>
    </div>

    <footer class="foot">
      <span>{{ shortPath(item.project.cwd) }}</span>
      <span v-if="session">{{ session.cols }}×{{ session.rows }}</span>
      <span v-if="session?.lastOutputAt">마지막 출력 {{ formatElapsed(now - session.lastOutputAt) }} 전</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
/**
 * 선택한 세션의 실시간 터미널과 이벤트 기록을 탭으로 보여주는 오른쪽 패널.
 * 탭 표시줄은 스프링으로 미끄러지며 이동한다.
 */
const cmd = useCommander()
const now = useNow()

const tab = ref<'terminal' | 'events'>('terminal')
const tabs = [
  { id: 'terminal', label: '터미널' },
  { id: 'events', label: '이벤트' }
] as const
const tabEls = ref<Record<string, HTMLButtonElement>>({})
const indicator = ref({ x: 0, w: 0 })
const xterm = ref<{ focus: () => void }>()

onMounted(() => nextTick(moveIndicator))

const item = computed(() => cmd.terminalTarget.value)
const session = computed(() => item.value?.session)
const running = computed(() => session.value?.process === 'running' || session.value?.process === 'starting')
const events = computed(() => cmd.alerts.value.filter((a) => a.projectId === item.value?.project.id))

const moveIndicator = (): void => {
  const el = tabEls.value[tab.value]
  if (el) indicator.value = { x: el.offsetLeft, w: el.offsetWidth }
}

const onTabKey = (e: KeyboardEvent): void => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  e.preventDefault()
  tab.value = tab.value === 'terminal' ? 'events' : 'terminal'
  nextTick(() => tabEls.value[tab.value]?.focus())
}

defineExpose({ focus: () => xterm.value?.focus() })

watch(tab, () => nextTick(moveIndicator))
</script>

<style scoped lang="scss">
.panel {
  display: grid;
  // 열을 패널 폭에 고정: auto 열이면 넓은 xterm 때문에 열이 늘어나 헤더의 닫기 버튼이 잘린다
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto 1fr auto;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-lg);
  background: var(--ink-1);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 8px 16px;
}
.who {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  h2 {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-lg);
    font-weight: 700;
    font-stretch: 90%;
  }
}
.state {
  font-size: var(--fs-sm);
  color: var(--text-2);
  white-space: nowrap;
}
.pid {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.tools {
  display: flex;
  flex: none;
  gap: 4px;
}
.tool {
  @include pressable;
  display: inline-grid;
  place-items: center;
  height: 30px;
  min-width: 30px;
  padding: 0 10px;
  white-space: nowrap;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  &:hover {
    background: var(--ink-3);
  }
}

.tabs {
  position: relative;
  display: flex;
  gap: 4px;
  padding: 0 12px;
  border-bottom: 1px solid var(--rule);
}
.tab {
  @include pressable;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-3);
  &[aria-selected='true'] {
    color: var(--text);
  }
  &:hover {
    color: var(--text-2);
  }
}
.count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--ink-3);
  font-size: var(--fs-xs);
  color: var(--text-2);
}
.indicator {
  position: absolute;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--text);
  transition:
    transform var(--dur-spring) var(--spring),
    width var(--dur-spring) var(--spring);
}

.views {
  position: relative;
  min-height: 0;
  min-width: 0;
}
.view {
  height: 100%;
  min-height: 0;
}

.events {
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 16px;
}
.log {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    padding-left: 10px;
    border-left: 2px solid var(--idle);
    &.warning {
      border-color: var(--executing);
    }
    &.critical {
      border-color: var(--approval);
    }
  }
  time {
    font-size: var(--fs-xs);
    color: var(--text-3);
    padding-top: 2px;
  }
  p {
    margin: 0;
  }
}
.ev-title {
  font-weight: 600;
}
.ev-body {
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.empty {
  max-width: 44ch;
  margin: 0;
  color: var(--text-3);
}

.foot {
  display: flex;
  gap: 16px;
  padding: 6px 16px;
  border-top: 1px solid var(--rule);
  font-size: var(--fs-xs);
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur) var(--ease-out);
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.fade-leave-to {
  opacity: 0;
}
</style>
