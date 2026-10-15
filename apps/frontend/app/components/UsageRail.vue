<script setup lang="ts">
/** 토큰·비용·할당량·리셋 카운트다운·프로젝트별 순위를 모은 왼쪽 계기판 */
const cmd = useCommander()
const now = useNow()
const u = computed(() => cmd.usage.value)

const breakdown = computed(() => {
  const t = u.value?.today
  if (!t) return []
  const total = Math.max(1, t.input + t.output + t.cacheWrite + t.cacheRead)
  return [
    { key: 'cacheRead', label: '캐시 읽기', value: t.cacheRead, share: t.cacheRead / total },
    { key: 'input', label: '입력', value: t.input, share: t.input / total },
    { key: 'cacheWrite', label: '캐시 쓰기', value: t.cacheWrite, share: t.cacheWrite / total },
    { key: 'output', label: '출력', value: t.output, share: t.output / total }
  ]
})

// Claude 가 알려준 실측값. 조회 불가일 때만 로컬 로그 추정치로 돌아간다
const official = computed(() => u.value?.official)
const live = computed(() => !!official.value && official.value.status !== 'unavailable')
const fiveHour = computed(() => (live.value ? official.value?.fiveHour : null) ?? null)
const sevenDay = computed(() => (live.value ? official.value?.sevenDay : null) ?? null)

const resetIn = computed(() => {
  const r = live.value ? fiveHour.value?.resetsAt : u.value?.rateWindow.resetsAt
  return r && r > now.value ? r - now.value : null
})
// 리셋 시각이 지났으면 새 창이 열리기 전이므로 0%
const fiveHourPercent = computed(() => (resetIn.value === null ? 0 : (fiveHour.value?.percent ?? 0)))
const weekResetsAt = computed(() => sevenDay.value?.resetsAt)

const nameOf = (id: string | null, cwd: string) =>
  (id && cmd.projects.value.find((p) => p.id === id)?.name) || shortPath(cwd)
const topProjects = computed(() => (u.value?.projects ?? []).slice(0, 6))
const projectTotal = (p: { today: { input: number; output: number; cacheWrite: number; cacheRead: number } }) =>
  p.today.input + p.today.output + p.today.cacheWrite + p.today.cacheRead
const maxProject = computed(() => Math.max(1, ...topProjects.value.map(projectTotal)))
</script>

<template>
  <aside class="rail" aria-labelledby="usage-title">
    <h2 id="usage-title" class="sr-only">토큰 사용량과 한도</h2>

    <section class="block today" aria-label="오늘 사용량">
      <p class="caption">오늘 사용한 토큰</p>
      <p class="big">{{ formatTokens(u?.todayTotal ?? 0) }}</p>
      <p class="cost">
        API 단가 환산 <strong>{{ formatCost(u?.todayCost ?? 0) }}</strong>
      </p>
      <div class="stack" aria-hidden="true">
        <span v-for="b in breakdown" :key="b.key" :class="b.key" :style="{ flexGrow: b.share }" />
      </div>
      <dl class="legend">
        <div v-for="b in breakdown" :key="b.key" :class="b.key">
          <dt>{{ b.label }}</dt>
          <dd>{{ formatTokens(b.value) }}</dd>
        </div>
      </dl>
    </section>

    <section class="block window" aria-label="레이트 리밋 창">
      <p class="caption">
        5시간 사용 창<template v-if="live && official?.plan"> · <strong class="plan">{{ official.plan }}</strong></template>
      </p>
      <p v-if="resetIn !== null" class="countdown" aria-live="off">
        <span class="clock">{{ formatCountdown(resetIn) }}</span>
        <span class="after">후 리셋</span>
      </p>
      <p v-else class="countdown idle">활성 창이 없습니다. 다음 요청부터 5시간이 시작됩니다.</p>
      <QuotaMeter v-if="fiveHour" label="이번 창" :percent="fiveHourPercent" detail="Claude 실측" />
      <QuotaMeter v-else label="이번 창" :used="u?.rateWindow.used ?? 0" :limit="u?.rateWindow.limit ?? 1" detail="로컬 추정" />
    </section>

    <section class="block quotas" aria-label="주간·월간 할당량">
      <QuotaMeter
        v-if="sevenDay"
        label="이번 주"
        :percent="sevenDay.percent"
        :detail="weekResetsAt ? `${formatResetAt(weekResetsAt)} 리셋` : 'Claude 실측'"
      />
      <template v-else>
        <QuotaMeter label="이번 주" :used="u?.week.used ?? 0" :limit="u?.week.limit ?? 1" detail="로컬 추정 · 월요일 기준" />
        <QuotaMeter label="이번 달" :used="u?.month.used ?? 0" :limit="u?.month.limit ?? 1" detail="로컬 추정 · 1일 기준" />
      </template>
      <p v-if="official && official.status !== 'ok'" class="warn" role="status">
        {{ official.status === 'stale' ? '최신 조회에 실패해 마지막 값을 보여줍니다.' : 'Claude 실측값을 가져오지 못해 로컬 추정치를 보여줍니다.' }}
        {{ official.message }}
      </p>
    </section>

    <section class="block ranking" aria-labelledby="ranking-title">
      <h3 id="ranking-title" class="caption">프로젝트별 오늘 사용량</h3>
      <ol v-if="topProjects.length" class="rank">
        <li v-for="p in topProjects" :key="p.projectId ?? p.cwd" :class="{ hot: p.last5m >= (cmd.demo.value ? 300_000 : 400_000) }">
          <span class="rank-name">{{ nameOf(p.projectId, p.cwd) }}</span>
          <span class="rank-val">{{ formatTokens(projectTotal(p)) }}</span>
          <span class="rank-bar" aria-hidden="true"><span :style="{ transform: `scaleX(${projectTotal(p) / maxProject})` }" /></span>
        </li>
      </ol>
      <p v-else class="muted">오늘 기록된 사용량이 없습니다.</p>
    </section>

    <p v-if="u && !u.sourceAvailable" class="note">
      사용량 로그 폴더를 찾지 못했습니다: <code>{{ shortPath(u.sourceDir) }}</code>. Claude Code를 한 번 실행하면 생성됩니다.
    </p>
    <p v-if="!live" class="note">추정 한도는 백엔드 환경 변수(CLAUDEBOARD_*_TOKENS)로 조정합니다.</p>
  </aside>
</template>

<style scoped lang="scss">
.rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.block {
  display: grid;
  gap: 10px;
  padding: 16px 0;
  border-top: 1px solid var(--rule);
  &:first-of-type {
    border-top: 0;
    padding-top: 0;
  }
}

.caption {
  margin: 0;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--text-3);
}

.big {
  margin: -4px 0 0;
  font-size: 2.6rem;
  font-weight: 750;
  font-stretch: 75%;
  line-height: 1;
  letter-spacing: -0.02em;
}
.cost {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-2);
  strong {
    color: var(--text);
  }
}

.stack {
  display: flex;
  gap: 2px;
  height: 8px;
  span {
    flex-basis: 0;
    min-width: 2px;
    border-radius: 2px;
  }
}
.cacheRead {
  --sw: #4f6378;
}
.input {
  --sw: var(--idle);
}
.cacheWrite {
  --sw: var(--thinking);
}
.output {
  --sw: var(--ok);
}
.stack span {
  background: var(--sw);
}

.legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  margin: 0;
  div {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    font-size: var(--fs-xs);
  }
  dt {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-3);
    &::before {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 2px;
      background: var(--sw);
    }
  }
  dd {
    margin: 0;
    color: var(--text-2);
  }
}

.countdown {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: -4px 0 0;
  .clock {
    font-size: var(--fs-2xl);
    font-weight: 700;
    font-stretch: 80%;
    letter-spacing: 0.01em;
  }
  .after {
    color: var(--text-2);
  }
  &.idle {
    font-size: var(--fs-sm);
    color: var(--text-2);
  }
}

.quotas {
  gap: 16px;
}

.rank {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3px 8px;
  }
}
.rank-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-sm);
}
.rank-val {
  font-size: var(--fs-sm);
  font-weight: 600;
  .hot & {
    color: var(--executing);
  }
}
.rank-bar {
  grid-column: 1 / -1;
  height: 3px;
  background: var(--ink-3);
  border-radius: 2px;
  overflow: hidden;
  span {
    display: block;
    height: 100%;
    background: var(--text-3);
    transform-origin: left;
    transition: transform 700ms var(--ease-out);
    .hot & {
      background: var(--executing);
    }
  }
}

.plan {
  color: var(--text);
}
.warn {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--executing);
}

.muted,
.note {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.note {
  padding-top: 8px;
}
</style>
