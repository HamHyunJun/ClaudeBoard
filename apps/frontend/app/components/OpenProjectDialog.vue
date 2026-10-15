<template>
  <BaseDialog :open="open" labelledby="open-title" @close="close">
    <form class="form" @submit.prevent="submit">
      <h2 id="open-title">폴더 열기</h2>
      <p class="lead">
        <code>{{ project?.cwd }}</code>
      </p>

      <fieldset class="apps">
        <legend>열 응용 프로그램</legend>
        <label v-for="a in OPEN_APPS" :key="a.id" class="app" :class="{ on: app === a.id }">
          <input v-model="app" type="radio" name="open-app" :value="a.id" />
          <span>{{ a.label }}</span>
        </label>
      </fieldset>

      <p class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <button type="button" class="btn" @click="close">취소</button>
        <button type="submit" class="btn primary" :disabled="opening">{{ opening ? '여는 중' : '열기' }}</button>
      </div>
    </form>
  </BaseDialog>
</template>

<script setup lang="ts">
/** 프로젝트 폴더를 어떤 응용 프로그램으로 열지 확인받고 실행한다 */
import { OPEN_APPS, type OpenAppId } from '@claudeboard/shared'

const KEY = 'claudeboard:open-app'
const cmd = useCommander()
const { toast } = useNotify()

const project = computed(() => cmd.projects.value.find((p) => p.id === cmd.openTargetId.value))
const open = computed(() => !!project.value)
const app = ref<OpenAppId>('vscode')
const opening = ref(false)
const error = ref('')

watch(open, (o) => {
  if (!o) return
  error.value = ''
  try {
    const saved = localStorage.getItem(KEY)
    if (OPEN_APPS.some((a) => a.id === saved)) app.value = saved as OpenAppId
  } catch {
    // 저장소를 못 읽으면 기본값 사용
  }
})

function close(): void {
  cmd.openTargetId.value = null
}

async function submit(): Promise<void> {
  const p = project.value
  if (!p) return
  opening.value = true
  error.value = ''
  try {
    await cmd.openProject(p.id, app.value)
    try {
      localStorage.setItem(KEY, app.value)
    } catch {
      // 기억하지 못해도 열기는 성공
    }
    toast({ level: 'info', title: `${p.name} 폴더를 열었습니다` }, 3000)
    close()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    opening.value = false
  }
}
</script>

<style scoped lang="scss">
.form {
  display: grid;
  gap: 16px;
  padding: 22px 24px 20px;
}
h2 {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: 700;
  font-stretch: 88%;
}
.lead {
  margin: -8px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.apps {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
  legend {
    margin-bottom: 8px;
    padding: 0;
    font-weight: 600;
    font-size: var(--fs-sm);
  }
}
.app {
  @include pressable;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-2);
  font-weight: 600;
  &.on {
    border-color: var(--text);
  }
  &:has(:focus-visible) {
    border-color: var(--focus);
  }
  input {
    accent-color: var(--text);
  }
}
.error {
  min-height: 1.2em;
  margin: -8px 0 0;
  font-size: var(--fs-sm);
  color: var(--approval);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  @include pressable;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-2);
  font-weight: 600;
  &.primary {
    border-color: transparent;
    background: var(--text);
    color: var(--ink-0);
  }
  &:disabled {
    opacity: 0.6;
  }
}
</style>
