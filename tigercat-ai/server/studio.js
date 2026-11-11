// 영상 제작실: 영상 자료 보기, 영상 만들기, 폴더 열기, 업데이트 받기.
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const mediaDir = join(root, 'media');
const NAME = /^[a-z0-9_]+$/;

function readCfg(name) {
  try { return JSON.parse(readFileSync(join(mediaDir, name + '.json'), 'utf8')); } catch { return null; }
}

export function listProjects() {
  return readdirSync(mediaDir).filter((f) => f.endsWith('.json') && !f.endsWith('_publish.json'))
    .map((f) => f.slice(0, -5)).filter((n) => NAME.test(n))
    .map((name) => { const c = readCfg(name); return c && c.scenes ? { name, title: c.title || name, style: c.style || 'static' } : null; })
    .filter(Boolean);
}

export function outputFile(name) {
  const f = join(mediaDir, 'out', name, name + '.mp4');
  return NAME.test(name) && existsSync(f) ? f : null;
}

export function getProject(name) {
  if (!NAME.test(String(name))) return null;
  const c = readCfg(name);
  if (!c) return null;
  const out = outputFile(name);
  let publish = null;
  if (c.publish && /^[a-z0-9_]+\.json$/.test(c.publish)) {
    try { publish = JSON.parse(readFileSync(join(mediaDir, c.publish), 'utf8')); } catch {}
  }
  // 이미지는 같은 이름 계열(assetsFrom)의 설정에서 가져온다.
  const base = c.assetsFrom ? readCfg(c.assetsFrom) : null;
  const images = c.images || (base && base.images) || [];
  return {
    name, title: c.title || name, style: c.style || 'static',
    images, clips: c.clips || [], audio: c.audio || null,
    scenes: c.scenes.map((s, i) => ({ n: i + 1, clip: s.clip ?? null, image: s.image ?? null, speed: s.speed ?? null, sentences: s.sentences })),
    output: out ? { size: statSync(out).size, mtime: statSync(out).mtimeMs, url: `/media-out/${name}/${name}.mp4` } : null,
    publish,
  };
}

// ---- 영상 만들기 (한 번에 하나) ----
const job = { running: false, name: null, startedAt: null, endedAt: null, exitCode: null, log: [] };
function pushLog(chunk) {
  const text = String(chunk).replace(/\r/g, '\n');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const L = line.slice(0, 300);
    // ffmpeg 진행 줄(frame=...)은 한 줄만 계속 덮어써서 로그가 지저분해지지 않게 한다.
    if (L.startsWith('frame=') && job.log.length && job.log[job.log.length - 1].startsWith('frame=')) job.log[job.log.length - 1] = L;
    else job.log.push(L);
  }
  if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
}
export function buildStatus() { return { ...job, log: job.log.slice(-60) }; }

export function startBuild(name) {
  if (!NAME.test(String(name)) || !readCfg(name)) return { error: '없는 영상입니다.', status: 400 };
  if (job.running) return { error: '이미 영상을 만드는 중입니다.', status: 409 };
  Object.assign(job, { running: true, name, startedAt: Date.now(), endedAt: null, exitCode: null, log: [] });
  const child = spawn(process.execPath, [join('media', 'make-short.mjs'), join('media', name + '.json')], { cwd: root, windowsHide: true });
  child.stdout.on('data', pushLog);
  child.stderr.on('data', pushLog);
  child.on('error', (e) => { pushLog('실행 오류: ' + e.message); Object.assign(job, { running: false, endedAt: Date.now(), exitCode: -1 }); });
  child.on('close', (code) => Object.assign(job, { running: false, endedAt: Date.now(), exitCode: code }));
  return { ok: true };
}

// ---- 폴더 열기 / 업데이트 ----
export function openFolder(name) {
  if (!NAME.test(String(name))) return { error: '없는 영상입니다.', status: 400 };
  const dir = join(mediaDir, 'out', name);
  if (!existsSync(dir)) return { error: '아직 만들어진 영상이 없습니다.', status: 404 };
  if (process.platform === 'win32') { spawn('explorer', [dir], { detached: true, stdio: 'ignore' }).unref(); return { ok: true, path: dir }; }
  return { ok: true, path: dir, note: 'Windows가 아니라 폴더를 열지 않았습니다.' };
}

export function updateFromGit() {
  const br = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const branch = (br.stdout || '').trim();
  if (br.error || !branch) return { error: 'git를 실행하지 못했습니다.', status: 500 };
  const r = spawnSync('git', ['pull', 'origin', branch], { cwd: root, encoding: 'utf8', timeout: 120000 });
  const output = ((r.stdout || '') + (r.stderr || '')).trim().slice(-1500);
  if (r.status !== 0) return { error: '업데이트에 실패했습니다.\n' + output, status: 500 };
  return { ok: true, upToDate: /Already up to date|이미 최신/i.test(output), output };
}
