#!/usr/bin/env python3
"""state.json 을 1초마다 새로 써 주는 시험용 스크립트.
   실제로는 AI 세션 관리 쪽이 같은 형식으로 state.json 을 갱신하면 된다.
   사용:  python3 feed_demo.py &  python3 -m http.server 8000  →  http://localhost:8000/
"""
import json, os, time

T0 = time.time()
while True:
    now = int(time.time() * 1000)
    t = time.time() - T0
    ago = lambda m: now - int(m * 60000)
    sessions = [
        {"id": "m1", "name": "로그인 구현", "floor": "web", "role": "main",
         "status": "working", "started_at": ago(12)},
        {"id": "m2", "name": "매출 리포트", "floor": "data", "role": "main",
         "status": "blocked", "started_at": ago(55)},
        {"id": "m3", "name": "배포 파이프라인", "floor": "infra", "role": "main",
         "status": "idle", "started_at": ago(0)},
    ]
    if 6 < t < 40:   # 하위 작업자: 6초에 출근, 40초에 퇴근
        sessions.append({"id": "s1", "name": "테스트 작성", "floor": "web", "role": "sub",
                         "parent": "m1", "status": "working", "started_at": ago((t - 6) / 60)})
    questions = []
    if t > 12:
        questions.append({"id": "q1", "session": "m3", "text": "배포 서버를 재시작할까요?",
                          "asked_at": ago(14)})
    state = {
        "updated_at": now,
        "day_over": False,
        "floors": [{"id": "web", "name": "웹 개발"}, {"id": "data", "name": "데이터 분석"},
                   {"id": "infra", "name": "인프라"}],
        "sessions": sessions,
        "questions": questions,
    }
    here = os.path.dirname(os.path.abspath(__file__))
    tmp = os.path.join(here, "state.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, os.path.join(here, "state.json"))   # 읽는 쪽이 반쯤 쓴 파일을 보지 않게
    time.sleep(1)
