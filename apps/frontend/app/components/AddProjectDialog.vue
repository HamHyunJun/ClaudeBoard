<template>
  <BaseDialog :open="open" labelledby="add-title" @close="emit('close')">
    <form class="form" novalidate @submit.prevent="submit">
      <h2 id="add-title">프로젝트 추가</h2>
      <p class="lead">이 디렉터리에서 Claude Code를 백그라운드로 실행하고 대시보드에 연결합니다.</p>

      <div class="field">
        <label for="f-cwd">프로젝트 경로</label>
        <div class="path-row">
          <input
            id="f-cwd"
            v-model="form.cwd"
            class="code"
            type="text"
            autofocus
            autocomplete="off"
            spellcheck="false"
            placeholder="~/work/payments-api"
            :aria-invalid="!!error"
            aria-describedby="f-cwd-help f-error"
          />
          <button type="button" class="btn" :aria-expanded="browsing" aria-controls="dir-browser" @click="toggleBrowse">
            {{ browsing ? '닫기' : '찾아보기' }}
          </button>
        </div>
        <p id="f-cwd-help" class="help">백엔드가 실행 중인 컴퓨터의 절대 경로 또는 ~ 로 시작하는 경로</p>

        <div v-if="browsing" id="dir-browser" class="browser" role="group" aria-label="폴더 찾아보기">
          <div class="crumb">
            <button type="button" class="up" :disabled="!listing?.parent" aria-label="상위 폴더" @click="browse(listing!.parent!)">↑</button>
            <code class="here" :title="listing?.path">{{ listing?.path ?? '…' }}</code>
          </div>
          <ul ref="listEl" class="dirs" aria-label="하위 폴더">
            <li v-for="d in listing?.dirs" :key="d">
              <button type="button" class="dir" @click="browse(listing!.path.replace(/\/$/, '') + '/' + d)">{{ d }}</button>
            </li>
          </ul>
          <p v-if="listing && !listing.dirs.length" class="empty">하위 폴더가 없습니다.</p>
          <p class="browse-error" role="alert">{{ browseError }}</p>
          <button type="button" class="btn primary pick" :disabled="!listing" @click="pick">이 폴더 선택</button>
        </div>
      </div>

      <div class="field">
        <label for="f-name">표시 이름 <span class="opt">선택</span></label>
        <input id="f-name" v-model="form.name" type="text" autocomplete="off" placeholder="비우면 폴더 이름을 씁니다" />
      </div>

      <div class="field">
        <label for="f-cmd">실행 명령 <span class="opt">선택</span></label>
        <input id="f-cmd" v-model="form.command" class="code" type="text" autocomplete="off" spellcheck="false" placeholder="claude" />
      </div>

      <label class="check">
        <input v-model="form.autoStart" type="checkbox" />
        <span>추가하자마자 세션 시작</span>
      </label>

      <p id="f-error" class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">취소</button>
        <button type="submit" class="btn primary" :disabled="saving">{{ saving ? '추가하는 중' : '프로젝트 추가' }}</button>
      </div>
    </form>
  </BaseDialog>
</template>

<script setup lang="ts">
/** 로컬 디렉터리를 관제 대상 프로젝트로 등록한다 */
import type { DirListing } from '@claudeboard/shared'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const cmd = useCommander()
const { toast } = useNotify()

const form = reactive({ name: '', cwd: '', command: '', autoStart: true })
const error = ref('')
const saving = ref(false)

// 폴더 찾아보기: 백엔드가 실행 중인 컴퓨터의 디렉터리를 한 단계씩 연다
const browsing = ref(false)
const listing = ref<DirListing | null>(null)
const browseError = ref('')
const listEl = ref<HTMLElement | null>(null)

const browse = async (path?: string): Promise<void> => {
  browseError.value = ''
  try {
    listing.value = await cmd.listDirs(path)
    await nextTick()
    listEl.value?.scrollTo({ top: 0 })
  } catch (e) {
    browseError.value = (e as Error).message
  }
}

const toggleBrowse = (): void => {
  browsing.value = !browsing.value
  if (browsing.value) browse(form.cwd.trim() || undefined)
}

const pick = (): void => {
  if (!listing.value) return
  form.cwd = listing.value.path
  browsing.value = false
  error.value = ''
}

const submit = async (): Promise<void> => {
  if (!form.cwd.trim()) {
    error.value = '프로젝트 경로를 입력하세요.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const p = await cmd.addProject({
      name: form.name.trim(),
      cwd: form.cwd.trim(),
      command: form.command.trim() || undefined,
      autoStart: form.autoStart
    })
    if (form.autoStart) cmd.start(p.id)
    cmd.selectedId.value = p.id
    toast({ level: 'info', title: `${p.name} 프로젝트를 추가했습니다` }, 3000)
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

watch(
  () => props.open,
  (o) => {
    if (o) {
      Object.assign(form, { name: '', cwd: '', command: '', autoStart: true })
      error.value = ''
      browsing.value = false
      listing.value = null
      browseError.value = ''
    }
  }
)
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
  margin: -8px 0 4px;
  color: var(--text-2);
}
.field {
  display: grid;
  gap: 6px;
  label {
    font-weight: 600;
    font-size: var(--fs-sm);
  }
  input {
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-sm);
    background: var(--ink-0);
    &:focus-visible {
      outline: none;
      border-color: var(--focus);
    }
    &[aria-invalid='true'] {
      border-color: var(--approval);
    }
  }
}
.path-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.browser {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  background: var(--ink-1);
}
.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.up {
  @include pressable;
  flex: none;
  width: 32px;
  height: 32px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-sm);
  background: var(--ink-2);
  &:disabled {
    opacity: 0.4;
  }
}
.here {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl; // 길면 앞이 아니라 뒤(현재 폴더)가 보이게
  text-align: left;
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.dirs {
  display: grid;
  max-height: 220px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.dir {
  @include pressable;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  font-size: var(--fs-sm);
  &::before {
    content: '▸ ';
    color: var(--text-3);
  }
  &:hover {
    background: var(--ink-3);
  }
}
.empty,
.browse-error {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.browse-error {
  color: var(--approval);
  &:empty {
    display: none;
  }
}
.pick {
  justify-self: end;
}
.opt {
  font-weight: 400;
  color: var(--text-3);
}
.help {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
  input {
    width: 16px;
    height: 16px;
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
