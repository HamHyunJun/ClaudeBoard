<template>
  <section class="banners" aria-live="assertive" aria-label="승인 대기">
    <TransitionGroup name="drop">
      <article v-for="{ project, session } in cmd.pendingApprovals.value" :key="project.id" class="banner" role="alert">
        <StatusPulse status="REQUIRES_APPROVAL" :size="12" />
        <div class="body">
          <p class="title">
            <strong>{{ project.name }}</strong>
            <span>{{ session!.approval!.question }}</span>
            <span class="waited">{{ formatElapsed(now - session!.approval!.detectedAt) }} 대기</span>
          </p>
          <p v-if="session!.approval!.context.length" class="context code">
            {{ session!.approval!.context.filter((l) => !/^(Bash command|Edit file|Create file)$/i.test(l)).join('  ') }}
          </p>
        </div>
        <div class="buttons">
          <button class="view" type="button" @click="cmd.openTerminal(project.id)">터미널 보기</button>
          <button
            class="deny"
            type="button"
            :disabled="!!sent[project.id]"
            :aria-label="`${project.name} 요청 거절`"
            @click="answer(project.id, 'no')"
          >
            {{ sent[project.id] === 'no' ? '거절 보냄' : '거절' }}
          </button>
          <button
            class="allow"
            type="button"
            :disabled="!!sent[project.id]"
            :aria-label="`${project.name} 요청 승인`"
            @click="answer(project.id, 'yes')"
          >
            {{ sent[project.id] === 'yes' ? '승인 보냄' : '승인' }}
          </button>
        </div>
      </article>
    </TransitionGroup>
  </section>
</template>

<script setup lang="ts">
/**
 * 승인 대기 중인 세션을 화면 최상단에 띄우고 원클릭으로 승인·거절한다.
 * 버튼을 누르면 즉시 "보내는 중" 상태로 바꿔 중복 클릭을 막는다.
 */
const cmd = useCommander()
const now = useNow()
const sent = ref<Record<string, 'yes' | 'no'>>({})

function answer(id: string, decision: 'yes' | 'no'): void {
  sent.value = { ...sent.value, [id]: decision }
  cmd.approve(id, decision)
}

// 승인 요청이 사라지거나 질문이 바뀌면 보낸 상태를 초기화
watch(
  () => cmd.pendingApprovals.value.map((x) => `${x.project.id}:${x.session!.approval!.detectedAt}`).join('|'),
  () => (sent.value = {})
)
</script>

<style scoped lang="scss">
.banners {
  display: grid;
  gap: 6px;
  &:empty {
    display: none;
  }
}

.banner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 10px 12px 10px 16px;
  border: 1px solid color-mix(in srgb, var(--approval) 60%, transparent);
  border-radius: var(--r-md);
  background:
    linear-gradient(90deg, var(--approval-wash), transparent 70%),
    var(--ink-1);
}

.body {
  min-width: 0;
}
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin: 0;
  strong {
    font-weight: 700;
  }
}
.waited {
  font-size: var(--fs-xs);
  color: var(--approval);
}
.context {
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-sm);
  color: var(--text-2);
}

.buttons {
  display: flex;
  gap: 6px;
  button {
    @include pressable;
    height: 34px;
    padding: 0 14px;
    border-radius: var(--r-sm);
    font-size: var(--fs-sm);
    font-weight: 650;
    white-space: nowrap;
    &:disabled {
      opacity: 0.55;
      cursor: progress;
    }
  }
}
.view {
  border: 0;
  background: transparent;
  color: var(--text-2);
  &:hover {
    color: var(--text);
  }
}
.deny {
  border: 1px solid var(--rule-strong);
  background: var(--ink-2);
  &:hover:not(:disabled) {
    border-color: var(--approval);
  }
}
.allow {
  border: 0;
  background: var(--approval);
  color: #1a0b10;
  min-width: 76px;
  &:hover:not(:disabled) {
    background: #ff7593;
  }
}

// 스프링으로 떨어지듯 등장, 빠르게 접히며 퇴장
.drop-enter-active {
  transition:
    transform var(--dur-spring) var(--spring),
    opacity var(--dur) var(--ease-out);
}
.drop-leave-active {
  transition:
    transform var(--dur) var(--ease-out),
    opacity var(--dur-fast) var(--ease-out);
}
.drop-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}
.drop-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

@media (max-width: $bp-mid) {
  .banner {
    grid-template-columns: auto 1fr;
  }
  .buttons {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
