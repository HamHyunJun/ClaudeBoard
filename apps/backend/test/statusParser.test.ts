import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeScreen, analyzeWorkflow } from '../src/statusParser.ts'

const idleScreen = [
  '⏺ 모든 단계를 완료했습니다.',
  '',
  '╭──────────────────────────────────────╮',
  '│ >                                    │',
  '╰──────────────────────────────────────╯',
  '  ? for shortcuts'
]

test('입력 상자만 보이면 IDLE', () => {
  const r = analyzeScreen(idleScreen)
  assert.equal(r.status, 'IDLE')
  assert.equal(r.lastLine, '⏺ 모든 단계를 완료했습니다.')
})

test('스피너만 있으면 THINKING', () => {
  const r = analyzeScreen(['> 결제 버그 고쳐줘', '', '✻ Thinking… (3s · ↑ 120 tokens · esc to interrupt)'])
  assert.equal(r.status, 'THINKING')
})

test('Bash 도구 실행 중이면 EXECUTING', () => {
  const r = analyzeScreen(['⏺ Bash(npm run build)', '  ⎿  Running…', '✶ Building… (2s · esc to interrupt)'])
  assert.equal(r.status, 'EXECUTING')
  assert.equal(r.activeTool, 'Bash')
})

test('Read 도구는 THINKING 으로 본다', () => {
  const r = analyzeScreen(['⏺ Read(src/index.ts)', '✳ Reading… (1s · esc to interrupt)'])
  assert.equal(r.status, 'THINKING')
  assert.equal(r.activeTool, 'Read')
})

test('도구 이후 일반 응답 텍스트가 나오면 다시 THINKING', () => {
  const r = analyzeScreen(['⏺ Edit(a.ts)', '  ⎿  Updated a.ts', '⏺ 다음으로 테스트를 봅니다.', '✻ Thinking… (esc to interrupt)'])
  assert.equal(r.status, 'THINKING')
})

test('권한 다이얼로그는 REQUIRES_APPROVAL(menu)', () => {
  const r = analyzeScreen([
    '⏺ Bash(rm -rf dist)',
    '╭────────────────────────────╮',
    '│ Bash command               │',
    '│                            │',
    '│   rm -rf dist              │',
    '│                            │',
    '│ Do you want to proceed?    │',
    '│ ❯ 1. Yes                   │',
    "│   2. Yes, and don't ask    │",
    '│   3. No (esc)              │',
    '╰────────────────────────────╯'
  ])
  assert.equal(r.status, 'REQUIRES_APPROVAL')
  assert.equal(r.approval?.kind, 'menu')
  assert.equal(r.approval?.question, 'Do you want to proceed?')
  assert.ok(r.approval?.context.includes('rm -rf dist'))
  assert.equal(r.activeTool, 'Bash')
})

test('[y/n] 프롬프트는 REQUIRES_APPROVAL(yn)', () => {
  const r = analyzeScreen(['배포 준비 완료', '스테이징에 배포할까요? [y/n] '])
  assert.equal(r.status, 'REQUIRES_APPROVAL')
  assert.equal(r.approval?.kind, 'yn')
})

test('워크플로우: 단계 표식과 Todo 로 진행률 계산', () => {
  const plan = analyzeWorkflow(['⏺ [Plan] 계획'], 'THINKING')
  assert.equal(plan.stage, 'plan')
  assert.equal(plan.percent, 10)

  const exec = analyzeWorkflow(['⏺ [Plan] 계획', '⏺ [Execute] 구현', '  ⎿  ☒ a', '     ☒ b', '     ☐ c', '     ☐ d'], 'EXECUTING')
  assert.equal(exec.stage, 'execute')
  assert.deepEqual(exec.todos, { done: 2, total: 4 })
  assert.ok(exec.percent > 35 && exec.percent < 65, `percent=${exec.percent}`)

  const done = analyzeWorkflow(['## Verify', 'Tests passed'], 'IDLE')
  assert.equal(done.percent, 100)
})

test('워크플로우: 명시적 진행률 우선, 한글 단계명 지원', () => {
  assert.equal(analyzeWorkflow(['단계: 검토', 'Progress: 72%'], 'THINKING').percent, 72)
  assert.equal(analyzeWorkflow(['단계: 검토'], 'THINKING').stage, 'review')
  assert.equal(analyzeWorkflow(['그냥 대화'], 'IDLE').source, 'none')
})

test('승인 맥락은 다이얼로그 상자 안쪽만 담는다', () => {
  const r = analyzeScreen([
    '  ⎿  ☐ 테스트로 검증',
    '⏺ Bash(rm -rf dist)',
    '╭──────────────╮',
    '│ Bash command │',
    '│   rm -rf dist│',
    '│ Do you want to proceed? │',
    '│ ❯ 1. Yes     │',
    '╰──────────────╯'
  ])
  assert.deepEqual(r.approval?.context, ['Bash command', 'rm -rf dist'])
  assert.equal(r.activeTool, 'Bash')
})

test('하단 상태줄(HUD)은 마지막 출력으로 잡지 않는다', () => {
  const r = analyzeScreen([
    '⏺ 모든 단계를 완료했습니다.',
    '╭──────────────╮',
    '│ >            │',
    '╰──────────────╯',
    '[omc#5.6.2l] | Model: Sonnet 5.5',
    '  ? for shortcuts'
  ])
  assert.equal(r.lastLine, '⏺ 모든 단계를 완료했습니다.')
})

test('HUD 의 git 상태 줄은 마지막 출력이 아니라 저장소별 상태로 읽는다', () => {
  const r = analyzeScreen(['⏺ 완료했습니다.', 'branch:main | ?4, branch:dev | +1 !3 ?3 ⇡2', '  ? for shortcuts'])
  assert.equal(r.lastLine, '⏺ 완료했습니다.')
  assert.deepEqual(r.git, [
    { branch: 'main', staged: 0, modified: 0, untracked: 4, ahead: 0, behind: 0 },
    { branch: 'dev', staged: 1, modified: 3, untracked: 3, ahead: 2, behind: 0 }
  ])
})

test('단계 표식이 없어도 도구 사용 이력으로 단계를 추정한다', () => {
  const read = analyzeWorkflow(['> 버그 고쳐줘', '⏺ Read(src/a.ts)', '⏺ Grep(foo)'], 'THINKING')
  assert.equal(read.stage, 'plan')
  const edit = analyzeWorkflow(['> 버그 고쳐줘', '⏺ Read(src/a.ts)', '⏺ Edit(src/a.ts)', '⏺ Read(src/b.ts)'], 'EXECUTING')
  assert.equal(edit.stage, 'execute')
  const verify = analyzeWorkflow(['> 버그 고쳐줘', '⏺ Edit(src/a.ts)', '⏺ Bash(pnpm test)'], 'EXECUTING')
  assert.equal(verify.stage, 'verify')
  assert.equal(analyzeWorkflow(['⏺ Bash(pnpm test)', '> 새 질문', '⏺ Read(a.ts)'], 'THINKING').stage, 'plan')
})

test('CLI 경고 배너(⚠ …)는 마지막 출력으로 잡지 않는다', () => {
  const r = analyzeScreen([
    '⏺ 완료했습니다.',
    '⚠ Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker · restart with CL…',
    '  ? for shortcuts'
  ])
  assert.equal(r.lastLine, '⏺ 완료했습니다.')
})
