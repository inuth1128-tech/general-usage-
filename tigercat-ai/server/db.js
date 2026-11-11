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
