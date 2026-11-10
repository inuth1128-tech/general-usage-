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
`);

// 직원 명부 등록 (이미 있으면 건드리지 않는다 → 대표가 수정한 내용 보존)
const insert = db.prepare(`
  INSERT OR IGNORE INTO employees (id, name, title, role, reports_to, engine, tools, persona)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const e of EMPLOYEES) {
  insert.run(e.id, e.name, e.title, e.role, e.reportsTo ?? null, e.engine, e.tools, e.persona);
}
