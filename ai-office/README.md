# AI 사무실

AI 작업 세션을 등각(isometric) 사무실로 보여주는 정적 웹 화면. 빌드 없이 `index.html` 한 장이다.

## 실행
```bash
cd ai-office
python3 feed_demo.py &          # (시험용) state.json 을 1초마다 갱신
python3 -m http.server 8000     # → http://localhost:8000/
```
`file://` 로 직접 열면 브라우저가 `state.json` 읽기를 막는다. 서버로 열 것.
자료 없이 화면만 보려면 우측 위 **데모 보기** (`?demo`). 데모의 **자료 끊기**는 '확인 중' 동작 시험용이다.

## state.json 형식 (1초마다 읽음)
```json
{
  "updated_at": 1793893159405,
  "day_over": false,
  "floors": [{"id": "web", "name": "웹 개발"}],
  "sessions": [
    {"id": "m1", "name": "로그인 구현", "floor": "web", "role": "main",
     "status": "working", "started_at": 1793892559405},
    {"id": "s1", "name": "테스트 작성", "floor": "web", "role": "sub", "parent": "m1",
     "status": "working", "started_at": 1793893100000}
  ],
  "questions": [{"id": "q1", "session": "m1", "text": "OAuth 추가할까요?", "asked_at": 1793893000000}]
}
```
시각은 ms(또는 ISO 문자열). `status`: `working` `blocked` `reporting` `idle`, 끝난 세션은 `done`(또는 목록에서 제거).
`updated_at`은 **쓰는 쪽이 매번 현재 시각으로 갱신**해야 한다.

## 동작
| 데이터 | 화면 |
|---|---|
| 층 | 1층 로비(전체) · 2층~(`floors` 순서) · 맨 위 대표실. 왼쪽 버튼/↑↓ 키로 엘리베이터처럼 이동 |
| `working` | 타자. 40분 넘으면 💧 |
| `blocked` | 고민 + 💧 |
| `reporting` | 만세 + ⭐ |
| `idle` | ☕ 커피 · 💤 졸음 |
| `role:"sub"` 등장/사라짐 | 엘리베이터에서 "출근합니다!" / "퇴근합니다!" 하고 퇴장 |
| `questions` | 해당 세션이 대표실 앞에 줄 섬(자리는 ❓ 유령). 3분↑ 💧, 10분↑ 쪼그려 앉아 땀 |
| `day_over:true` | 방마다 1.2초 간격으로 소등 |
| 갱신 정지 | `updated_at`이 5초 넘게 낡거나 읽기 실패 → 애니메이션·효과·타이머 정지, '확인 중' 표시 |

시간 경과(몇 분째, 대기 몇 분)는 `updated_at` 기준이라 자료가 멈추면 같이 멈춘다.
서버의 `Date` 헤더로 시계 차이를 보정한다.
