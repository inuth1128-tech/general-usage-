// 비서실장 한비서: 대표 지시를 받아 정리하고 보고한다. (3단계: 지시 이해와 계획까지)
import { db } from './db.js';
import { runClaude } from './claude.js';

const DAILY_LIMIT = Number(process.env.DAILY_CALL_LIMIT || 20);
let busy = false; // Pro 한도 보호: 한 번에 하나만 처리

export function todayUsage() {
  const n = db.prepare("SELECT COUNT(*) AS n FROM usage_log WHERE date(created_at) = date('now','localtime')").get().n;
  return { used: n, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - n) };
}

function buildPrompt(secretary, instruction, memories) {
  const memo = memories.length
    ? '\n[과거 기억]\n' + memories.map((m) => `- (${m.kind}${m.do_not_repeat ? ', 반복 금지' : ''}) ${m.summary}`).join('\n') + '\n'
    : '';
  return `당신은 AI 회사 tigercat-ai의 비서실장 "${secretary.name}"입니다.
성격: ${secretary.persona}
회사: 막대 인간(아웃라인) 캐릭터가 나오는 영어 30초 세로 영상(쇼츠/릴스)으로 동기부여·사람 심리·인생 교훈을 전하는 YouTube/Instagram/Threads/Facebook 채널을 운영합니다.
직원: 기획이(기획팀장), 글이(작가), 그림이(디자이너), 편집이(영상편집), 쓰레드(SNS 담당), 웹이(브랜드사이트), 꼼꼼이(검수담당).
규칙: 업로드·결제·삭제는 반드시 대표 승인을 받는다. Higgsfield 영상 생성은 크레딧을 쓰므로 견적을 먼저 보고한다. 도구를 쓰지 말고 글로만 답한다.
${memo}
[대표의 지시]
${instruction}

대표는 개발자가 아닙니다. 쉬운 한국어로, 아래 형식으로만 짧게 답하세요.
1) 지시 이해: 한 줄
2) 필요한 담당자와 각자 할 일: 목록
3) 예상 순서: 번호 목록
4) 대표님께 확인할 점: 없으면 "없음"`;
}

export function createTask(instruction) {
  const title = instruction.trim().replace(/\s+/g, ' ').slice(0, 40);
  const r = db.prepare("INSERT INTO tasks (title, instruction, status, assignee_id) VALUES (?, ?, 'requested', 'secretary')")
    .run(title, instruction.trim());
  return Number(r.lastInsertRowid);
}

export function submitInstruction(instruction) {
  const text = String(instruction || '').trim();
  if (!text) return { error: '지시 내용이 비어 있습니다.', status: 400 };
  if (text.length > 2000) return { error: '지시가 너무 깁니다. 2000자 이내로 써 주세요.', status: 400 };
  const u = todayUsage();
  if (u.remaining <= 0) return { error: `오늘 호출 한도(${u.limit}회)를 모두 썼습니다. 내일 다시 하거나 DAILY_CALL_LIMIT를 올려 주세요.`, status: 429 };
  if (busy) return { error: '비서실장이 다른 업무를 처리 중입니다. 잠시 후 다시 시도해 주세요.', status: 409 };
  const id = createTask(text);
  work(id, text); // 기다리지 않고 백그라운드로 진행
  return { id, status: 'working' };
}

async function work(id, instruction) {
  busy = true;
  const started = Date.now();
  db.prepare("UPDATE tasks SET status = 'working', updated_at = datetime('now') WHERE id = ?").run(id);
  try {
    const secretary = db.prepare("SELECT * FROM employees WHERE id = 'secretary'").get();
    const memories = db.prepare("SELECT kind, summary, do_not_repeat FROM memories WHERE employee_id = 'secretary' OR do_not_repeat = 1 ORDER BY id DESC LIMIT 10").all();
    const res = await runClaude(buildPrompt(secretary, instruction, memories));
    db.prepare("INSERT INTO usage_log (employee_id, task_id, ok, duration_ms) VALUES ('secretary', ?, ?, ?)").run(id, res.ok ? 1 : 0, Date.now() - started);
    db.prepare("UPDATE tasks SET status = ?, result = ?, updated_at = datetime('now') WHERE id = ?")
      .run(res.ok ? 'reported' : 'failed', res.text, id);
    // 기억 시스템: 성공/실패를 기록한다
    db.prepare('INSERT INTO memories (employee_id, task_id, kind, summary, do_not_repeat) VALUES (?, ?, ?, ?, 0)')
      .run('secretary', id, res.ok ? 'success' : 'failure', `지시 "${instruction.slice(0, 60)}" → ${res.ok ? '보고 완료' : '실패: ' + res.text.slice(0, 80)}`);
  } catch (e) {
    db.prepare("UPDATE tasks SET status = 'failed', result = ?, updated_at = datetime('now') WHERE id = ?").run(String(e.message), id);
  } finally {
    busy = false;
  }
}
