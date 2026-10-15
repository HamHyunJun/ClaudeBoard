import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { WebSocketServer, WebSocket } from 'ws'
import type { Alert, ClientMessage, CreateProjectBody, ServerMessage } from '@claudeboard/shared'
import { WS_PATH } from '@claudeboard/shared'
import type { ServerConfig } from './config.ts'
import { ProjectStore } from './projectStore.ts'
import { SessionManager } from './sessionManager.ts'
import { UsageTracker } from './usageTracker.ts'

export const SERVER_VERSION = '0.1.0'
const MAX_ALERTS = 50

interface Client {
  ws: WebSocket
  subs: Set<string>
}

/** 로컬 전용 도구이므로 브라우저 Origin 은 localhost 계열만 허용 (CSWSH 방지) */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true // 브라우저가 아닌 클라이언트(테스트, CLI)
  try {
    const { hostname } = new URL(origin)
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)
  } catch {
    return false
  }
}

export interface Commander {
  app: FastifyInstance
  sessions: SessionManager
  usage: UsageTracker
  store: ProjectStore
  close(): Promise<void>
}

export async function createServer(cfg: ServerConfig): Promise<Commander> {
  const store = new ProjectStore(cfg.dataDir)
  if (cfg.demo) seedDemoProjects(store, cfg)
  const sessions = new SessionManager(cfg)
  const usage = new UsageTracker(cfg)
  const alerts: Alert[] = []
  const clients = new Set<Client>()

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn' } })

  const checkToken = (url: string | undefined, header: string | string[] | undefined) => {
    if (!cfg.accessToken) return true
    const q = new URL(url ?? '/', 'http://x').searchParams.get('token')
    return q === cfg.accessToken || header === `Bearer ${cfg.accessToken}`
  }

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return
    if (!isAllowedOrigin(req.headers.origin)) return reply.code(403).send({ error: '허용되지 않은 Origin 입니다' })
    // 개발 중에는 Nuxt dev 서버(:3000)가 다른 포트에서 호출하므로 localhost Origin 에 한해 CORS 허용
    if (req.headers.origin) {
      reply.header('access-control-allow-origin', req.headers.origin)
      reply.header('vary', 'origin')
      if (req.method === 'OPTIONS') {
        reply.header('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS')
        reply.header('access-control-allow-headers', 'content-type,authorization')
        return reply.code(204).send()
      }
    }
    if (!checkToken(req.url, req.headers.authorization)) return reply.code(401).send({ error: '접속 토큰이 필요합니다' })
  })

  /* ───────────── 브로드캐스트 ───────────── */

  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }
  const broadcast = (msg: ServerMessage) => {
    const raw = JSON.stringify(msg)
    for (const c of clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(raw)
  }
  const pushAlert = (alert: Alert) => {
    alerts.unshift(alert)
    alerts.length = Math.min(alerts.length, MAX_ALERTS)
    broadcast({ t: 'alert', alert })
  }

  sessions.on('session', (session) => broadcast({ t: 'session', session }))
  sessions.on('session-removed', (projectId) => broadcast({ t: 'session-removed', projectId }))
  sessions.on('alert', pushAlert)
  // 터미널 출력은 해당 프로젝트를 구독 중인 클라이언트에게만
  sessions.on('output', (projectId: string, data: string) => {
    const raw = JSON.stringify({ t: 'output', projectId, data } satisfies ServerMessage)
    for (const c of clients) if (c.subs.has(projectId) && c.ws.readyState === WebSocket.OPEN) c.ws.send(raw)
  })
  usage.on('usage', (u) => broadcast({ t: 'usage', usage: u }))
  usage.on('alert', pushAlert)

  const syncProjects = () => {
    usage.setProjects(store.list())
    sessions.sync(store.list())
    broadcast({ t: 'projects', projects: store.list() })
  }

  /* ───────────── REST ───────────── */

  app.get('/api/health', async () => ({ ok: true, version: SERVER_VERSION, demo: cfg.demo }))
  app.get('/api/projects', async () => store.list())
  app.get('/api/sessions', async () => sessions.snapshots())
  app.get('/api/usage', async () => usage.summary())
  app.get('/api/alerts', async () => alerts)

  app.post<{ Body: CreateProjectBody }>('/api/projects', async (req, reply) => {
    const body = req.body
    if (!body || typeof body.cwd !== 'string' || !body.cwd.trim()) {
      return reply.code(400).send({ error: 'cwd(프로젝트 경로)가 필요합니다' })
    }
    try {
      const project = store.add(body)
      syncProjects()
      return reply.code(201).send(project)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    if (!store.remove(req.params.id)) return reply.code(404).send({ error: '프로젝트를 찾을 수 없습니다' })
    syncProjects()
    return reply.code(204).send()
  })

  // 빌드된 프론트엔드가 있으면 같은 포트에서 서빙 (SPA 폴백 포함)
  if (existsSync(cfg.staticDir)) {
    await app.register(fastifyStatic, { root: cfg.staticDir })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' })
      return reply.sendFile('index.html')
    })
  }

  /* ───────────── WebSocket ───────────── */

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })

  app.server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const path = (req.url ?? '').split('?')[0]
    if (path !== WS_PATH || !isAllowedOrigin(req.headers.origin) || !checkToken(req.url, req.headers.authorization)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws: WebSocket) => {
    const client: Client = { ws, subs: new Set() }
    clients.add(client)
    send(ws, {
      t: 'hello',
      serverVersion: SERVER_VERSION,
      demo: cfg.demo,
      projects: store.list(),
      sessions: sessions.snapshots(),
      usage: usage.summary(),
      alerts
    })

    ws.on('message', (raw) => {
      let msg: ClientMessage
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return send(ws, { t: 'error', message: '잘못된 메시지 형식입니다' })
      }
      handle(client, msg)
    })
    ws.on('close', () => clients.delete(client))
    ws.on('error', () => clients.delete(client))
  })

  function handle(client: Client, msg: ClientMessage) {
    if (msg.t === 'ping') return send(client.ws, { t: 'pong' })
    const session = sessions.get(msg.projectId)
    if (!session) return send(client.ws, { t: 'error', message: '알 수 없는 프로젝트입니다', projectId: msg.projectId })

    switch (msg.t) {
      case 'subscribe':
        client.subs.add(msg.projectId)
        send(client.ws, { t: 'replay', projectId: msg.projectId, data: session.replay() })
        break
      case 'unsubscribe':
        client.subs.delete(msg.projectId)
        break
      case 'input':
        if (typeof msg.data === 'string') session.write(msg.data)
        break
      case 'prompt':
        if (!session.running) {
          send(client.ws, { t: 'error', message: '세션이 실행 중이 아닙니다. 먼저 시작하세요.', projectId: msg.projectId })
        } else if (typeof msg.text === 'string' && msg.text.trim()) {
          session.sendPrompt(msg.text)
        }
        break
      case 'resize':
        session.resize(msg.cols, msg.rows)
        break
      case 'approve':
        if (!session.answerApproval(msg.decision)) {
          send(client.ws, { t: 'error', message: '대기 중인 승인 요청이 없습니다', projectId: msg.projectId })
        }
        break
      case 'start':
        session.start()
        break
      case 'stop':
        session.stop()
        break
      case 'restart':
        session.restart()
        break
    }
  }

  syncProjects()
  usage.start()

  return {
    app,
    sessions,
    usage,
    store,
    async close() {
      usage.stop()
      sessions.disposeAll()
      for (const c of clients) c.ws.terminate()
      wss.close()
      await app.close()
    }
  }
}

/** 데모 모드: 비어 있으면 임시 디렉터리 세 개를 프로젝트로 등록 */
function seedDemoProjects(store: ProjectStore, cfg: ServerConfig) {
  if (store.list().length) return
  const demos = [
    { name: 'payments-api', autoStart: true },
    { name: 'web-storefront', autoStart: true },
    { name: 'infra-terraform', autoStart: false }
  ]
  for (const d of demos) {
    const cwd = join(cfg.dataDir, 'workspaces', d.name)
    mkdirSync(cwd, { recursive: true })
    store.add({ name: d.name, cwd, autoStart: d.autoStart })
  }
}
