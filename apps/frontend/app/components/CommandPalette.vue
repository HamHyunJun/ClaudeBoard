<template>
  <BaseDialog :open="open" labelledby="cp-label" placement="top" @close="emit('close')">
    <div class="palette">
      <label id="cp-label" for="cp-input" class="sr-only">명령 검색</label>
      <div class="search">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        <input
          id="cp-input"
          v-model="query"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="cp-list"
          :aria-activedescendant="items.length ? `cp-opt-${active}` : undefined"
          autocomplete="off"
          spellcheck="false"
          placeholder="명령 검색, 또는 @프로젝트 지시문"
          autofocus
          @keydown="onKey"
        />
        <button
          v-if="speech.supported"
          class="mic"
          :class="{ on: speech.listening.value }"
          type="button"
          :aria-pressed="speech.listening.value"
          :aria-label="speech.listening.value ? '음성 입력 중지' : '음성으로 명령하기'"
          :title="speech.listening.value ? '음성 입력 중지' : '음성으로 명령하기'"
          @click="speech.toggle()"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <kbd>esc</kbd>
      </div>
      <p v-if="speech.listening.value || speech.error.value" class="voice" :class="{ err: speech.error.value }" role="status">
        {{ speech.error.value || '듣고 있습니다… 프로젝트 이름으로 시작하면 그 세션에, 아니면 명령 검색이나 현재 세션 지시로 쓰입니다.' }}
      </p>

      <div id="cp-list" class="list" role="listbox" aria-label="명령">
        <template v-for="[group, entries] in groups" :key="group">
          <p class="group" role="presentation">{{ group }}</p>
          <div
            v-for="{ item, index } in entries"
            :id="`cp-opt-${index}`"
            :key="item.id"
            role="option"
            class="opt"
            :class="{ active: index === active }"
            :aria-selected="index === active"
            @mousemove="active = index"
            @click="run(item)"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.hint" class="hint">{{ item.hint }}</span>
          </div>
        </template>
        <p v-if="!items.length" class="none">일치하는 명령이 없습니다. "@이름 지시문" 형식으로 세션에 바로 보낼 수 있습니다.</p>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
/**
 * ⌘K / Ctrl+K 글로벌 명령창.
 * - 일반 입력: 명령 검색 (combobox + listbox 패턴, ↑↓ 이동, Enter 실행)
 * - "@프로젝트 지시문" 입력: 해당 세션에 바로 프롬프트 전송
 * - V 키(터미널·입력창 밖에서)로 열면 바로 음성 인식을 시작한다
 * - 마이크 버튼: 음성으로 같은 입력을 한다. "프로젝트이름 지시문"으로 말하면 "@이름 지시문"으로 바뀌고,
 *   명령과 맞지 않는 말은 현재 보고 있는 세션에 보낼 지시로 제안한다. 지시 전송은 Enter 로 하거나 끝에 "전송"이라고 말한다
 */
const props = defineProps<{ open: boolean; listen?: boolean }>()
const emit = defineEmits<{ close: []; addProject: []; focusPrompt: [id: string] }>()

const cmd = useCommander()
const notify = useNotify()

interface Item {
  id: string
  group: string
  label: string
  hint?: string
  run: () => void
}

const query = ref('')
const active = ref(0)

/** 음성 인식 결과를 입력으로 바꾼다: 첫머리가 프로젝트 이름이면 "@이름 나머지" 형식으로 */
const toQuery = (text: string): string => {
  const words = text.split(/\s+/)
  const norm = (s: string): string => s.toLowerCase().replace(/[\s_-]/g, '')
  for (const { project } of cmd.sessionList.value) {
    for (let k = 1; k < words.length; k++) {
      if (norm(words.slice(0, k).join('')) === norm(project.name)) return `@${project.name} ${words.slice(k).join(' ')}`
    }
  }
  return text
}
const speech = useSpeech((text, final) => {
  if (!final) return (query.value = text)
  // 끝에 "전송"이라고 말하면 지시 보내기 항목을 바로 실행한다 (명령 항목은 안전을 위해 Enter 로 확인)
  const { text: body, submit } = splitSubmit(text)
  query.value = toQuery(body)
  if (submit) nextTick(() => items.value[0]?.id.startsWith('send-') && run(items.value[0]))
})

const sendItem = (project: { id: string; name: string }, running: boolean, text: string): Item => ({
  id: `send-${project.id}`,
  group: '지시 보내기',
  label: `${project.name}에 보내기: ${text}`,
  hint: running ? 'Enter' : '꺼져 있음',
  run: () => (running ? cmd.prompt(project.id, text) : notify.toast({ level: 'warning', title: `${project.name} 세션이 꺼져 있습니다` }))
})

const items = computed<Item[]>(() => {
  const list: Item[] = []
  const q = query.value.trim()

  // "@이름 텍스트" → 즉시 전송 명령
  const at = q.match(/^@(\S+)\s+(.+)$/)
  if (at) {
    for (const { project, session } of cmd.sessionList.value) {
      if (!project.name.toLowerCase().includes(at[1]!.toLowerCase())) continue
      list.push(sendItem(project, session?.process === 'running', at[2]!))
    }
    return list
  }

  for (const { project: p } of cmd.pendingApprovals.value) {
    list.push({ id: `ok-${p.id}`, group: '승인 대기', label: `${p.name} 요청 승인`, run: () => cmd.approve(p.id, 'yes') })
    list.push({ id: `no-${p.id}`, group: '승인 대기', label: `${p.name} 요청 거절`, run: () => cmd.approve(p.id, 'no') })
  }

  for (const { project: p, session } of cmd.sessionList.value) {
    const running = session?.process === 'running' || session?.process === 'starting'
    list.push({ id: `open-${p.id}`, group: '세션', label: `${p.name} 터미널 열기`, hint: running ? STATUS_LABEL[session?.status ?? 'IDLE'] : '꺼짐', run: () => cmd.openTerminal(p.id) })
    list.push({ id: `prompt-${p.id}`, group: '세션', label: `${p.name}에 지시하기`, run: () => emit('focusPrompt', p.id) })
    if (running) {
      list.push({ id: `stop-${p.id}`, group: '세션', label: `${p.name} 세션 중지`, run: () => cmd.stop(p.id) })
      list.push({ id: `restart-${p.id}`, group: '세션', label: `${p.name} 세션 재시작`, run: () => cmd.restart(p.id) })
    } else {
      list.push({ id: `start-${p.id}`, group: '세션', label: `${p.name} 세션 시작`, run: () => cmd.start(p.id) })
    }
  }

  const stopped = cmd.sessionList.value.filter((x) => x.session?.process !== 'running')
  if (stopped.length) {
    list.push({ id: 'start-all', group: '전체', label: `꺼진 세션 모두 시작 (${stopped.length}개)`, run: () => stopped.forEach((x) => cmd.start(x.project.id)) })
  }
  list.push({ id: 'add', group: '전체', label: '프로젝트 추가', run: () => emit('addProject') })
  if (notify.permission.value === 'default') {
    list.push({ id: 'notify', group: '전체', label: '데스크톱 알림 켜기', run: () => notify.requestPermission() })
  }
  list.push({ id: 'reconnect', group: '전체', label: '백엔드 다시 연결', run: () => cmd.reconnectNow() })

  if (!q) return list
  const terms = q.toLowerCase().split(/\s+/)
  const found = list.filter((i) => terms.every((t) => `${i.label} ${i.group}`.toLowerCase().includes(t)))
  // 어떤 명령과도 맞지 않는 말(주로 음성)은 지금 보고 있는 세션에 보낼 지시로 제안한다
  const cur = cmd.terminalTarget.value
  if (!found.length && cur) return [sendItem(cur.project, cur.session?.process === 'running', q)]
  return found
})

const groups = computed(() => {
  const map = new Map<string, { item: Item; index: number }[]>()
  items.value.forEach((item, index) => {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push({ item, index })
  })
  return [...map.entries()]
})

const run = (item?: Item): void => {
  if (!item) return
  emit('close')
  // 닫힘 애니메이션·포커스 복원 이후 실행해야 포커스 이동 명령이 덮어써지지 않는다
  setTimeout(item.run, 30)
}

const onKey = (e: KeyboardEvent): void => {
  const n = items.value.length
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = n ? (active.value + 1) % n : 0
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = n ? (active.value - 1 + n) % n : 0
  } else if (e.key === 'Enter') {
    e.preventDefault()
    run(items.value[active.value])
  }
}

watch(query, () => (active.value = 0))
watch(
  () => props.open,
  (o) => {
    if (o) {
      query.value = ''
      active.value = 0
      if (props.listen) speech.toggle()
    } else speech.stop()
  }
)

watch(active, (i) => nextTick(() => document.getElementById(`cp-opt-${i}`)?.scrollIntoView({ block: 'nearest' })))
</script>

<style scoped lang="scss">
.palette {
  display: flex;
  flex-direction: column;
  max-height: min(520px, 70vh);
}
.search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--rule);
  color: var(--text-3);
  input {
    flex: 1;
    height: 52px;
    border: 0;
    background: transparent;
    font-size: var(--fs-lg);
    color: var(--text);
    &:focus-visible {
      outline: none;
    }
    &::placeholder {
      color: var(--text-3);
    }
  }
}
.mic {
  @include pressable;
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-2);
  &:hover {
    background: var(--ink-2);
    color: var(--text);
  }
  &.on {
    background: var(--approval-wash);
    color: var(--approval);
    animation: mic-pulse 1.4s var(--ease-out) infinite;
  }
}
@keyframes mic-pulse {
  from {
    box-shadow: 0 0 0 0 var(--approval-wash);
  }
  to {
    box-shadow: 0 0 0 8px transparent;
  }
}
.voice {
  margin: 0;
  padding: 8px 16px;
  border-bottom: 1px solid var(--rule);
  font-size: var(--fs-sm);
  color: var(--text-2);
  &.err {
    color: var(--approval);
  }
}
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}
.group {
  margin: 8px 10px 4px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-3);
}
.opt {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background-color 80ms linear;
  &.active {
    background: var(--ink-3);
  }
}
.hint {
  font-size: var(--fs-xs);
  color: var(--text-3);
  white-space: nowrap;
}
.none {
  margin: 0;
  padding: 18px 10px;
  color: var(--text-3);
}
</style>
