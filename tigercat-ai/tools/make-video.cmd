@echo off
rem 더블클릭하면: 최신 파일 받기 -> 영상 만들기 -> 완성 폴더 열기
rem (괄호 블록으로 감싸서, git pull 이 이 파일을 바꿔도 안전하게 끝까지 실행됨)
(
  chcp 65001 > nul
  cd /d "%~dp0.."
  set "CFG=%~1"
  if "%CFG%"=="" set "CFG=short1_motion"
  echo.
  echo  [1/3] 최신 파일을 받는 중...
  git pull origin claude/new-session-p1cwk0
  if errorlevel 1 (
    echo.
    echo  최신 파일 받기에 실패했습니다. 인터넷 연결을 확인하고 다시 해 보세요.
    pause
    exit /b 1
  )
  echo.
  echo  [2/3] 영상을 만드는 중... 1~3분 걸립니다. 창을 닫지 마세요.
  node media\make-short.mjs media\%CFG%.json
  if errorlevel 1 (
    echo.
    echo  영상 만들기에 실패했습니다. 위의 글자를 캡처해서 알려 주세요.
    pause
    exit /b 1
  )
  echo.
  echo  [3/3] 완성! 폴더를 엽니다.
  explorer "%cd%\media\out\%CFG%"
  echo.
  pause
  exit /b 0
)
