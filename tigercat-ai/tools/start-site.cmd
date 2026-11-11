@echo off
rem 더블클릭하면: 최신 파일 받기 -> 업무사이트 켜기 -> (켜진 뒤에) 브라우저 자동 열기
rem 이미 켜져 있으면 브라우저만 엽니다. 사이트의 "최신 버전으로 업데이트" 후에는 자동으로 다시 켜집니다.
(
  chcp 65001 > nul
  cd /d "%~dp0.."
  echo.
  echo  [1/2] 최신 파일을 받는 중...
  git pull origin claude/new-session-p1cwk0
  echo.
  echo  [2/2] 업무사이트를 켭니다. 이 창을 닫으면 사이트가 꺼집니다.
  set "OPEN_BROWSER=1"
  for /l %%i in (1,1,1000) do (
    node --disable-warning=ExperimentalWarning server\index.js
    if errorlevel 75 (
      echo.
      echo  업데이트를 적용하려고 사이트를 다시 켭니다...
      set "OPEN_BROWSER="
    ) else (
      if errorlevel 1 (
        echo.
        echo  사이트가 오류로 꺼졌습니다. 위의 글자를 캡처해서 알려 주세요.
        pause
      )
      exit /b 0
    )
  )
  exit /b 0
)
