@echo off
rem 한 번만 실행: 바탕화면에 "영상 만들기", "업무사이트 켜기" 아이콘을 만든다.
(
  chcp 65001 > nul
  set "T=%~dp0"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $w=New-Object -ComObject WScript.Shell; foreach($p in @(@('tigercat - make video','make-video.cmd'),@('tigercat - start site','start-site.cmd'))){ $l=$w.CreateShortcut((Join-Path $d ($p[0]+'.lnk'))); $l.TargetPath=(Join-Path $env:T $p[1]); $l.WorkingDirectory=$env:T; $l.Save() }"
  if errorlevel 1 (
    echo.
    echo  바로가기 만들기에 실패했습니다. 위의 글자를 캡처해서 알려 주세요.
    pause
    exit /b 1
  )
  echo.
  echo  바탕화면에 아이콘 2개를 만들었습니다:
  echo    - tigercat - make video  (영상 만들기)
  echo    - tigercat - start site  (업무사이트 켜기)
  echo.
  pause
  exit /b 0
)
