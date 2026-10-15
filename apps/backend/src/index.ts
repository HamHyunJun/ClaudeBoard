import { loadConfig } from './config.ts'
import { createServer } from './server.ts'

const cfg = loadConfig()
const commander = await createServer(cfg)

try {
  await commander.app.listen({ host: cfg.host, port: cfg.port })
} catch (err) {
  console.error(`[ClaudeBoard] ${cfg.host}:${cfg.port} 에서 서버를 열지 못했습니다`, err)
  process.exit(1)
}

console.log(
  [
    '',
    `  ClaudeBoard 백엔드 ${cfg.demo ? '(데모 모드)' : ''}`,
    `  ▸ API/WS   http://${cfg.host}:${cfg.port}  (ws 경로 /ws)`,
    `  ▸ 프로젝트 ${cfg.dataDir}/projects.json`,
    `  ▸ 사용량   ${cfg.claudeProjectsDir}`,
    cfg.accessToken ? '  ▸ 접속 토큰 사용 중 (CLAUDEBOARD_TOKEN)' : '',
    ''
  ]
    .filter((l) => l !== '')
    .join('\n')
)

const shutdown = async () => {
  await commander.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
