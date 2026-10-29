# 변경 이력

## 2026-10-29
- feat: 세션 전환·폴더 순서 이동·탭 열고 닫기·승인 배너 여닫기에 부드러운 이동 애니메이션
- feat: 음성 입력 마이크 버튼과 인식 말풍선이 부드럽게 나타나고 사라짐
- feat: 사이드바에서 선택된 폴더 표시가 줄 사이를 미끄러지듯 이동
- feat: 터미널 탭 바의 선택 표시도 탭 사이를 미끄러지듯 이동
- fix: 프로젝트 추가의 폴더 찾아보기가 6개만 보이는 작은 목록이라 아래쪽 폴더를 못 찾던 문제 (목록 확대, 이름 필터 추가)
- feat: 명령창에 음성 명령 추가 (Web Speech API, 한국어)
- feat: Shift 두 번으로 음성 입력 시작·중지 (V 키 단축키를 대체)
- feat: 터미널 오른쪽 아래 마이크 버튼으로 Claude 입력창에 음성 입력
- feat: 문장 끝에 "전송"이라고 말하면 음성으로 전송까지

## 2026-10-27
- 9493eed feat: 터미널 헤더 세션 메뉴 도입, 진행 바 제거, 하단 잘림 수정
- ee66de9 docs: README 상단 스크린샷을 사이드바 레이아웃의 새 화면으로 교체
- 788b5c9 docs: 나머지 구형 스크린샷을 사이드바 레이아웃의 새 화면으로 교체
- 2b4c021 docs: README 에 작업 중·완료·세션 메뉴·팔레트·모바일 스크린샷 추가
- 9e27d05 docs: CHANGELOG.md 추가

## 2026-10-23
- 3e9e5f5 feat: 왼쪽 폴더 사이드바 + 중앙 전체 터미널 레이아웃으로 변경
- b072a88 Merge pull request #2: 왼쪽 폴더 사이드바 + 중앙 전체 터미널 레이아웃

## 2026-10-20
- 8fef63e feat: 순서 변경 버튼과 드래그 앤 드롭으로 세션 위치 이동
- 642f4b6 Merge branch 'feat/reorder-drag': 순서 변경 버튼과 드래그 앤 드롭
- 947947c Merge branch 'fix/ws-malformed-message': 잘못된 WS 메시지로 서버가 죽던 문제 수정
- 4ee6d52 fix: 잘못된 WebSocket 메시지 하나로 서버가 죽던 문제
- 02676d3 Merge branch 'feat/resilience-alerts': 자동 재시작, 알림 기록, macOS 알림
- 6940570 feat: 세션 자동 재시작, 알림 기록 보관, 브라우저 없을 때 macOS 알림
- 9246e6d Merge branch 'fix/terminal-stop-button': 터미널 중단 버튼 줄바꿈 수정
- aea3e63 fix: 터미널 패널 '중단' 버튼 줄바꿈 방지, 라벨을 '작업 중단'으로 명확화
- 9023874 Merge branch 'docs/readme-bulk-model': README 에 일괄 지시·모델 배지 정리
- 669aa04 docs: README 에 일괄 지시와 모델 배지 기능 추가
- 3f88a28 Merge branch 'feat/model-from-hud': HUD 에서 세션 모델 읽기
- 04f2e24 feat: 터미널 HUD 의 Model 항목에서 세션 모델을 읽어 배지에 표시
