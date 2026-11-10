# 3단계: 비서실장 가동 — 실행 방법 (Windows)

## 최신 파일 받고 켜기
PowerShell에서 (이미 켜져 있으면 Ctrl+C로 먼저 끈 뒤):
```
cd ~\tigercat\general-usage-
git pull origin claude/new-session-p1cwk0
cd tigercat-ai
npm start
```
브라우저에서 http://localhost:3001 을 열고 **새로고침(Ctrl+F5)** 하세요.

## 사용법
1. "비서실장에게 지시하기" 칸에 지시를 씁니다.
2. **지시 보내기**를 누르면 한비서가 Claude로 답합니다. (10~60초)
3. 아래 "업무 기록"에 결과가 나타납니다.

## Pro 한도 보호 장치
- 하루 호출 상한: 기본 20회 (화면에 "오늘 Claude 호출 N / 20회" 표시)
- 한 번에 한 업무만 처리
- 기본 모델은 가벼운 Sonnet
- 상한을 바꾸려면 (PowerShell, 켜기 전에): `$env:DAILY_CALL_LIMIT=30`
- 모델을 바꾸려면: `$env:CLAUDE_MODEL="opus"` (한도를 더 빨리 씁니다)

## 안전 장치
- 한비서는 글로만 답합니다. 업로드·결제·삭제는 하지 않습니다.
- Claude는 비어 있는 폴더(data/sandbox)에서 실행되어 내 파일을 건드리지 못합니다.
- 다른 웹사이트가 이 서버로 지시를 보내는 것을 차단합니다.
