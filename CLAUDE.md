# ClaudeBoard 작업 지침

- 모든 답변, 코드 주석, 커밋 메시지는 한국어로 작성한다.
- pnpm 워크스페이스 모노레포: `packages/shared`(프로토콜 타입), `apps/backend`(Fastify + ws + node-pty), `apps/frontend`(Nuxt 4 SPA).
- WebSocket 메시지나 도메인 타입을 바꿀 때는 `packages/shared/src/index.ts`를 먼저 고치고 양쪽을 맞춘다. 백엔드·프론트에 같은 타입을 따로 정의하지 않는다.
- 상태 판정 로직(`apps/backend/src/statusParser.ts`)은 순수 함수로 유지하고, 패턴을 바꾸면 `test/statusParser.test.ts`에 실제 화면 픽스처를 추가한다.
- 프론트 스타일은 컴포넌트별 `<style scoped lang="scss">`. 색·모션 값은 `app/assets/styles/main.scss`의 CSS 변수를 쓰고 하드코딩하지 않는다. 믹스인(`pressable`, `focus-ring`)과 브레이크포인트(`$bp-*`)는 자동 주입된다.
- 변경 후 확인: `pnpm typecheck && pnpm test && pnpm build`. 화면 확인은 `pnpm build && pnpm --filter @claudeboard/backend start:demo` 후 http://127.0.0.1:4317.
- 대시보드 안에서 돌아가는 Claude(autoStart)가 이 저장소를 고칠 때는 백엔드를 `tsx watch`로 띄우지 않는다. 소스가 바뀌면 백엔드가 재기동하며 자식 `claude` 세션을 죽인다. `pnpm dev`는 watch 없이 뜨고, 필요하면 `dev:watch`를 쓴다.
- 구독 한도(5시간·주간)는 `officialUsage.ts`가 Claude 계정에서 직접 읽는다(플랜·사용률·리셋 시각). 로컬 로그 합산은 조회 실패 시 대체 표시일 뿐이다.
