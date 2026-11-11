@echo off
rem 더블클릭하면: 최신 파일 받기 -> 업무사이트 켜기 -> 브라우저 열기
(
  chcp 65001 > nul
  cd /d "%~dp0.."
  echo.
  echo  [1/2] 최신 파일을 받는 중...
  git pull origin claude/new-session-p1cwk0
  echo.
  echo  [2/2] 업무사이트를 켭니다. 이 창을 닫으면 사이트가 꺼집니다.
  start "" http://localhost:3001
  node --disable-warning=ExperimentalWarning server\index.js
  pause
  exit /b 0
)
