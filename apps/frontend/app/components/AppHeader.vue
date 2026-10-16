<template>
  <header class="header">
    <div class="brand">
      <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="7" y="8" width="3" height="16" rx="1.5" fill="var(--executing)" />
        <rect x="13" y="8" width="12" height="3" rx="1.5" fill="var(--text-2)" />
        <rect x="13" y="14.5" width="9" height="3" rx="1.5" fill="var(--text-2)" />
        <rect x="13" y="21" width="6" height="3" rx="1.5" fill="var(--ok)" />
      </svg>
      <h1>ClaudeBoard</h1>
      <span v-if="cmd.demo.value" class="demo" title="실제 claude 대신 모의 CLI로 실행 중입니다">데모</span>
    </div>

    <dl class="stats" aria-label="세션 요약">
      <div>
        <dt>실행</dt>
        <dd>{{ cmd.counts.value.running }}</dd>
      </div>
      <div>
        <dt>작업 중</dt>
        <dd>{{ cmd.counts.value.busy }}</dd>
      </div>
      <div :class="{ alarm: cmd.counts.value.approval > 0 }">
        <dt>승인 대기</dt>
        <dd>{{ cmd.counts.value.approval }}</dd>
      </div>
      <div :class="{ alarm: cmd.counts.value.asking > 0, asking: true }">
        <dt>답변 대기</dt>
        <dd>{{ cmd.counts.value.asking }}</dd>
      </div>
    </dl>

    <div class="right">
      <button
        v-if="notify.permission.value === 'default'"
        class="ghost"
        type="button"
        @click="notify.requestPermission()"
      >
        데스크톱 알림 켜기
      </button>
      <button class="conn" :class="cmd.conn.value" type="button" :disabled="cmd.conn.value === 'open'" @click="cmd.reconnectNow()">
        <span class="dot" aria-hidden="true" />
        {{ connLabel }}
        <span v-if="cmd.conn.value === 'closed'" class="sr-only">, 눌러서 다시 연결</span>
      </button>
      <button class="ghost theme-btn" type="button" :aria-label="themeLabel" :title="themeLabel" @click="toggleTheme">
        <svg v-if="theme === 'dark'" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
      </button>
      <button class="palette-btn" type="button" aria-keyshortcuts="Meta+K Control+K" @click="emit('palette')">
        <span>명령</span>
        <kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd><kbd>K</kbd>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
const emit = defineEmits<{ palette: [] }>()
const cmd = useCommander()
const notify = useNotify()
const { theme, toggle: toggleTheme } = useTheme()
const themeLabel = computed(() => (theme.value === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'))
const isMac = computed(() => import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform))

const connLabel = computed(() => ({ open: '연결됨', connecting: '연결 중', closed: '연결 끊김' })[cmd.conn.value])
</script>

<style scoped lang="scss">
.header {
  display: flex;
  align-items: center;
  gap: 28px;
  min-height: 56px;
  padding: 0 20px;
  border-bottom: 1px solid var(--rule);
  background: var(--ink-0);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  h1 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 760;
    font-stretch: 118%;
    letter-spacing: -0.01em;
  }
}
.mark {
  width: 26px;
  height: 26px;
}
.demo {
  padding: 1px 7px;
  border: 1px solid var(--thinking);
  border-radius: 999px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--thinking);
}

.stats {
  display: flex;
  gap: 2px;
  margin: 0;
  div {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--r-sm);
  }
  dt {
    font-size: var(--fs-sm);
    color: var(--text-3);
  }
  dd {
    margin: 0;
    font-weight: 700;
  }
  .alarm.asking {
    background: var(--asking-wash);
    dt,
    dd {
      color: var(--asking);
    }
  }
  .alarm {
    background: var(--approval-wash);
    dt,
    dd {
      color: var(--approval);
    }
  }
}

.right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.ghost,
.conn,
.palette-btn {
  @include pressable;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  font-size: var(--fs-sm);
  color: var(--text-2);
  &:hover:not(:disabled) {
    color: var(--text);
    background: var(--ink-2);
  }
}
.conn {
  &:disabled {
    cursor: default;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ok);
  }
  &.connecting .dot {
    background: var(--executing);
    animation: blink 1s steps(2) infinite;
  }
  &.closed {
    color: var(--approval);
    .dot {
      background: var(--approval);
    }
  }
}
.palette-btn {
  border-color: var(--rule-strong);
  background: var(--ink-1);
  color: var(--text);
  kbd {
    margin-left: -3px;
  }
  span {
    margin-right: 4px;
  }
}

@keyframes blink {
  50% {
    opacity: 0.3;
  }
}

.theme-btn {
  width: 32px;
  padding: 0;
  justify-content: center;
}

@media (max-width: $bp-mid) {
  .ghost:not(.theme-btn) {
    display: none;
  }
}
@media (max-width: $bp-narrow) {
  .header {
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 8px 16px;
  }
  .stats {
    order: 3;
    width: 100%;
    div {
      padding: 2px 8px 2px 0;
    }
  }
}
</style>
