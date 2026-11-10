# 2단계: 뼈대 — 실행 방법 (Windows)

## 처음 한 번: 최신 파일 받기
PowerShell에서:
```
cd ~\tigercat\general-usage-
git pull origin claude/new-session-p1cwk0
cd tigercat-ai
```

## 점검 (직원 8명이 등록되는지)
```
npm run check
```
"점검 통과: 정상입니다."가 나오면 성공.

## 업무사이트 켜기
```
npm start
```
브라우저에서 http://localhost:3001 을 열면 조직도와 직원 8명이 보입니다.
끄려면 PowerShell 창에서 Ctrl + C.

## 참고
- 별도 설치(npm install)가 필요 없습니다. Node.js 기본 기능만 사용합니다.
- 데이터는 `data/tigercat.db` 파일 1개에 저장되며 GitHub에는 올라가지 않습니다.
- 처음부터 다시 하려면 `data` 폴더를 지우고 `npm start` 하세요.
