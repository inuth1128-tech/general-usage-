// Claude Code를 터미널 방식으로 호출한다. (대표님 Pro 구독 로그인을 그대로 사용 → API 요금 없음)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Claude가 우리 코드 폴더를 건드리지 못하도록, 비어 있는 작업 폴더에서 실행한다.
const sandbox = join(here, '..', 'data', 'sandbox');
mkdirSync(sandbox, { recursive: true });

const MODEL = process.env.CLAUDE_MODEL || 'sonnet'; // Pro 한도 절약: 기본은 가벼운 Sonnet
const TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 180000);

export function runClaude(prompt) {
  if (process.env.TIGERCAT_MOCK === '1') {
    return Promise.resolve({ ok: true, text: '[모의 응답] ' + prompt.slice(-60).replace(/\s+/g, ' ') });
  }
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    // 인자는 모두 고정값이다. 사용자가 쓴 내용은 stdin으로만 전달한다. (명령어 주입 방지)
    const child = spawn('claude', ['-p', '--output-format', 'json', '--model', MODEL], {
      cwd: sandbox,
      shell: isWin, // Windows에서는 claude가 .cmd 파일이라 필요
      windowsHide: true,
    });
    let out = '', err = '', done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => { child.kill(); finish({ ok: false, text: '시간 초과: Claude가 제한 시간 안에 답하지 않았습니다.' }); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => finish({ ok: false, text: 'Claude Code를 실행하지 못했습니다: ' + e.message }));
    child.on('close', (code) => {
      try {
        const j = JSON.parse(out);
        if (j.is_error) return finish({ ok: false, text: String(j.result || 'Claude 오류') });
        return finish({ ok: true, text: String(j.result ?? '').trim() });
      } catch {
        if (code === 0 && out.trim()) return finish({ ok: true, text: out.trim() });
        finish({ ok: false, text: `Claude 호출 실패 (코드 ${code}). ${(err || out).slice(0, 300)}` });
      }
    });
    child.stdin.end(prompt);
  });
}
