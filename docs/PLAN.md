# ClaudeBoard 설계 문서

## 1. Explore

- 시작 시점에 작업 디렉터리는 비어 있었고 전용 저장소도 없었기 때문에 pnpm 워크스페이스 모노레포로 새로 구성했다.
- 분리 전략: 실시간 PTY·파일 감시가 필요한 부분은 `apps/backend`(Node), 화면은 `apps/frontend`(Nuxt 4 SPA), 두 쪽이 공유하는 메시지 스키마는 `packages/shared`.
- 프론트엔드는 SSR이 필요 없는 로컬 도구라 `ssr: false` + `nuxt generate`로 정적 빌드하고, 운영 시 백엔드가 같은 포트(4317)에서 서빙한다. 개발 중에는 Nuxt dev(3000)가 백엔드(4317)에 직접 붙는다.

## 2. Plan: 백엔드

| 모듈 | 역할 |
| --- | --- |
| `sessionManager.ts` | 프로젝트당 `Session` 하나. node-pty 스폰, 512KB 링버퍼(재접속 재생), @xterm/headless 가상 화면, 120ms 디바운스 화면 분석, 승인 응답 키 전송 |
| `statusParser.ts` | 순수 함수 `analyzeScreen(lines)` / `analyzeWorkflow(lines, status)` |
| `usageTracker.ts` | `~/.claude/projects/**/*.jsonl` 증분 읽기(바이트 오프셋), `message.id:requestId` 중복 제거, 일·주·월·5시간 창 집계, 급증 감지 |
| `pricing.ts` | 모델 접두사별 100만 토큰 단가, 캐시 쓰기 1.25배·읽기 0.1배(공시값 우선) |
| `server.ts` | Fastify REST + `ws`(noServer) 업그레이드, Origin 검사, 브로드캐스트 |
| `mock/mock-claude.mjs` | 데모·테스트용 Claude Code 흉내 CLI. 실제와 같은 형식의 사용량 jsonl도 기록 |

### 상태 판정 규칙 (우선순위 순)

1. 화면 하단에 `Do you want to …?` 와 `1. Yes` 메뉴가 같이 보이면 `REQUIRES_APPROVAL(menu)`. 승인은 Enter, 거절은 Esc.
2. 마지막 줄이 `[y/n]`, `(y/N)`, `(yes/no)`로 끝나면 `REQUIRES_APPROVAL(yn)`. `y⏎` / `n⏎`.
3. `esc to interrupt` 또는 스피너 줄이 있으면 바쁨. 그 위의 가장 가까운 도구 헤더가 Bash·Edit·Write 등 변경 도구면 `EXECUTING`, 읽기 도구이거나 없으면 `THINKING`.
4. 그 외 `IDLE`. 단, 바쁨→IDLE 전환은 900ms 유지돼야 확정(단계 사이 스피너가 잠깐 사라지는 순간 오판 방지).

### 워크플로우 진행률

단계 표식(`[Plan]`, `## Execute`, `단계: 검토`, `Phase: verify` 등, 한글 별칭 포함)의 마지막 출현으로 현재 단계를 정하고, 구간 기준값 plan 10 / execute 35 / review 65 / verify 85 사이를 Todo 완료 비율로 보간한다. verify 단계에서 IDLE이 되면 100%. `Progress: 72%` 같은 명시값이 단계 표식보다 뒤에 있으면 그것을 쓴다.

## 3. Plan: 인터페이스

### REST

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, version, demo }` |
| GET/POST | `/api/projects` | 목록 / `{ name?, cwd, command?, args?, autoStart? }`로 추가 |
| DELETE | `/api/projects/:id` | 삭제(세션 종료) |
| GET | `/api/sessions`, `/api/usage`, `/api/alerts` | 스냅샷 조회 |

### WebSocket `/ws` (JSON, `t` 필드로 구분)

클라이언트 → 서버: `subscribe`, `unsubscribe`, `input`(원시 키), `prompt`(텍스트+엔터), `resize`, `approve{decision}`, `start`, `stop`, `restart`, `ping`

서버 → 클라이언트: `hello`(전체 상태), `projects`, `session`(스냅샷 변경 시만), `session-removed`, `replay`(구독 직후 링버퍼), `output`(구독자에게만), `usage`, `alert`, `error`, `pong`

전체 타입은 `packages/shared/src/index.ts`.

## 4. 디자인 결정 (frontend-design)

- **콘셉트**: 항공 관제탑의 비행 진행 스트립(flight progress strip). 흔한 카드 그리드 대신 세션 하나가 가로 스트립 한 장이고, 왼쪽 레일 색이 상태를 말한다. 선택하면 프롬프트와 퀵 액션이 스프링으로 펼쳐진다.
- **색**: 청회색 바탕 4단(`#0f1620` → `#243142`) 위에 상태 신호색만 쓴다. 대기 `#7fa3c2`, 추론 `#a99bf0`, 실행 `#f0973a`(주황), 승인 `#f2577a`, 완료 `#57c79a`. 색에는 항상 텍스트 라벨이 붙는다.
- **글꼴**: Archivo(가변 폭 축으로 숫자·제목을 좁게/넓게) + 터미널·경로·명령에만 JetBrains Mono.
- **모션**: 펄스는 상태별로 다르게(추론은 느린 호흡, 실행은 퍼지는 링, 승인은 빠른 링). 모달·배너·탭 표시줄·스트립 펼침은 `linear()` 스프링, 버튼은 누를 때 `scale(.97)`. `prefers-reduced-motion`이면 모두 끈다.
- **접근성**: landmark(header/main/aside/section), 진행률은 `role=progressbar`+`aria-valuetext`, 할당량은 `role=meter`, 승인 배너는 `role=alert`, 명령창은 combobox/listbox 패턴과 포커스 트랩, 건너뛰기 링크, `:focus-visible` 링.
- **키보드**: `⌘K/Ctrl+K` 명령창, `↑/↓` 스트립 이동, `t` 터미널, `/` 지시 입력, `Esc` 닫기(터미널 안의 Esc는 Claude Code로 전달).
