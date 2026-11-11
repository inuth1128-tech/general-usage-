// DB 파일 1개(SQLite)에 직원/업무/회의/메신저/기억을 모두 저장한다.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMPLOYEES } from './employees.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'tigercat.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  title       TEXT NOT NULL,
  role        TEXT NOT NULL,
  reports_to  TEXT REFERENCES employees(id),
  engine      TEXT NOT NULL DEFAULT 'claude',
  tools       TEXT NOT NULL DEFAULT '',
  persona     TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 대표가 비서실장에게 내린 지시와 진행 상태
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'requested',
  assignee_id TEXT REFERENCES employees(id),
  result      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 회의와 메신저 대화
CREATE TABLE IF NOT EXISTS meetings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER REFERENCES tasks(id),
  topic      TEXT NOT NULL,
  minutes    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id  INTEGER REFERENCES meetings(id),
  sender_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Claude 호출 기록 (Pro 한도 관리용)
CREATE TABLE IF NOT EXISTS usage_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT,
  task_id     INTEGER,
  ok          INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 기억 시스템: 했던 일, 성공/실패, 배운 점
CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT REFERENCES employees(id),
  task_id     INTEGER REFERENCES tasks(id),
  kind        TEXT NOT NULL,        -- success | failure | lesson | note
  summary     TEXT NOT NULL,
  do_not_repeat INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 성과 모니터링: 올린 영상의 조회수 기록
CREATE TABLE IF NOT EXISTS tracked_videos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  platform   TEXT NOT NULL,            -- youtube | instagram | facebook | threads
  ref        TEXT NOT NULL,            -- YouTube 영상 ID 또는 직접 정한 이름
  title      TEXT NOT NULL,
  url        TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS metrics (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id  INTEGER NOT NULL REFERENCES tracked_videos(id) ON DELETE CASCADE,
  views     INTEGER NOT NULL,
  likes     INTEGER,
  comments  INTEGER,
  source    TEXT NOT NULL,              -- auto | manual
  taken_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id   INTEGER,
  message    TEXT NOT NULL,
  seen       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 계획 게시판: 다음 영상 계획을 미리 적어 두고, 때가 되면 화면 맨 위에 알려 준다
CREATE TABLE IF NOT EXISTS plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  remind_when TEXT NOT NULL DEFAULT 'manual',   -- manual | after_post | date
  remind_date TEXT,
  status      TEXT NOT NULL DEFAULT 'waiting',  -- waiting | due | done
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

// 이전 버전 DB에 회의 상태 열 추가 (이미 있으면 건너뜀)
const meetingCols = db.prepare('PRAGMA table_info(meetings)').all().map((c) => c.name);
for (const [col, ddl] of [['status', "TEXT NOT NULL DEFAULT 'done'"], ['participants', "TEXT NOT NULL DEFAULT ''"], ['rounds', 'INTEGER NOT NULL DEFAULT 1']]) {
  if (!meetingCols.includes(col)) db.exec(`ALTER TABLE meetings ADD COLUMN ${col} ${ddl}`);
}

// 직원 명부 등록 (이미 있으면 건드리지 않는다 → 대표가 수정한 내용 보존)
const insert = db.prepare(`
  INSERT OR IGNORE INTO employees (id, name, title, role, reports_to, engine, tools, persona)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const e of EMPLOYEES) {
  insert.run(e.id, e.name, e.title, e.role, e.reportsTo ?? null, e.engine, e.tools, e.persona);
}

// 게시판이 비어 있으면, 대표님이 공유한 다음 영상 레퍼런스를 첫 계획으로 올려 둔다.
if (db.prepare('SELECT COUNT(*) AS n FROM plans').get().n === 0) {
  db.prepare("INSERT INTO plans (title, body, remind_when) VALUES (?, ?, 'after_post')").run(
    '다음 영상: "만약 ~라면" 시간 경과 형식 (레퍼런스: 달이 사라진다면)',
    `레퍼런스: 세로 약 89초, 3D 장면, 사건 이후 경과 시간 숫자(HUD)와 하단 세리프 이탤릭 자막 두 줄, 차분한 다큐 톤.
첫 영상 게시가 끝나면 아래를 대표님께 확인:
1) 같은 주제 방식("만약 ~라면")으로 할지, 형식만 참고할지
2) 어떤 주제로 할지
3) 길이: 30초 유지 vs 60~90초
4) 그림: 막대 인간 유지 vs 3D (3D는 크레딧이 훨씬 많이 듦)
5) 크레딧 상한
제안: 막대 인간을 유지하고 경과 시간 HUD + 하단 자막 형식만 가져오기. 예) "만약 오늘 시작하지 않는다면, 1년 뒤에는?"
자세한 분석: docs/NEXT_VIDEO.md`);
}

// 한 번만 올리는 기본 계획들. 올린 기록(meta)을 남겨서, 대표님이 삭제해도 다시 생기지 않는다.
db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
function seedOnce(key, title, body, when, status = 'waiting') {
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(key)) return;
  db.prepare('INSERT INTO plans (title, body, remind_when, status) VALUES (?, ?, ?, ?)').run(title, body, when, status);
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(key, new Date().toISOString());
}
seedOnce(
  'seed_plan_unlimited_chat',
  '다음 영상부터: 새 Claude 채팅방(claude.ai)을 열어서 이미지 만들기 (무제한 혜택)',
  `왜: Higgsfield 무제한 혜택은 Claude Code에서는 쓸 수 없고, Claude 채팅 / Claude Cowork / ChatGPT에서만 쓸 수 있습니다. (Claude Code에서는 이미지 1장당 크레딧이 나감)
무제한 대상(2026.11.1 ~ 2027.11.4): Nano Banana, Kling O1 Image, Seedream 4.5, Seedream 5.0 Lite, FLUX.2 Pro — 모두 이미지 모델입니다. 영상 클립(Kling 등)은 무제한이 아니라 크레딧으로 만듭니다.
할 일:
1) claude.ai 에서 새 채팅방을 연다 (Higgsfield 연결 확인)
2) 장면 이미지를 그 채팅방에서 만든다 (캐릭터 시안 A를 기준 이미지로 참고)
3) 이미지가 정해지면 이 Claude Code 세션으로 돌아와 영상 클립 제작과 조립을 진행한다
참고: 채팅방에서는 이 프로젝트 파일에 접근할 수 없으니 이미지 주소만 가져오면 됩니다.`,
  'after_post'
);

// 쓰레드(SNS 담당)에게 성과 모니터링을 맡긴다. 대표가 역할을 고치지 않은 경우에만 갱신한다.
{
  const OLD = 'YouTube/Instagram/Threads/Facebook 업로드 문구와 일정을 준비하고 반응을 분석한다. 업로드는 대표 승인 후에만 진행한다.';
  const NEW = 'YouTube/Instagram/Threads/Facebook 업로드 문구와 일정을 준비한다. 올린 영상의 조회수·좋아요·댓글을 수시로 모니터링하고, 성과 리포트(잘된 점, 아쉬운 점, 다음 행동)를 쓴다. 업로드는 대표 승인 후에만 진행한다.';
  db.prepare("UPDATE employees SET role = ? WHERE id = 'social' AND role = ?").run(NEW, OLD);
}

seedOnce(
  'seed_plan_profile_image',
  '지금 할 일: 프로필 이미지(정사각형 캐릭터)를 새 Claude 채팅방에서 만들기',
  `왜: YouTube·Instagram·Facebook·Threads 프로필 사진이 비어 있으면 신뢰가 떨어져 보입니다. 새 채팅방에서 만들면 무제한 혜택(Nano Banana)으로 크레딧이 들지 않습니다.
1) 먼저 캐릭터 시안 A 이미지를 컴퓨터에 저장해 둡니다. (이 Claude Code 대화에서 받은 시안 A 주소를 브라우저에 열고 우클릭 → 이미지를 다른 이름으로 저장)
2) claude.ai 에서 새 채팅을 열고, 저장한 이미지를 첨부합니다. (Higgsfield 연결이 켜져 있어야 함)
3) 아래 문구를 붙여넣습니다:
"첨부한 캐릭터와 똑같은 얇은 흰색 외곽선 사람 모양 캐릭터로, 정사각형(1:1) SNS 프로필 이미지를 만들어 줘. 배경은 거의 검정(#0a0a0a). 캐릭터의 머리와 상체가 가운데에 크게 보이게 하고, 가는 흰 선만 사용. 글자, 다른 물체, 빨간색은 넣지 마. Higgsfield의 Nano Banana를 무제한 혜택으로 만들어 줘."
4) 마음에 드는 이미지를 저장해서 4곳 프로필에 올립니다. (원형으로 잘려도 캐릭터가 가운데에 남아야 함)`,
  'manual',
  'due'
);
