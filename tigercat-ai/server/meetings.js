// 회의와 메신저: 비서실장이 회의를 열고, 담당자들이 돌아가며 발언하고, 회의록을 정리한다.
import { db } from './db.js';
import { runClaude } from './claude.js';
import { COMPANY, memoryBlock, lock, todayUsage, logUsage } from './agents.js';

const MAX_PARTICIPANTS = 5;
const MAX_ROUNDS = 2;

export function estimateCalls(participantCount, rounds) {
  return participantCount * rounds + 1; // 발언 + 회의록 1회
}

function say(meetingId, senderId, body) {
  db.prepare('INSERT INTO messages (meeting_id, sender_id, body) VALUES (?, ?, ?)').run(meetingId, senderId, body);
}

export function startMeeting(topic, participantIds, rounds) {
  const text = String(topic || '').trim();
  if (!text) return { error: '회의 주제를 적어 주세요.', status: 400 };
  if (text.length > 500) return { error: '주제는 500자 이내로 써 주세요.', status: 400 };
  const ids = [...new Set(Array.isArray(participantIds) ? participantIds.map(String) : [])];
  if (ids.length < 2 || ids.length > MAX_PARTICIPANTS) return { error: `참석자는 2~${MAX_PARTICIPANTS}명으로 골라 주세요.`, status: 400 };
  const r = Number(rounds);
  if (![1, 2].includes(r)) return { error: `라운드는 1 또는 ${MAX_ROUNDS}만 가능합니다.`, status: 400 };
  const emps = ids.map((id) => db.prepare('SELECT * FROM employees WHERE id = ? AND active = 1').get(id));
  if (emps.some((e) => !e || e.id === 'secretary')) return { error: '참석할 수 없는 직원이 포함되어 있습니다. (비서실장은 자동으로 진행합니다)', status: 400 };
  const calls = estimateCalls(ids.length, r);
  const u = todayUsage();
  if (calls > u.remaining) return { error: `이 회의는 Claude 호출이 약 ${calls}회 필요한데, 오늘 남은 호출은 ${u.remaining}회입니다. 참석자나 라운드를 줄여 주세요.`, status: 429 };
  if (lock.busy) return { error: '직원이 다른 업무를 처리 중입니다. 잠시 후 다시 시도해 주세요.', status: 409 };

  const task = db.prepare("INSERT INTO tasks (title, instruction, status, assignee_id) VALUES (?, ?, 'working', 'secretary')")
    .run('회의: ' + text.replace(/\s+/g, ' ').slice(0, 33), '회의 주제: ' + text);
  const taskId = Number(task.lastInsertRowid);
  const m = db.prepare("INSERT INTO meetings (task_id, topic, status, participants, rounds) VALUES (?, ?, 'running', ?, ?)")
    .run(taskId, text, ids.join(','), r);
  const meetingId = Number(m.lastInsertRowid);
  const names = emps.map((e) => e.name).join(', ');
  say(meetingId, 'secretary', `회의를 시작합니다. 주제: ${text}\n참석: ${names} (${r}라운드)`);
  run(meetingId, taskId, text, emps, r); // 기다리지 않고 백그라운드 진행
  return { id: meetingId, taskId, status: 'running', estimatedCalls: calls };
}

function transcript(meetingId) {
  const names = Object.fromEntries(db.prepare('SELECT id, name, title FROM employees').all().map((e) => [e.id, `${e.name}(${e.title})`]));
  names.ceo = '대표';
  return db.prepare('SELECT sender_id, body FROM messages WHERE meeting_id = ? ORDER BY id').all(meetingId)
    .map((m) => `${names[m.sender_id] || m.sender_id}: ${m.body}`).join('\n');
}

function speakerPrompt(emp, topic, talk, memories) {
  return `당신은 AI 회사 tigercat-ai의 "${emp.name}"(${emp.title})입니다. 지금 비서실장이 연 회의에 참석 중입니다.
성격: ${emp.persona}
담당 업무: ${emp.role}
${COMPANY}
${memoryBlock(memories)}
[회의 주제]
${topic}

[지금까지의 대화]
${talk}

당신 차례입니다. 당신의 담당 업무 관점에서 의견을 쉬운 한국어로 최대 4문장만 말하세요. 앞사람과 겹치는 말은 반복하지 말고 보완하거나 반대 의견을 내세요. 대표의 발언이 있으면 반드시 반영하세요. 인사말과 서론 없이 바로 의견만 말하세요.`;
}

function minutesPrompt(sec, topic, talk) {
  return `당신은 AI 회사 tigercat-ai의 비서실장 "${sec.name}"입니다. 방금 끝난 회의의 회의록을 정리하세요.
성격: ${sec.persona}
${COMPANY}

[회의 주제]
${topic}

[회의 전체 대화]
${talk}

대표는 개발자가 아닙니다. 쉬운 한국어로 아래 형식만 사용해 짧게 쓰세요.
1) 결론: 한두 줄
2) 업무 배정: "담당자 — 할 일" 형식의 목록
3) 의견이 갈린 점: 없으면 "없음"
4) 대표님 승인/확인이 필요한 것: 크레딧 사용, 업로드 등. 없으면 "없음"`;
}

async function run(meetingId, taskId, topic, emps, rounds) {
  lock.busy = true;
  try {
    for (let round = 1; round <= rounds; round++) {
      for (const emp of emps) {
        const memories = db.prepare('SELECT kind, summary, do_not_repeat FROM memories WHERE employee_id = ? OR do_not_repeat = 1 ORDER BY id DESC LIMIT 8').all(emp.id);
        const started = Date.now();
        const res = await runClaude(speakerPrompt(emp, topic, transcript(meetingId), memories));
        logUsage(emp.id, taskId, res.ok, Date.now() - started);
        if (!res.ok) throw new Error(`${emp.name} 발언 실패: ${res.text}`);
        say(meetingId, emp.id, res.text);
      }
    }
    const sec = db.prepare("SELECT * FROM employees WHERE id = 'secretary'").get();
    const started = Date.now();
    const res = await runClaude(minutesPrompt(sec, topic, transcript(meetingId)));
    logUsage('secretary', taskId, res.ok, Date.now() - started);
    if (!res.ok) throw new Error('회의록 작성 실패: ' + res.text);
    say(meetingId, 'secretary', '회의를 마칩니다. 회의록을 정리했습니다.');
    db.prepare("UPDATE meetings SET status = 'done', minutes = ? WHERE id = ?").run(res.text, meetingId);
    db.prepare("UPDATE tasks SET status = 'reported', result = ?, updated_at = datetime('now') WHERE id = ?").run(res.text, taskId);
  } catch (e) {
    say(meetingId, 'secretary', '회의가 중단되었습니다: ' + e.message);
    db.prepare("UPDATE meetings SET status = 'failed' WHERE id = ?").run(meetingId);
    db.prepare("UPDATE tasks SET status = 'failed', result = ?, updated_at = datetime('now') WHERE id = ?").run(String(e.message), taskId);
  } finally {
    lock.busy = false;
  }
}

export function ceoSay(meetingId, body) {
  const text = String(body || '').trim().slice(0, 500);
  if (!text) return { error: '내용이 비어 있습니다.', status: 400 };
  const m = db.prepare('SELECT id FROM meetings WHERE id = ?').get(Number(meetingId));
  if (!m) return { error: '없는 회의입니다.', status: 404 };
  say(m.id, 'ceo', text);
  return { ok: true };
}

export function listMeetings() {
  return db.prepare('SELECT id, task_id AS taskId, topic, status, participants, rounds, created_at FROM meetings ORDER BY id DESC LIMIT 30').all();
}

export function getMeeting(id) {
  const m = db.prepare('SELECT id, task_id AS taskId, topic, status, participants, rounds, minutes, created_at FROM meetings WHERE id = ?').get(Number(id));
  if (!m) return null;
  m.messages = db.prepare('SELECT id, sender_id AS senderId, body, created_at FROM messages WHERE meeting_id = ? ORDER BY id').all(m.id);
  return m;
}
