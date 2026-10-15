import type { ApprovalRequest, GitRepoState, SessionStatus, WorkflowProgress, WorkflowStage } from '@claudeboard/shared'
import { WORKFLOW_STAGES } from '@claudeboard/shared'

/**
 * 터미널 화면(가상 터미널의 현재 뷰포트) 텍스트를 보고 세션 상태를 추정한다.
 *
 * Claude Code는 Ink 기반 TUI라 같은 줄을 커서 이동으로 계속 다시 그린다.
 * 그래서 원시 stdout 스트림이 아니라 @xterm/headless 로 재구성한 "화면"을 입력으로 받는다.
 * 순수 함수로 두어 픽스처 기반 단위 테스트가 가능하게 한다.
 */

/** 파일을 바꾸거나 명령을 실행하는 도구 → EXECUTING */
const MUTATING_TOOLS = ['Bash', 'Edit', 'MultiEdit', 'Write', 'Update', 'Create', 'NotebookEdit', 'Delete']
/** 읽기·탐색 도구 → 추론의 일부로 보고 THINKING */
const READING_TOOLS = ['Read', 'Grep', 'Glob', 'LS', 'Search', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'TodoWrite']

const TOOL_HEADER = new RegExp(`^\\s*[⏺●•]\\s*(${[...MUTATING_TOOLS, ...READING_TOOLS].join('|')})\\((.*)`)
/** 작업 중일 때 스피너 줄에 항상 붙는 안내 */
const BUSY_MARKER = /esc to interrupt|ctrl\+c to interrupt/i
/** 스피너 글리프 + "…" 로 끝나는 동사 (예: "✻ Thinking…", "✶ Pondering…") */
const SPINNER_LINE = /^\s*[·✢✳✶✻✽*⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+\S+…/
const RUNNING_LINE = /⎿\s+(Running|실행 중)…?/

const MENU_QUESTION = /(Do you want to [^?]+\?|Would you like to [^?]+\?|진행할까요\?|허용하시겠습니까\?)/i
const MENU_YES = /^\s*(❯|>)?\s*1\.\s*(Yes|예|허용)/i
/** Claude Code 의 선택형 질문(AskUserQuestion) 하단 안내와 번호 선택지 */
const ASK_FOOTER = /Enter to select/i
const ASK_OPTION = /^\s*(❯|>)?\s*1\.\s+\S/
const YN_PROMPT = /(\[(y|Y)\/(n|N)\]|\((y|Y)\/(n|N)\)|\(yes\/no\)|\[yes\/no\])\s*[:?]?\s*$/

export interface ScreenAnalysis {
  status: SessionStatus
  approval?: Omit<ApprovalRequest, 'detectedAt'>
  activeTool?: string
  /** 화면에서 가장 최근의 의미 있는 출력 한 줄 */
  lastLine?: string
  /** HUD 줄에서 읽은 git 상태 */
  git?: GitRepoState[]
}

const clean = (line: string): string => {
  return line.replace(/\s+$/u, '')
}

/** 상자 테두리 문자를 걷어낸 본문 */
const unbox = (line: string): string => {
  return line.replace(/^[\s│┃|╭╮╰╯─━]+|[\s│┃|╭╮╰╯─━]+$/gu, '').trim()
}

const GIT_SYMBOL: Record<string, keyof Omit<GitRepoState, 'branch'>> = {
  '+': 'staged', '!': 'modified', '?': 'untracked', '⇡': 'ahead', '⇣': 'behind'
}

/** `branch:main | ?4, branch:dev | !3 ?3` → 저장소별 상태. HUD 줄이 아니면 undefined */
export function parseGitHud(line: string): GitRepoState[] | undefined {
  if (!/\bbranch:/.test(line)) return undefined
  const repos = line.split(/,\s*(?=branch:)/).flatMap((part) => {
    const branch = part.match(/branch:(\S+)/)?.[1]
    if (!branch) return []
    const repo: GitRepoState = { branch, staged: 0, modified: 0, untracked: 0, ahead: 0, behind: 0 }
    for (const [, sym, n] of part.matchAll(/([+!?⇡⇣])(\d+)/g)) repo[GIT_SYMBOL[sym!]!] = Number(n)
    return [repo]
  })
  return repos.length ? repos : undefined
}

const isChrome = (line: string): boolean => {
  const t = line.trim()
  if (!t) return true
  // 입력 상자 테두리, 단축키 안내 같은 UI 크롬은 요약 대상에서 제외
  if (/^[╭╰─━│┃\s]+[╮╯─━│┃\s]*$/u.test(t)) return true
  if (/^[│┃]?\s*>\s*[│┃]?$/u.test(t)) return true
  if (/\? for shortcuts|shift\+tab|auto-accept|bypass permissions/i.test(t)) return true
  // CLI 자체 경고 배너(예: "⚠ Transcript saving is off …")는 대시보드에서 의미 없다
  if (/^⚠\s/.test(t)) return true
  // 하단 상태줄(HUD): `[omc#…] | Model: …`, `Model: … | ctx …` 처럼 | 로 나뉜 메타 정보
  if (parseGitHud(t)) return true
  if (/^\[[\w#.-]+\]\s*\|/.test(t) || (/\bModel:/i.test(t) && t.includes('|'))) return true
  return false
}

export function analyzeScreen(rawLines: string[]): ScreenAnalysis {
  const git = [...rawLines].reverse().slice(0, 25).map((l) => parseGitHud(unbox(l))).find(Boolean)
  return { ...analyzeBody(rawLines), git }
}

const analyzeBody = (rawLines: string[]): ScreenAnalysis => {
  const lines = rawLines.map(clean)
  // 실제 내용이 있는 마지막 줄 위치
  let end = lines.length
  while (end > 0 && !lines[end - 1]!.trim()) end--
  const visible = lines.slice(0, end)
  const tail = visible.slice(-25)

  const lastRaw = [...visible].reverse().find((l) => !isChrome(l) && unbox(l).length > 1)
  const lastLine = lastRaw ? unbox(lastRaw) : undefined

  // 1) 승인 대기: 화면 하단에 질문 + "1. Yes" 메뉴가 같이 보이면 Claude Code 권한 다이얼로그
  const qIdx = findLastIndex(tail, (l) => MENU_QUESTION.test(l))
  if (qIdx >= 0 && tail.slice(qIdx).some((l) => MENU_YES.test(unbox(l)))) {
    const question = unbox(tail[qIdx]!).match(MENU_QUESTION)?.[1] ?? unbox(tail[qIdx]!)
    // 다이얼로그 상자(╭ … ╰) 안쪽만 맥락으로 쓴다. 상자가 없으면 질문 위 몇 줄
    const boxTop = findLastIndex(tail.slice(0, qIdx), (l) => /^\s*╭/.test(l))
    const context = tail
      .slice(boxTop >= 0 ? boxTop + 1 : Math.max(0, qIdx - 8), qIdx)
      .map(unbox)
      .filter((l) => l && !/^[─━]+$/u.test(l))
    const toolLine = boxTop > 0 ? tail.slice(Math.max(0, boxTop - 3), boxTop).find((l) => TOOL_HEADER.test(l)) : undefined
    return {
      status: 'REQUIRES_APPROVAL',
      approval: { kind: 'menu', question, context: context.slice(-6) },
      activeTool: toolLine?.match(TOOL_HEADER)?.[1] ?? detectTool(context),
      lastLine: question
    }
  }

  // 1-1) 선택형 질문: "Enter to select" 안내와 "1. …" 선택지가 같이 보인다. 승인 메뉴가 아닌 경우만 여기로 온다
  if (tail.some((l) => ASK_FOOTER.test(l))) {
    const optIdx = findLastIndex(tail, (l) => ASK_OPTION.test(unbox(l)))
    if (optIdx >= 0) {
      // 선택지 위쪽, 탭 표시줄(☐/✔)이나 구분선 아래의 본문이 질문
      const head = findLastIndex(tail.slice(0, optIdx), (l) => /[☐✔☒]|^[─━]{5,}/u.test(l))
      const question = tail
        .slice(head + 1, optIdx)
        .map(unbox)
        .filter(Boolean)
        .join(' ')
      return { status: 'ASKING', lastLine: question || '선택지에 답해 주세요' }
    }
  }

  // 2) 일반 [y/n] 프롬프트: 마지막 줄이 y/n 질문으로 끝날 때
  const last = unbox(visible[visible.length - 1] ?? '')
  if (YN_PROMPT.test(last)) {
    return {
      status: 'REQUIRES_APPROVAL',
      approval: {
        kind: 'yn',
        question: last,
        context: visible.slice(-6, -1).map(unbox).filter(Boolean)
      },
      lastLine: last
    }
  }

  // 3) 작업 중 여부: "esc to interrupt" 또는 스피너 줄
  const busyIdx = findLastIndex(tail, (l) => BUSY_MARKER.test(l) || SPINNER_LINE.test(l))
  if (busyIdx >= 0) {
    // 스피너 위쪽으로 가장 가까운 도구 호출 헤더를 찾아 무엇을 하는지 판단
    const above = tail.slice(0, busyIdx + 1)
    const toolIdx = findLastIndex(above, (l) => TOOL_HEADER.test(l))
    const assistantTextIdx = findLastIndex(above, (l) => /^\s*[⏺●]\s+(?![A-Za-z]+\()/.test(l))
    const runningIdx = findLastIndex(above, (l) => RUNNING_LINE.test(l))
    if (toolIdx >= 0 && toolIdx > assistantTextIdx) {
      const tool = above[toolIdx]!.match(TOOL_HEADER)![1]!
      const mutating = MUTATING_TOOLS.includes(tool) || runningIdx > toolIdx
      return { status: mutating ? 'EXECUTING' : 'THINKING', activeTool: tool, lastLine }
    }
    return { status: 'THINKING', lastLine }
  }

  return { status: 'IDLE', lastLine }
}

const detectTool = (lines: string[]): string | undefined => {
  for (const l of [...lines].reverse()) {
    const m = l.match(TOOL_HEADER)
    if (m) return m[1]
    const title = l.match(/^(Bash command|Edit file|Create file|Write file|Fetch)/i)
    if (title) return title[1]!.split(' ')[0] === 'Bash' ? 'Bash' : title[1]!.split(' ')[0]
  }
  return undefined
}

const findLastIndex = <T>(arr: T[], pred: (v: T) => boolean): number => {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i]!)) return i
  return -1
}

/* ───────────── 워크플로우 진행률 ───────────── */

const STAGE_ALIASES: Record<string, WorkflowStage> = {
  plan: 'plan',
  planning: 'plan',
  계획: 'plan',
  explore: 'plan',
  탐색: 'plan',
  execute: 'execute',
  execution: 'execute',
  implement: 'execute',
  실행: 'execute',
  구현: 'execute',
  review: 'review',
  검토: 'review',
  리뷰: 'review',
  verify: 'verify',
  verification: 'verify',
  검증: 'verify'
}
const ALIAS_GROUP = Object.keys(STAGE_ALIASES).join('|')
/** "[Plan]", "## Execute", "Phase: review", "단계: 검증", "▶ verify" 같은 단계 표식 */
const STAGE_PATTERNS = [
  new RegExp(`\\[(${ALIAS_GROUP})\\]`, 'i'),
  new RegExp(`^\\s*#{1,4}\\s*(?:\\d+\\.\\s*)?(${ALIAS_GROUP})(?![A-Za-z])`, 'i'),
  new RegExp(`(?:phase|stage|step|단계)\\s*[:：]\\s*(${ALIAS_GROUP})(?![A-Za-z])`, 'i'),
  new RegExp(`^\\s*[▶►]\\s*(${ALIAS_GROUP})(?![A-Za-z])`, 'i')
]
const EXPLICIT_PROGRESS = /(?:progress|진행률)\s*[:：]?\s*(\d{1,3})\s*%/i
/** Claude Code TodoWrite 렌더링: ☒ 완료, ☐ 대기, ◼/■ 진행 중 */
const TODO_LINE = /^\s*(?:⎿\s*)?([☒☐◼◻■□✔✓])\s+\S/

/** 단계별 기준 진행률: 해당 단계에 "들어섰을 때" 값 */
const STAGE_BASE: Record<WorkflowStage, number> = { plan: 10, execute: 35, review: 65, verify: 85 }

const VERIFY_CMD = /\b(test|vitest|jest|pytest|typecheck|tsc|lint|build|check)\b/i
const USER_PROMPT = /^\s*[│┃]?\s*>\s+\S/

/**
 * 단계 표식이 없을 때 도구 사용 이력으로 단계를 추정한다. 마지막 사용자 프롬프트 이후만 보고,
 * 단계는 되돌아가지 않는다(수정 후 파일을 다시 읽어도 execute 유지).
 * shortcut: 도구 종류만 보는 휴리스틱, 'review' 는 표식이 있을 때만 잡힌다.
 */
const inferStage = (lines: string[]): WorkflowStage | null => {
  const from = findLastIndex(lines, (l) => USER_PROMPT.test(l)) + 1
  let best = -1
  for (const l of lines.slice(from)) {
    const m = l.match(TOOL_HEADER)
    if (!m) continue
    const tool = m[1]!
    const stage: WorkflowStage = READING_TOOLS.includes(tool)
      ? 'plan'
      : tool === 'Bash' && VERIFY_CMD.test(m[2] ?? '')
        ? 'verify'
        : 'execute'
    best = Math.max(best, WORKFLOW_STAGES.indexOf(stage))
  }
  return best >= 0 ? WORKFLOW_STAGES[best]! : null
}

export function analyzeWorkflow(bufferLines: string[], status: SessionStatus): WorkflowProgress {
  let stage: WorkflowStage | null = null
  let stageLine = -1
  let explicit: number | null = null
  let explicitLine = -1

  for (let i = 0; i < bufferLines.length; i++) {
    const line = bufferLines[i]!
    for (const re of STAGE_PATTERNS) {
      const m = line.match(re)
      if (m) {
        stage = STAGE_ALIASES[m[1]!.toLowerCase()] ?? stage
        stageLine = i
        break
      }
    }
    const p = line.match(EXPLICIT_PROGRESS)
    if (p) {
      explicit = Math.min(100, Number(p[1]))
      explicitLine = i
    }
  }

  if (!stage) stage = inferStage(bufferLines)

  // 가장 마지막에 그려진 연속된 Todo 블록만 센다 (이전 버전은 위로 스크롤된 사본)
  let done = 0
  let total = 0
  for (let i = bufferLines.length - 1; i >= 0; i--) {
    const m = bufferLines[i]!.match(TODO_LINE)
    if (m) {
      for (let j = i; j >= 0; j--) {
        const mm = bufferLines[j]!.match(TODO_LINE)
        if (!mm) {
          if (bufferLines[j]!.trim() === '') continue
          break
        }
        total++
        if (['☒', '✔', '✓'].includes(mm[1]!)) done++
      }
      break
    }
  }

  // 단계 표식보다 이후에 나온 명시적 진행률이 가장 우선
  if (explicit !== null && explicitLine >= stageLine) {
    return { stage, percent: explicit, source: 'explicit', todos: total ? { done, total } : undefined }
  }

  if (stage) {
    const idx = WORKFLOW_STAGES.indexOf(stage)
    const base = STAGE_BASE[stage]
    const next = idx + 1 < WORKFLOW_STAGES.length ? STAGE_BASE[WORKFLOW_STAGES[idx + 1]!] : 100
    // 마지막 단계(verify)를 지나 대기 상태가 되면 완료로 본다
    if (stage === 'verify' && status === 'IDLE') {
      return { stage, percent: 100, source: 'stage', todos: total ? { done, total } : undefined }
    }
    // 현재 단계 안에서의 세부 진척은 Todo 비율로 보간
    const inner = total ? done / total : 0
    const percent = Math.round(base + (next - base) * inner * 0.9)
    return { stage, percent, source: total ? 'todos' : 'stage', todos: total ? { done, total } : undefined }
  }

  if (total) {
    return { stage: null, percent: Math.round((done / total) * 100), source: 'todos', todos: { done, total } }
  }
  return { stage: null, percent: 0, source: 'none' }
}
