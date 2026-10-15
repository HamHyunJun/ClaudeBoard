import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pty from 'node-pty'
import xtermHeadless from '@xterm/headless'
import type { Alert, ProjectConfig, SessionSnapshot } from '@claudeboard/shared'
import type { ServerConfig } from './config.ts'
import { analyzeScreen, analyzeWorkflow } from './statusParser.ts'

const { Terminal } = xtermHeadless

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 34
/** 출력이 몰릴 때 화면 분석을 묶는 간격 */
const ANALYZE_DEBOUNCE_MS = 120
/** 이 시간 이상 작업하다 IDLE이 되면 "완료" 알림을 보낸다 */
const TASK_DONE_MIN_MS = 4000
/** 작업 단계 사이 잠깐 스피너가 사라지는 순간을 IDLE로 오인하지 않도록 확정까지 기다리는 시간 */
const IDLE_CONFIRM_MS = 900

/** 데모 모드에서 claude 대신 실행할 모의 CLI */
export const MOCK_CLAUDE_PATH = fileURLToPath(new URL('../mock/mock-claude.mjs', import.meta.url))

/**
 * 프로젝트 하나에 대응하는 PTY 세션.
 * - node-pty 로 CLI를 띄우고
 * - 출력은 링버퍼(재접속 시 재생용)와 @xterm/headless 가상 화면(상태 파싱용)에 동시에 흘려보낸다.
 */
export class Session extends EventEmitter {
  private proc?: pty.IPty
  private term = new Terminal({ cols: DEFAULT_COLS, rows: DEFAULT_ROWS, scrollback: 1500, allowProposedApi: true })
  private chunks: string[] = []
  private bytes = 0
  private analyzeTimer?: NodeJS.Timeout
  private busySince: number | null = null
  private idleCandidateAt: number | null = null
  private idleTimer?: NodeJS.Timeout
  private lastEmitted = ''
  snapshot: SessionSnapshot

  constructor(
    public project: ProjectConfig,
    private cfg: ServerConfig
  ) {
    super()
    this.snapshot = {
      projectId: project.id,
      process: 'stopped',
      status: 'IDLE',
      statusSince: Date.now(),
      workflow: { stage: null, percent: 0, source: 'none' },
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS
    }
  }

  get running() {
    return !!this.proc
  }

  start() {
    if (this.proc) return
    const { command, args } = this.resolveCommand()
    if (!existsSync(this.project.cwd)) {
      this.fail(`작업 디렉터리가 없습니다: ${this.project.cwd}`)
      return
    }
    this.update({ process: 'starting', error: undefined, exitCode: undefined })
    try {
      this.proc = pty.spawn(command, args, {
        name: 'xterm-256color',
        cols: this.snapshot.cols,
        rows: this.snapshot.rows,
        cwd: this.project.cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          FORCE_COLOR: '1',
          CLAUDEBOARD_PROJECT_ID: this.project.id,
          ...(this.cfg.demo ? { CLAUDE_CONFIG_DIR: this.cfg.claudeProjectsDir.replace(/[/\\]projects$/, '') } : {})
        } as Record<string, string>
      })
    } catch (err) {
      // 명령을 찾지 못하면 node-pty 가 동기적으로 던진다
      this.fail(`실행하지 못했습니다: ${command} (${(err as Error).message})`)
      return
    }
    this.update({ process: 'running', pid: this.proc.pid })

    this.proc.onData((data) => {
      this.pushChunk(data)
      this.term.write(data)
      this.emit('output', data)
      this.scheduleAnalyze()
    })
    this.proc.onExit(({ exitCode }) => {
      this.proc = undefined
      const msg = `\r\n\x1b[2m[ClaudeBoard] 프로세스가 종료되었습니다 (코드 ${exitCode})\x1b[0m\r\n`
      this.pushChunk(msg)
      this.term.write(msg)
      this.emit('output', msg)
      this.update({ process: 'exited', pid: undefined, exitCode, status: 'IDLE', approval: undefined, activeTool: undefined })
      this.emitAlert({
        level: exitCode === 0 ? 'info' : 'warning',
        kind: 'process-exit',
        title: `${this.project.name} 세션 종료`,
        body: exitCode === 0 ? '정상 종료되었습니다.' : `종료 코드 ${exitCode}로 끝났습니다. 터미널 출력을 확인하세요.`
      })
    })
  }

  stop() {
    if (!this.proc) return
    // Claude Code 는 Ctrl+C 두 번이면 종료된다. 응답이 없으면 강제 종료.
    const proc = this.proc
    proc.write('\x03')
    setTimeout(() => this.proc === proc && proc.write('\x03'), 150)
    setTimeout(() => {
      if (this.proc === proc) proc.kill()
    }, 2500)
  }

  restart() {
    if (!this.proc) return this.start()
    // 기본 onExit 핸들러가 먼저 등록되어 있어 this.proc 정리 후에 다시 시작된다
    this.proc.onExit(() => setTimeout(() => this.start(), 50))
    this.stop()
  }

  write(data: string) {
    this.proc?.write(data)
  }

  /**
   * 프롬프트 전송. 텍스트와 엔터를 한 번에 쓰면 Claude Code 입력창이
   * 붙여넣기로 인식해 줄바꿈만 들어가는 경우가 있어 엔터를 살짝 늦게 보낸다.
   */
  sendPrompt(text: string) {
    if (!this.proc) return
    const proc = this.proc
    proc.write(text.replace(/\r?\n/g, '\r'))
    setTimeout(() => proc.write('\r'), 60)
  }

  /** 승인/거절. 메뉴형은 Enter(1번 Yes) / Esc(거절), y/n 형은 문자 + 엔터 */
  answerApproval(decision: 'yes' | 'no') {
    const approval = this.snapshot.approval
    if (!this.proc || !approval) return false
    if (approval.kind === 'menu') this.proc.write(decision === 'yes' ? '\r' : '\x1b')
    else this.proc.write(decision === 'yes' ? 'y\r' : 'n\r')
    return true
  }

  resize(cols: number, rows: number) {
    cols = Math.max(20, Math.min(400, Math.floor(cols)))
    rows = Math.max(5, Math.min(200, Math.floor(rows)))
    if (cols === this.snapshot.cols && rows === this.snapshot.rows) return
    this.term.resize(cols, rows)
    this.proc?.resize(cols, rows)
    this.update({ cols, rows })
  }

  replay(): string {
    return this.chunks.join('')
  }

  dispose() {
    clearTimeout(this.analyzeTimer)
    clearTimeout(this.idleTimer)
    this.proc?.kill()
    this.proc = undefined
    this.term.dispose()
    this.removeAllListeners()
  }

  private resolveCommand(): { command: string; args: string[] } {
    if (this.cfg.demo && !this.project.command) {
      return { command: process.execPath, args: [MOCK_CLAUDE_PATH, ...(this.project.args ?? [])] }
    }
    return {
      command: this.project.command ?? this.cfg.claudeCommand,
      args: this.project.args ?? this.cfg.claudeArgs
    }
  }

  private fail(error: string) {
    this.update({ process: 'error', error })
    this.emitAlert({ level: 'critical', kind: 'error', title: `${this.project.name} 실행 실패`, body: error })
  }

  private pushChunk(data: string) {
    this.chunks.push(data)
    this.bytes += data.length
    while (this.bytes > this.cfg.replayBytes && this.chunks.length > 1) {
      this.bytes -= this.chunks.shift()!.length
    }
  }

  private scheduleAnalyze() {
    if (this.analyzeTimer) return
    this.analyzeTimer = setTimeout(() => {
      this.analyzeTimer = undefined
      // write 는 비동기로 파싱되므로 처리 완료 후 화면을 읽는다
      this.term.write('', () => this.analyze())
    }, ANALYZE_DEBOUNCE_MS)
  }

  /** 테스트에서 직접 호출할 수 있도록 공개 */
  analyze() {
    const buf = this.term.buffer.active
    const viewport: string[] = []
    for (let i = 0; i < this.term.rows; i++) {
      viewport.push(buf.getLine(buf.viewportY + i)?.translateToString(true) ?? '')
    }
    const all: string[] = []
    const from = Math.max(0, buf.length - 600)
    for (let i = from; i < buf.length; i++) all.push(buf.getLine(i)?.translateToString(true) ?? '')

    const screen = analyzeScreen(viewport)
    const prev = this.snapshot
    const now = Date.now()

    // 바쁨 → IDLE 전환은 잠시 유지되는지 확인한 뒤에 확정한다
    if (screen.status === 'IDLE' && prev.status !== 'IDLE' && this.proc) {
      if (this.idleCandidateAt === null) this.idleCandidateAt = now
      if (now - this.idleCandidateAt < IDLE_CONFIRM_MS) {
        clearTimeout(this.idleTimer)
        this.idleTimer = setTimeout(() => this.analyze(), IDLE_CONFIRM_MS - (now - this.idleCandidateAt) + 10)
        screen.status = prev.status
        screen.activeTool = prev.activeTool
      }
    } else {
      this.idleCandidateAt = null
    }
    if (screen.status === 'IDLE') this.idleCandidateAt = null

    const workflow = analyzeWorkflow(all, screen.status)

    const patch: Partial<SessionSnapshot> = {
      status: screen.status,
      activeTool: screen.activeTool,
      lastLine: screen.lastLine?.slice(0, 200),
      workflow,
      lastOutputAt: now,
      approval: screen.approval
        ? { ...screen.approval, detectedAt: prev.approval?.question === screen.approval.question ? prev.approval.detectedAt : now }
        : undefined
    }
    if (screen.status !== prev.status) patch.statusSince = now

    // 상태 전이에 따른 알림
    if (screen.status !== 'IDLE' && this.busySince === null) this.busySince = now
    if (screen.status === 'REQUIRES_APPROVAL' && prev.status !== 'REQUIRES_APPROVAL') {
      this.emitAlert({
        level: 'critical',
        kind: 'approval',
        title: `${this.project.name}: 승인 필요`,
        body: screen.approval?.question ?? '터미널에서 승인을 기다리고 있습니다.'
      })
    }
    if (screen.status === 'IDLE' && prev.status !== 'IDLE') {
      if (this.busySince !== null && now - this.busySince >= TASK_DONE_MIN_MS) {
        this.emitAlert({
          level: 'info',
          kind: 'task-done',
          title: `${this.project.name}: 작업 완료`,
          body: screen.lastLine ?? '입력을 기다리고 있습니다.'
        })
      }
      this.busySince = null
    }
    this.update(patch)
  }

  private update(patch: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    // lastOutputAt 만 바뀐 경우는 브로드캐스트하지 않는다
    const { lastOutputAt: _ignored, ...rest } = this.snapshot
    const sig = JSON.stringify(rest)
    if (sig === this.lastEmitted) return
    this.lastEmitted = sig
    this.emit('snapshot', this.snapshot)
  }

  private emitAlert(a: Omit<Alert, 'id' | 'at' | 'projectId'>) {
    const at = Date.now()
    this.emit('alert', { ...a, id: `${a.kind}-${this.project.id}-${at}`, at, projectId: this.project.id } satisfies Alert)
  }
}

/** 모든 세션을 관리하고 이벤트를 한 곳으로 모은다 */
export class SessionManager extends EventEmitter {
  private sessions = new Map<string, Session>()

  constructor(private cfg: ServerConfig) {
    super()
  }

  sync(projects: ProjectConfig[]) {
    for (const p of projects) {
      const existing = this.sessions.get(p.id)
      if (existing) {
        existing.project = p
        continue
      }
      const s = new Session(p, this.cfg)
      s.on('snapshot', (snap: SessionSnapshot) => this.emit('session', snap))
      s.on('output', (data: string) => this.emit('output', p.id, data))
      s.on('alert', (alert: Alert) => this.emit('alert', alert))
      this.sessions.set(p.id, s)
      if (p.autoStart) s.start()
    }
    for (const [id, s] of this.sessions) {
      if (!projects.some((p) => p.id === id)) {
        s.dispose()
        this.sessions.delete(id)
        this.emit('session-removed', id)
      }
    }
  }

  get(id: string) {
    return this.sessions.get(id)
  }

  snapshots(): SessionSnapshot[] {
    return [...this.sessions.values()].map((s) => s.snapshot)
  }

  disposeAll() {
    for (const s of this.sessions.values()) s.dispose()
    this.sessions.clear()
  }
}
