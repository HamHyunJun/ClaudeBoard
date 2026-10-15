# ClaudeBoard — Claude Multi-Project Commander

여러 VS Code 창을 오가며 Claude Code를 하나씩 조작하는 대신, 브라우저 한 화면에서 로컬의 모든 Claude Code 세션을 모니터링하고 지시하고 승인하는 관제 대시보드입니다.

![승인 대기 화면](docs/screenshots/3-approval.png)

## 무엇을 할 수 있나

- **프로젝트별 세션 관리**: 등록한 디렉터리마다 Claude Code를 백그라운드 PTY(node-pty)로 띄우고 유지합니다. 스트립에서 바로 프롬프트를 보내거나 xterm.js 터미널을 열어 직접 상호작용합니다.
- **상태 4단계 추적**: 터미널 화면을 가상 터미널(@xterm/headless)로 재구성해 `IDLE / THINKING / EXECUTING / REQUIRES_APPROVAL`을 판정합니다. 실행 중에는 주황색 바가 흐릅니다.
- **워크플로우 진행률**: `[Plan] → [Execute] → [Review] → [Verify]` 단계 표식과 Claude Code의 Todo 체크리스트(☒/☐)로 0~100% 진행률을 계산합니다.
- **토큰·비용 모니터링**: `~/.claude/projects/**/*.jsonl` 세션 로그를 증분으로 읽어 오늘 사용량, API 단가 환산 비용, 주간·월간 잔여량, 5시간 사용 창 리셋 카운트다운, 프로젝트별 토큰 급증(Token Hog) 경고를 보여줍니다.
- **원클릭 승인**: 권한 다이얼로그나 `[y/n]` 프롬프트를 감지하면 상단 배너에 [승인]/[거절]이 뜹니다. 작업 완료·승인 요청은 데스크톱 알림으로도 받습니다.
- **⌘K 명령창**: 세션 시작·중지·재시작, 터미널 열기, 승인, `@프로젝트 지시문`으로 즉시 프롬프트 전송.

## 빠르게 실행하기

```bash
pnpm install

# 1) 데모 모드: claude 없이 모의 CLI로 전체 흐름 확인 (http://127.0.0.1:4317)
pnpm build && pnpm --filter @claudeboard/backend start:demo

# 2) 실제 사용: 백엔드(4317) + Nuxt 개발 서버(3000)
pnpm dev
```

실제 모드에서는 `claude` 명령이 PATH에 있어야 합니다. 프로젝트는 화면의 **프로젝트 추가**로 등록하며 `~/.claudeboard/projects.json`에 저장됩니다.

## 구조

```
packages/shared   WebSocket 프로토콜·도메인 타입 (백엔드·프론트 공용)
apps/backend      Fastify + ws + node-pty 프로세스 매니저, 상태 파서, 사용량 집계, mock-claude
apps/frontend     Nuxt 4 SPA (Vue 3 + TypeScript + Scoped SCSS + xterm.js)
docs/PLAN.md      설계 문서 (인터페이스·데이터 스키마·디자인 결정)
```

## 환경 변수 (백엔드)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `CLAUDEBOARD_PORT` / `CLAUDEBOARD_HOST` | `4317` / `127.0.0.1` | 로컬 전용으로 바인딩 |
| `CLAUDEBOARD_CMD`, `CLAUDEBOARD_ARGS` | `claude` | 세션마다 실행할 명령 |
| `CLAUDEBOARD_TOKEN` | 없음 | 설정하면 `?token=` 또는 `Authorization: Bearer` 필요 |
| `CLAUDEBOARD_WEEKLY_TOKENS` / `MONTHLY_TOKENS` / `WINDOW_TOKENS` | 150M / 600M / 25M | 할당량 바의 기준값 |
| `CLAUDEBOARD_HOG_TOKENS_5M` | 400k | 최근 5분 급증 경고 임계값 |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | 사용량 로그 위치 |
| `CLAUDEBOARD_DEMO=1` | 꺼짐 | mock-claude로 데모 실행 |

## 보안

로컬 도구지만 셸을 띄우는 서버이므로 `127.0.0.1`에만 바인딩하고, WebSocket·REST 모두 `localhost` 계열 Origin만 허용합니다(다른 사이트가 브라우저를 통해 접속하는 CSWSH 차단). 원격에서 접근해야 한다면 `CLAUDEBOARD_TOKEN`을 설정하고 SSH 터널을 쓰세요.

## 검증

```bash
pnpm typecheck   # shared · backend(tsc) · frontend(nuxt typecheck)
pnpm test        # 상태 파서·사용량 단위 테스트 + 데모 세션 E2E (PTY 입출력, 상태 전이, 승인, 사용량)
pnpm build       # 백엔드 esbuild 번들 + nuxt generate
```

## 알려진 한계

- 상태 판정은 Claude Code 화면 문구(`esc to interrupt`, `Do you want to proceed?` 등)에 기댑니다. CLI 화면이 바뀌면 `apps/backend/src/statusParser.ts`의 패턴을 갱신해야 합니다.
- 비용은 API 공시 단가로 환산한 추정치입니다. 구독(Pro/Max) 요금과는 다릅니다. 주간·월간·5시간 한도도 Anthropic이 값을 공개하지 않아 환경 변수로 지정합니다.
