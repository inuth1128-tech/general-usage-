# 더블클릭으로 쓰기 (PowerShell 입력 없이)

## 처음 한 번만 (붙여넣기 1번)
PowerShell에 아래 **한 줄**을 붙여넣고 Enter:
```
cd ~\tigercat\general-usage-; git pull origin claude/new-session-p1cwk0; .\tigercat-ai\tools\create-desktop-shortcuts.cmd
```
바탕화면에 아이콘 2개가 생깁니다.

## 그 다음부터는 더블클릭만
| 아이콘 | 하는 일 |
|--------|---------|
| **tigercat - make video** | 최신 파일 받기 → 영상 만들기 → 완성 폴더 열기 |
| **tigercat - start site** | 최신 파일 받기 → 업무사이트 켜기 → 브라우저 열기 |

- 영상 만들기는 기본으로 `short1_motion` 을 만듭니다.
- 매번 최신 파일을 먼저 받기 때문에, 제가 고쳐서 올린 것이 자동으로 반영됩니다.
- 사이트는 창을 닫으면 꺼집니다.
