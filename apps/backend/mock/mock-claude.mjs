#!/usr/bin/env node
/**
 * mock-claude: 데모·테스트용 Claude Code 흉내 CLI.
 *
 * 실제 Claude Code 화면과 비슷한 출력(스피너, 도구 호출 헤더, Todo 체크리스트, 권한 다이얼로그,
 * [y/n] 프롬프트)을 내고, $CLAUDE_CONFIG_DIR/projects/ 아래에 실제와 같은 형식의 사용량 jsonl 을 남긴다.
 * 덕분에 claude 를 설치·로그인하지 않아도 대시보드의 상태 파싱·승인·토큰 집계를 끝까지 확인할 수 있다.
 *
 * 환경 변수: MOCK_SPEED (기본 1, 작을수록 빠름), CLAUDE_CONFIG_DIR
 */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'

const SPEED = Number(process.env.MOCK_SPEED ?? '1') || 1
const out = (s) => process.stdout.write(s)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SPEED))
const cwd = process.cwd()
const project = basename(cwd)
const sessionId = randomUUID()

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  orange: (s) => `\x1b[38;5;208m${s}\x1b[39m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`
}

/* ───────────── 사용량 로그 ───────────── */

const configDir = process.env.CLAUDE_CONFIG_DIR
const logDir = configDir ? join(configDir, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')) : null
if (logDir) mkdirSync(logDir, { recursive: true })
const logFile = logDir ? join(logDir, `${sessionId}.jsonl`) : null

function logUsage(scale = 1, at = Date.now()) {
  if (!logFile) return
  const r = (a, b) => Math.round((a + Math.random() * (b - a)) * scale)
  const id = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  const line = {
    type: 'assistant',
    timestamp: new Date(at).toISOString(),
    cwd,
    sessionId,
    requestId: `req_${randomUUID().slice(0, 12)}`,
    uuid: randomUUID(),
    message: {
      id,
      model: 'claude-opus-5-5',
      usage: {
        input_tokens: r(800, 4000),
        output_tokens: r(200, 1800),
        cache_creation_input_tokens: r(0, 6000),
        cache_read_input_tokens: r(8000, 40000)
      }
    }
  }
  appendFileSync(logFile, JSON.stringify(line) + '\n')
}

// 오늘 이른 시각의 사용 이력을 조금 남겨 대시보드가 비어 보이지 않게 한다
if (logDir && !existsSync(join(logDir, '.seeded'))) {
  const now = Date.now()
  for (let i = 0; i < 14; i++) logUsage(1, now - (i + 1) * 9 * 60_000 - Math.random() * 60_000)
  appendFileSync(join(logDir, '.seeded'), '')
}

/* ───────────── 화면 요소 ───────────── */

const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽']
let spinnerTimer = null

function startSpinner(verb) {
  const started = Date.now()
  let i = 0
  let tokens = 0
  const draw = () => {
    const secs = Math.floor((Date.now() - started) / 1000)
    tokens += Math.round(Math.random() * 40)
    out(`\r\x1b[2K${C.orange(GLYPHS[i++ % GLYPHS.length])} ${C.orange(verb + '…')} ${C.dim(`(${secs}s · ↑ ${tokens} tokens · esc to interrupt)`)}`)
  }
  draw()
  spinnerTimer = setInterval(draw, 120)
}

function stopSpinner() {
  clearInterval(spinnerTimer)
  spinnerTimer = null
  out('\r\x1b[2K')
}

async function think(verb, ms) {
  startSpinner(verb)
  await sleep(ms)
  stopSpinner()
  logUsage()
}

function say(text) {
  out(`${C.bold('⏺')} ${text}\r\n`)
}

async function tool(name, arg, verb, ms, result) {
  out(`${C.green('⏺')} ${C.bold(name)}(${arg})\r\n`)
  if (name === 'Bash') out(`  ⎿  ${C.dim('Running…')}\r\n`)
  await think(verb, ms)
  if (result) out(`  ⎿  ${C.dim(result)}\r\n`)
}

function todos(items) {
  out(`${C.bold('⏺')} Update Todos\r\n`)
  items.forEach(([done, text], i) => {
    out(`  ${i === 0 ? '⎿' : ' '}  ${done ? C.dim('☒ ' + text) : '☐ ' + text}\r\n`)
  })
}

function promptBox() {
  const w = Math.min(process.stdout.columns || 72, 72) - 2
  out(`\r\n${C.dim('╭' + '─'.repeat(w) + '╮')}\r\n`)
  out(`${C.dim('│')} > ${' '.repeat(w - 3)}${C.dim('│')}\r\n`)
  out(`${C.dim('╰' + '─'.repeat(w) + '╯')}\r\n`)
  out(`  ${C.dim('? for shortcuts')}\r\n`)
  // 입력 커서를 상자 안으로 이동
  out(`\x1b[3A\x1b[5G`)
}

/* ───────────── 입력 처리 ───────────── */

let mode = 'prompt' // prompt | busy | dialog | yn
let buffer = ''
let pending = null
let ctrlC = 0

if (process.stdin.isTTY) process.stdin.setRawMode(true)
process.stdin.setEncoding('utf8')
process.stdin.on('data', (data) => {
  if (data === '\x03') {
    if (++ctrlC >= 2) {
      out('\r\n')
      process.exit(0)
    }
    setTimeout(() => (ctrlC = 0), 1500)
    return
  }
  if (mode === 'dialog') {
    if (data === '\r' || data === '1' || data === '2') return resolvePending('yes')
    if (data === '\x1b' || data === '3') return resolvePending('no')
    return
  }
  if (mode === 'yn') {
    for (const ch of data) {
      if (ch === '\r') return resolvePending(buffer.trim().toLowerCase().startsWith('y') ? 'yes' : 'no')
      if (ch === '\x7f') buffer = buffer.slice(0, -1)
      else buffer += ch
      out(ch === '\x7f' ? '\b \b' : ch)
    }
    return
  }
  if (mode !== 'prompt') return
  for (const ch of data) {
    if (ch === '\r') {
      const text = buffer.trim()
      buffer = ''
      if (text) void run(text)
      return
    }
    if (ch === '\x7f') {
      if (buffer) {
        buffer = buffer.slice(0, -1)
        out('\b \b')
      }
      continue
    }
    if (ch < ' ') continue
    buffer += ch
    out(ch)
  }
})

function resolvePending(answer) {
  const p = pending
  pending = null
  buffer = ''
  mode = 'busy'
  p?.(answer)
}

/** Claude Code 스타일 권한 다이얼로그 */
function permissionDialog(title, command, description) {
  const w = Math.min(process.stdout.columns || 72, 72) - 2
  const row = (s = '') => {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, '')
    // 한글 등 전각 문자는 터미널에서 2칸을 차지한다
    const cells = [...plain].reduce((n, ch) => n + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60]/.test(ch) ? 2 : 1), 0)
    return `${C.orange('│')} ${s}${' '.repeat(Math.max(0, w - 1 - cells))}${C.orange('│')}\r\n`
  }
  const lines = [
    C.orange('╭' + '─'.repeat(w) + '╮') + '\r\n',
    row(C.bold(title)),
    row(),
    row(`  ${command}`),
    row(`  ${C.dim(description)}`),
    row(),
    row('Do you want to proceed?'),
    row(`${C.cyan('❯')} ${C.cyan('1. Yes')}`),
    row(`  2. Yes, and don't ask again for this command in ${project}`),
    row('  3. No, and tell Claude what to do differently (esc)'),
    C.orange('╰' + '─'.repeat(w) + '╯') + '\r\n'
  ]
  out(lines.join(''))
  mode = 'dialog'
  return new Promise((resolve) => {
    pending = (answer) => {
      out(`\x1b[${lines.length}A\x1b[0J`)
      resolve(answer)
    }
  })
}

function ynPrompt(question) {
  out(`${question} [y/n] `)
  mode = 'yn'
  buffer = ''
  return new Promise((resolve) => {
    pending = (answer) => {
      out('\r\n')
      resolve(answer)
    }
  })
}

/* ───────────── 시나리오 ───────────── */

async function run(text) {
  mode = 'busy'
  // 입력 상자를 지우고 사용자의 프롬프트를 기록으로 남긴다
  out(`\r\x1b[1A\x1b[0J`)
  out(`${C.dim('>')} ${text}\r\n\r\n`)

  if (text === '/compact') {
    await think('Compacting', 1200)
    out(`${C.dim('⎿  Compacted. ctrl+o to see full summary')}\r\n`)
    return done()
  }
  if (text.startsWith('/ia')) {
    say('[Plan] 저장소 구조를 스캔합니다.')
    await tool('Glob', '"**/*.{ts,vue}"', 'Scanning', 1200, '142 files')
    await tool('Read', 'package.json', 'Reading', 800, 'Read 48 lines')
    say('스캔 결과: 미사용 export 7개, 순환 의존성 1건을 찾았습니다.')
    return done()
  }

  const hog = /대량|hog|전체 리팩터/i.test(text)
  say('[Plan] 요청을 분석하고 작업 계획을 세웁니다.')
  await think('Thinking', 2200)
  const items = ['관련 파일 탐색', '핵심 로직 수정', '빌드 확인', '테스트로 검증']
  todos(items.map((t) => [false, t]))
  await sleep(400)

  say('[Execute] 계획대로 구현을 시작합니다.')
  await tool('Read', 'src/index.ts', 'Reading', 900, 'Read 212 lines')
  todos(items.map((t, i) => [i < 1, t]))
  await tool('Edit', 'src/core/handler.ts', 'Editing', 1800, 'Updated src/core/handler.ts with 14 additions and 3 removals')
  if (hog) for (let i = 0; i < 12; i++) logUsage(6)
  todos(items.map((t, i) => [i < 2, t]))

  out(`${C.green('⏺')} ${C.bold('Bash')}(rm -rf dist && npm run build)\r\n`)
  const answer = await permissionDialog('Bash command', 'rm -rf dist && npm run build', '빌드 산출물을 지우고 다시 빌드합니다')
  if (answer === 'yes') {
    out(`  ⎿  ${C.dim('Running…')}\r\n`)
    await think('Building', 2000)
    out(`  ⎿  ${C.dim('✓ built in 1.84s')}\r\n`)
  } else {
    out(`  ⎿  ${C.red('User rejected the command')}\r\n`)
    say('알겠습니다. dist 삭제 없이 증분 빌드만 확인합니다.')
    await tool('Bash', 'npm run build', 'Building', 1500, '✓ built in 2.10s')
  }
  todos(items.map((t, i) => [i < 3, t]))

  say('[Review] 변경 사항을 검토합니다.')
  await think('Reviewing', 1500)

  if (/deploy|배포/i.test(text)) {
    const yn = await ynPrompt('스테이징에 배포할까요?')
    say(yn === 'yes' ? '스테이징 배포를 시작했습니다.' : '배포를 건너뛰었습니다.')
  }

  say('[Verify] 테스트로 검증합니다.')
  await tool('Bash', 'npm test', 'Testing', 1800, 'Tests: 38 passed, 38 total')
  todos(items.map((t) => [true, t]))
  say(`모든 단계를 완료했습니다. ${project} 의 변경 사항 4개 파일이 검증을 통과했습니다.`)
  done()
}

function done() {
  logUsage()
  mode = 'prompt'
  promptBox()
}

/* ───────────── 시작 화면 ───────────── */

out(`${C.orange('✻')} ${C.bold('Welcome to Claude Code')} ${C.dim('(mock · ClaudeBoard demo)')}\r\n`)
out(`  ${C.dim('cwd: ' + cwd)}\r\n`)
promptBox()
