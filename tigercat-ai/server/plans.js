// 계획 게시판: 다음 영상 계획을 적어 두고, 때가 되면 "지금 시작할 계획"으로 알려 준다.
import { db } from './db.js';

const WHEN = ['manual', 'after_post', 'date'];
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function listPlans() {
  const t = today();
  return db.prepare('SELECT id, title, body, remind_when AS remindWhen, remind_date AS remindDate, status, created_at AS createdAt FROM plans ORDER BY id DESC').all()
    .map((p) => ({ ...p, due: p.status === 'due' || (p.status === 'waiting' && p.remindWhen === 'date' && !!p.remindDate && p.remindDate <= t) }));
}

export function addPlan({ title, body, remindWhen = 'manual', remindDate }) {
  const t = String(title || '').trim().slice(0, 80);
  if (!t) return { error: '제목을 적어 주세요.', status: 400 };
  if (!WHEN.includes(remindWhen)) return { error: '알림 시점이 올바르지 않습니다.', status: 400 };
  let date = null;
  if (remindWhen === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(remindDate || ''))) return { error: '알림 날짜를 선택해 주세요.', status: 400 };
    date = remindDate;
  }
  const r = db.prepare('INSERT INTO plans (title, body, remind_when, remind_date) VALUES (?, ?, ?, ?)')
    .run(t, String(body || '').trim().slice(0, 2000), remindWhen, date);
  return { ok: true, id: Number(r.lastInsertRowid) };
}

export function updatePlan(id, { title, body, status }) {
  const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(id));
  if (!p) return { error: '없는 계획입니다.', status: 404 };
  const t = title === undefined ? p.title : String(title).trim().slice(0, 80);
  if (!t) return { error: '제목은 비워 둘 수 없습니다.', status: 400 };
  if (status !== undefined && !['waiting', 'due', 'done'].includes(status)) return { error: '상태가 올바르지 않습니다.', status: 400 };
  db.prepare("UPDATE plans SET title = ?, body = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(t, body === undefined ? p.body : String(body).trim().slice(0, 2000), status ?? p.status, p.id);
  return { ok: true };
}

export function deletePlan(id) {
  const r = db.prepare('DELETE FROM plans WHERE id = ?').run(Number(id));
  return r.changes ? { ok: true } : { error: '없는 계획입니다.', status: 404 };
}

// "영상 게시 완료" 버튼: 게시 후에 알려 달라고 해 둔 계획을 모두 "지금 시작할 계획"으로 바꾼다.
export function markPosted() {
  const r = db.prepare("UPDATE plans SET status = 'due', updated_at = datetime('now','localtime') WHERE remind_when = 'after_post' AND status = 'waiting'").run();
  return { ok: true, changed: Number(r.changes) };
}
