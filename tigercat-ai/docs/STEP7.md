# 7단계: 쇼츠 1편 — 영상 조립 방법 (Windows)

## 영상 만들기
PowerShell에서:
```
cd ~\tigercat\general-usage-
git pull origin claude/new-session-p1cwk0
cd tigercat-ai
npm run short1
```
1~2분 뒤 `완성: ...\media\out\short1\short1.mp4` 라고 나옵니다.

## 영상 위치 열어보기
```
explorer media\out\short1
```
`short1.mp4` 를 더블클릭하면 재생됩니다. (세로 9:16, 약 30초)

## 하는 일
1. 장면 이미지 5장과 Arthur 음성을 Higgsfield 서버에서 내려받음 (크레딧 0)
2. 음성을 4% 빠르게 해서 30초 안에 맞춤
3. 음성의 쉬는 구간으로 문장 경계를 찾아 자막 타이밍을 맞춤 (못 찾으면 단어 수로 추정)
4. 큰 영어 대문자 자막 (NEVER, START 만 빨강)
5. 장면 5장 + 음성 + 자막 → mp4

## 자주 있는 문제
- `ffmpeg를 찾을 수 없습니다` → PowerShell 창을 닫고 새로 열기
- 자막 글꼴이 이상함 → `$env:CAPTION_FONT="Arial"` 입력 후 다시 `npm run short1`
- 다시 만들 때는 같은 명령을 한 번 더 실행 (내려받은 파일은 재사용)
- 장면 이미지를 새로 만들었다면 `media\out\short1\assets` 폴더를 지우고 실행

---

## 동적인 버전 (추가 파일, 기존 영상은 그대로)
```
npm run short1d
```
`media\out\short1_dynamic\short1_dynamic.mp4` 가 새로 생깁니다. 기존 `short1.mp4` 는 건드리지 않습니다. (이미 받은 이미지·음성은 재사용하므로 `npm run short1` 을 먼저 했다면 바로 만들어집니다. 안 했어도 알아서 내려받습니다.)

- 장면마다 카메라 움직임: 서서히 확대 → 멀어짐 → 반전 장면에서 밀고 들어감 → 따라가며 이동 → 멀어지며 마무리
- 장면 전환 효과 (반전 장면은 원이 퍼지는 전환)
- 자막이 톡 튀어나오며 나타남
- 크레딧 0, 1~3분 소요

전환 종류는 `media/short1_dynamic.json` 의 `transitions` 로 바꿀 수 있습니다. (예: `["fade","circleopen","smoothleft","fade"]`)
