// 직원들이 일하는 곳. 비서실장을 포함해 모든 직원이 같은 방식으로 Claude를 호출한다.
import { db } from './db.js';
import { runClaude } from './claude.js';

const DAILY_LIMIT = Number(process.env.DAILY_CALL_LIMIT || 20);
export const lock = { busy: false }; // Pro 한도 보호: 한 번에 하나만 처리

export function todayUsage() {
  const n = db.prepare("SELECT COUNT(*) AS n FROM usage_log WHERE date(created_at) = date('now','localtime')").get().n;
  return { used: n, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - n) };
}

export const COMPANY = `회사: tigercat-ai. 막대 인간(아웃라인) 캐릭터가 나오는 영어 30초 세로 영상(쇼츠/릴스)으로 동기부여·사람 심리·인생 교훈을 전하는 YouTube/Instagram/Threads/Facebook 채널을 운영합니다.
영상 스타일: 검은 배경, 흰색 막대 인간, 빨강 1색 강조, 개념을 동심원 같은 도해로 시각화, 영문 대문자 모노스페이스 글자.
직원: 한비서(비서실장), 기획이(기획팀장), 글이(작가), 그림이(디자이너), 편집이(영상편집), 쓰레드(SNS 담당), 웹이(브랜드사이트), 꼼꼼이(검수담당).
규칙: 업로드·결제·삭제는 반드시 대표 승인을 받는다. Higgsfield 영상 생성은 크레딧을 쓰므로 견적을 먼저 보고한다. 지금은 도구를 쓰지 말고 글로만 답한다.`;

export function memoryBlock(memories) {
  if (!memories.length) return '';
  return '\n[과거 기억 — 반드시 참고하고, 반복 금지 항목은 절대 같은 방식으로 하지 마세요]\n'
    + memories.map((m) => `- (${m.kind}${m.do_not_repeat ? ', 반복 금지' : ''}) ${m.summary}`).join('\n') + '\n';
}

function buildPrompt(emp, instruction, memories) {
  const memo = memoryBlock(memories);
  if (emp.id === 'secretary') {
    return `당신은 AI 회사 tigercat-ai의 비서실장 "${emp.name}"입니다.
성격: ${emp.persona}
${COMPANY}
${memo}
[대표의 지시]
${instruction}

대표는 개발자가 아닙니다. 쉬운 한국어로, 아래 형식으로만 짧게 답하세요.
1) 지시 이해: 한 줄
2) 필요한 담당자와 각자 할 일: 목록
3) 예상 순서: 번호 목록
4) 대표님께 확인할 점: 없으면 "없음"`;
  }
  return `당신은 AI 회사 tigercat-ai의 "${emp.name}"(${emp.title})입니다.
성격: ${emp.persona}
담당 업무: ${emp.role}
${COMPANY}
${memo}
[업무 지시]
${instruction}

대표는 개발자가 아닙니다. 설명은 쉬운 한국어로 하되, 영상 대본·제목·해시태그처럼 영어로 나가는 결과물은 영어로 쓰세요.
결과물을 먼저 보여 주고, 마지막에 "확인할 점"을 한두 줄로 적으세요. 군더더기 없이 답하세요.`;
}

export function logUsage(employeeId, taskId, ok, ms) {
  db.prepare('INSERT INTO usage_log (employee_id, task_id, ok, duration_ms) VALUES (?, ?, ?, ?)').run(employeeId, taskId, ok ? 1 : 0, ms);
}

export function submitInstruction(instruction, assigneeId = 'secretary') {
  const text = String(instruction || '').trim();
  if (!text) return { error: '지시 내용이 비어 있습니다.', status: 400 };
  if (text.length > 2000) return { error: '지시가 너무 깁니다. 2000자 이내로 써 주세요.', status: 400 };
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(String(assigneeId));
  if (!emp) return { error: '없는 직원입니다.', status: 400 };
  if (!emp.active) return { error: `${emp.name}은(는) 지금 휴직 상태입니다.`, status: 400 };
  const u = todayUsage();
  if (u.remaining <= 0) return { error: `오늘 호출 한도(${u.limit}회)를 모두 썼습니다. 내일 다시 하거나 DAILY_CALL_LIMIT를 올려 주세요.`, status: 429 };
  if (lock.busy) return { error: '직원이 다른 업무를 처리 중입니다. 잠시 후 다시 시도해 주세요.', status: 409 };
  const title = text.replace(/\s+/g, ' ').slice(0, 40);
  const r = db.prepare("INSERT INTO tasks (title, instruction, status, assignee_id) VALUES (?, ?, 'requested', ?)").run(title, text, emp.id);
  const id = Number(r.lastInsertRowid);
  work(id, emp, text); // 기다리지 않고 백그라운드로 진행
  return { id, status: 'working' };
}

async function work(id, emp, instruction) {
  lock.busy = true;
  const started = Date.now();
  db.prepare("UPDATE tasks SET status = 'working', updated_at = datetime('now') WHERE id = ?").run(id);
  try {
    const memories = db.prepare("SELECT kind, summary, do_not_repeat FROM memories WHERE employee_id = ? OR do_not_repeat = 1 ORDER BY id DESC LIMIT 10").all(emp.id);
    const res = await runClaude(buildPrompt(emp, instruction, memories));
    db.prepare('INSERT INTO usage_log (employee_id, task_id, ok, duration_ms) VALUES (?, ?, ?, ?)').run(emp.id, id, res.ok ? 1 : 0, Date.now() - started);
    db.prepare("UPDATE tasks SET status = ?, result = ?, updated_at = datetime('now') WHERE id = ?").run(res.ok ? 'reported' : 'failed', res.text, id);
    db.prepare('INSERT INTO memories (employee_id, task_id, kind, summary, do_not_repeat) VALUES (?, ?, ?, ?, 0)')
      .run(emp.id, id, res.ok ? 'note' : 'failure', `지시 "${instruction.slice(0, 60)}" → ${res.ok ? '결과 제출' : '실패: ' + res.text.slice(0, 80)}`);
  } catch (e) {
    db.prepare("UPDATE tasks SET status = 'failed', result = ?, updated_at = datetime('now') WHERE id = ?").run(String(e.message), id);
  } finally {
    lock.busy = false;
  }
}

// 대표의 승인/반려. 반려 사유는 "반복 금지" 기억이 되어 다음 업무에 반영된다.
export function reviewTask(id, verdict, note) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(id));
  if (!task) return { error: '없는 업무입니다.', status: 404 };
  if (task.status !== 'reported') return { error: '보고 완료된 업무만 승인/반려할 수 있습니다.', status: 400 };
  const text = String(note || '').trim().slice(0, 300);
  if (verdict === 'approved') {
    db.prepare("UPDATE tasks SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(task.id);
    db.prepare("INSERT INTO memories (employee_id, task_id, kind, summary, do_not_repeat) VALUES (?, ?, 'success', ?, 0)")
      .run(task.assignee_id, task.id, `대표 승인: "${task.title}"${text ? ' — ' + text : ''}`);
  } else if (verdict === 'rejected') {
    if (!text) return { error: '반려 사유를 적어 주세요. 직원이 다음에 같은 실수를 하지 않게 기억합니다.', status: 400 };
    db.prepare("UPDATE tasks SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(task.id);
    db.prepare("INSERT INTO memories (employee_id, task_id, kind, summary, do_not_repeat) VALUES (?, ?, 'failure', ?, 1)")
      .run(task.assignee_id, task.id, `대표 반려("${task.title}"): ${text}`);
  } else {
    return { error: 'verdict는 approved 또는 rejected 여야 합니다.', status: 400 };
  }
  return { ok: true };
}

// 직원 정보 수정 (이름, 직함, 역할, 성격, 휴직)
export function updateEmployee(id, f) {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(String(id));
  if (!emp) return { error: '없는 직원입니다.', status: 404 };
  const clean = (v, max) => String(v ?? '').trim().slice(0, max);
  const name = clean(f.name ?? emp.name, 20), title = clean(f.title ?? emp.title, 30);
  const role = clean(f.role ?? emp.role, 600), persona = clean(f.persona ?? emp.persona, 300);
  if (!name || !title || !role) return { error: '이름, 직함, 역할은 비워 둘 수 없습니다.', status: 400 };
  let active = f.active === undefined ? emp.active : (f.active ? 1 : 0);
  if (emp.id === 'secretary') active = 1; // 비서실장은 휴직 불가
  db.prepare('UPDATE employees SET name = ?, title = ?, role = ?, persona = ?, active = ? WHERE id = ?').run(name, title, role, persona, active, emp.id);
  return { ok: true };
}
