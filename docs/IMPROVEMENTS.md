# 개선안 제안

## 2026-10-20 — 각 프로젝트 별로 개선사항, 추가 아이디어 보고해
- `apps/frontend/app/components/SessionRack.vue`: 변경 영역 기준 리팩토링/성능 점검 필요
- `apps/frontend/app/composables/useCommander.ts`: 변경 영역 기준 리팩토링/성능 점검 필요

## 2026-10-20 — 추가 아이디어 제시
- `apps/frontend/app/components/SessionRack.vue`: 변경 영역 기준 리팩토링/성능 점검 필요
- `apps/frontend/app/composables/useCommander.ts`: 변경 영역 기준 리팩토링/성능 점검 필요
- `docs/IMPROVEMENTS.md`: 변경 영역 기준 리팩토링/성능 점검 필요

## 2026-10-20 — 추가 아이디어 제시해
- `apps/frontend/app/components/SessionRack.vue`: 변경 영역 기준 리팩토링/성능 점검 필요
- `apps/frontend/app/composables/useCommander.ts`: 변경 영역 기준 리팩토링/성능 점검 필요
- `docs/IMPROVEMENTS.md`: 변경 영역 기준 리팩토링/성능 점검 필요

## 2026-10-20 — 아이디어 제시 (PixelBoss 기획팀 · 변경 파일 기준 실제 분석)
위 네 섹션의 "점검 필요" 줄은 자동 생성된 자리표시자라 내용이 없고 매번 중복됩니다. 아래가 실제 분석입니다. (읽기 전용 분석, 코드 미수정)

### P1 — 성능/안정성
- `useCommander.ts:151` `session` 메시지마다 `sessions` 객체를 통째로 새로 만든다. 그 결과 `sessionList`(`:200`)가 모든 프로젝트의 `{project, session}` 객체를 새로 만들어 `SessionRack.vue:59` 의 모든 `SessionStrip` 이 세션 하나만 바뀌어도 재렌더될 수 있다. 세션 수 × 갱신 빈도만큼 낭비. 제안: `sessions` 를 `shallowReactive` 맵으로 두고 키 단위로 갱신하거나, `sessionList` 항목을 id 별로 캐시해 바뀐 세션만 새 객체로 교체.
- `useCommander.ts:124` `JSON.parse` 를 try/catch 없이 호출한다. 최근 서버 쪽 잘못된 WS 메시지 수정(4ee6d52)과 달리 클라이언트는 방어가 없어, 깨진 프레임 하나가 `handle` 이전에 예외를 던져 해당 메시지를 조용히 잃는다. 제안: 파싱 실패를 잡아 `lastError` 로 보고하고 연결은 유지.

### P2 — 구조/리팩토링
- `useCommander.ts:200-231` computed 와 `watchEffect`(`:207`)가 `useCommander()` 호출 안에 있어 호출한 컴포넌트마다 중복 생성된다. `seenDoneAt` 갱신 watchEffect 는 호출 수만큼 같은 일을 반복하고, 컴포넌트 밖에서 호출되면 정리되지 않는다. 상태가 이미 모듈 스코프 싱글턴이므로 파생값(`sessionList`·`counts`·`terminalTarget`)과 watch 도 모듈 스코프로 올려 한 번만 만든다.
- `useCommander.ts` 한 파일이 WS 연결/재접속(`:112-133`), 메시지 리듀서(`:135`), REST 래퍼(`:180`), 순서 변경 로직(`:293-310`)을 모두 가진다. 연결·스토어·REST 로 나누면 테스트가 쉬워진다. `Commander` 인터페이스(`:31-65`)와 return 객체(`:261`)를 이중으로 유지하는 것도 부담. 단 YAGNI 상 분리는 이 파일이 더 커질 때 해도 된다.
- `useCommander.ts:293-310` `moveProject` 와 `moveProjectBefore` 가 ids 계산 + PUT 을 중복한다. `reorder(ids)` 하나로 PUT 을 모으면 줄어든다.
- `useCommander.ts:166` 알림을 50개로 자르지만 `hello`(`:142`)는 서버가 준 만큼 그대로 담는다. 상한 규칙을 한 곳에 두거나 서버 보장에 의존한다고 명시.

### P2 — SessionRack.vue
- `SessionRack.vue:174,196` 드래그 중 `dragover` 는 매우 자주 발생하는데 그때마다 `sessionList.map` 으로 id 배열을 새로 만든다. `computed(() => sessionList.map(...))` 하나로 `:174`·`:196` 및 이동 로직에서 재사용.
- `SessionRack.vue:76,124,142` `checkedIds` 가 배열이라 스트립마다 `includes` O(n), 토글마다 배열 복사. 지금 규모(수십 개 이하)에선 무해하지만 `Set` 으로 바꾸면 의도도 분명하다. 우선순위 낮음.
- `SessionRack.vue:117-121` `usageById` 타입이 `NonNullable<typeof cmd.usage.value>['projects'][number]` 로 장황하다. `shared` 에 프로젝트 사용량 타입이 있으면 그것을 import.
- `SessionRack.vue:220` 포커스 지연 `setTimeout(…, 60)` 은 마법 숫자다. 스트립 마운트/전환 완료를 기다리는 것이면 `nextTick` 두 번이나 전환 종료 이벤트로 대체 가능한지 확인.

### P3 — 아이디어
- 일괄 지시(`SessionRack.vue:150`)는 확인 없이 즉시 전송한다. 실수로 여러 세션에 같은 지시가 나가면 되돌릴 수 없으므로 3개 이상일 때 한 번 확인하거나 "실행 취소" 토스트를 고려.
- WS 재접속(`useCommander.ts:125-131`)에 탭 가시성/`online` 이벤트 연동이 없다. 노트북 절전 복귀 후 최대 10초 기다리는 대신 `visibilitychange`·`online` 에서 `reconnectNow()` 를 호출하면 복귀가 빨라진다.

### 요약 우선순위
1. `sessions` 갱신 단위 재렌더 줄이기 (`useCommander.ts:151`, `:200`)
2. 파생 상태·watchEffect 를 모듈 스코프로 (`useCommander.ts:200-231`)
3. 클라이언트 `JSON.parse` 방어 (`useCommander.ts:124`)
4. 드래그 id 배열 computed 화 (`SessionRack.vue:174,196`)
- 확인하지 않은 것: 실제 재렌더 횟수 측정(프로파일링), 서버가 `session` 메시지를 얼마나 자주 보내는지, `SessionStrip.vue` 내부 구현.
- `apps/frontend/app/components/SessionRack.vue`: 변경 영역 기준 리팩토링/성능 점검 필요
- `apps/frontend/app/composables/useCommander.ts`: 변경 영역 기준 리팩토링/성능 점검 필요
- `docs/IMPROVEMENTS.md`: 변경 영역 기준 리팩토링/성능 점검 필요
