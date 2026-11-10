// 기억 시스템: 기록하고, 업무와 관련 있는 것을 골라서 꺼내 쓴다.
// employee_id 가 비어 있는 기억(NULL)은 "회사 전체 기억"이라 모든 직원이 참고한다.
import { db } from './db.js';

const KINDS = ['rule', 'lesson', 'success', 'failure', 'note'];
const MAX_NOTES = 400; // 오래된 단순 메모는 이 개수를 넘으면 자동 정리

// 한국어/영어 단어를 비교용 조각으로 쪼갠다. (한글은 두 글자씩 겹쳐 쪼개서 조사 차이를 흡수)
function tokens(text) {
  const out = new Set();
  for (const w of String(text).toLowerCase().match(/[a-z0-9]{2,}|[가-힣]+/g) ?? []) {
    if (/[가-힣]/.test(w)) {
      if (w.length <= 2) out.add(w);
      for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2));
    } else out.add(w);
  }
  return out;
}

// 이 직원이 이 업무를 하기 전에 떠올릴 기억을 고른다.
export function recall(employeeId, queryText, { limit = 8, charBudget = 1400 } = {}) {
  const rows = db.prepare(
    'SELECT id, employee_id, kind, summary, do_not_repeat FROM memories WHERE employee_id = ? OR employee_id IS NULL ORDER BY id DESC LIMIT 300'
  ).all(employeeId);
  const q = tokens(queryText);
  const scored = rows.map((m) => {
    const t = tokens(m.summary);
    let score = 0;
    for (const x of t) if (q.has(x)) score++;
    const must = m.do_not_repeat === 1 || m.kind === 'rule';
    return { ...m, score, must };
  });
  const musts = scored.filter((m) => m.must).slice(0, 6); // 규칙/반복금지는 항상 포함 (최근순)
  const rest = scored.filter((m) => !m.must && m.score > 0).sort((a, b) => b.score - a.score || b.id - a.id);
  const recent = scored.filter((m) => !m.must && m.score === 0).slice(0, 2); // 관련 없어도 최근 2개
  const picked = [];
  let used = 0;
  for (const m of [...musts, ...rest, ...recent]) {
    if (picked.length >= limit) break;
    if (used + m.summary.length > charBudget) continue;
    picked.push(m); used += m.summary.length;
  }
  return picked;
}

export function addMemory({ employeeId = null, taskId = null, kind = 'note', summary, doNotRepeat = false }) {
  const text = String(summary || '').trim().slice(0, 300);
  if (!text) return { error: '기억할 내용을 적어 주세요.', status: 400 };
  if (!KINDS.includes(kind)) return { error: '종류가 올바르지 않습니다.', status: 400 };
  if (employeeId !== null && !db.prepare('SELECT 1 FROM employees WHERE id = ?').get(String(employeeId))) return { error: '없는 직원입니다.', status: 400 };
  // 같은 내용이 이미 있으면 중복 저장하지 않는다.
  const dup = db.prepare('SELECT id FROM memories WHERE employee_id IS ? AND summary = ?').get(employeeId, text);
  if (dup) return { ok: true, id: dup.id, duplicate: true };
  const r = db.prepare('INSERT INTO memories (employee_id, task_id, kind, summary, do_not_repeat) VALUES (?, ?, ?, ?, ?)')
    .run(employeeId, taskId, kind, text, doNotRepeat ? 1 : 0);
  // 오래된 단순 메모 정리 (규칙, 반복금지, 교훈은 절대 지우지 않음)
  db.prepare(`DELETE FROM memories WHERE kind = 'note' AND do_not_repeat = 0 AND id NOT IN
    (SELECT id FROM memories WHERE kind = 'note' AND do_not_repeat = 0 ORDER BY id DESC LIMIT ?)`).run(MAX_NOTES);
  return { ok: true, id: Number(r.lastInsertRowid) };
}

export function listMemories({ employee, kind } = {}) {
  const where = [], args = [];
  if (employee === 'company') where.push('m.employee_id IS NULL');
  else if (employee) { where.push('m.employee_id = ?'); args.push(employee); }
  if (kind && KINDS.includes(kind)) { where.push('m.kind = ?'); args.push(kind); }
  return db.prepare(`SELECT m.id, m.employee_id AS employeeId, e.name AS employeeName, m.task_id AS taskId, m.kind, m.summary,
      m.do_not_repeat AS doNotRepeat, m.created_at AS createdAt
    FROM memories m LEFT JOIN employees e ON e.id = m.employee_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.id DESC LIMIT 150`).all(...args);
}

export function updateMemory(id, { doNotRepeat, summary }) {
  const m = db.prepare('SELECT * FROM memories WHERE id = ?').get(Number(id));
  if (!m) return { error: '없는 기억입니다.', status: 404 };
  const text = summary === undefined ? m.summary : String(summary).trim().slice(0, 300);
  if (!text) return { error: '내용이 비어 있습니다.', status: 400 };
  const flag = doNotRepeat === undefined ? m.do_not_repeat : (doNotRepeat ? 1 : 0);
  db.prepare('UPDATE memories SET summary = ?, do_not_repeat = ? WHERE id = ?').run(text, flag, m.id);
  return { ok: true };
}

export function deleteMemory(id) {
  const r = db.prepare('DELETE FROM memories WHERE id = ?').run(Number(id));
  return r.changes ? { ok: true } : { error: '없는 기억입니다.', status: 404 };
}

// 회의록에서 "1) 결론" 부분만 뽑는다.
export function extractConclusion(minutes) {
  const m = String(minutes || '').match(/1\)\s*결론[:\s]*([\s\S]*?)(?:\n\s*2\)|$)/);
  return (m ? m[1] : String(minutes || '')).replace(/\s+/g, ' ').trim().slice(0, 220);
}
