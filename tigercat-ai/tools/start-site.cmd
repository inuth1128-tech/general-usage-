@echo off
rem 더블클릭하면: 최신 파일 받기 -> 업무사이트 켜기 -> 브라우저 열기
rem 사이트의 "최신 버전으로 업데이트" 버튼을 누르면 사이트가 스스로 꺼졌다가(종료 코드 75) 여기서 다시 켜집니다.
(
  chcp 65001 > nul
  cd /d "%~dp0.."
  echo.
  echo  [1/2] 최신 파일을 받는 중...
  git pull origin claude/new-session-p1cwk0
  echo.
  echo  [2/2] 업무사이트를 켭니다. 이 창을 닫으면 사이트가 꺼집니다.
  start "" http://localhost:3001
  for /l %%i in (1,1,1000) do (
    node --disable-warning=ExperimentalWarning server\index.js
    if not errorlevel 75 (
      pause
      exit /b 0
    )
    echo.
    echo  업데이트를 적용하려고 사이트를 다시 켭니다...
  )
  exit /b 0
)
