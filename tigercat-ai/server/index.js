// 업무사이트 서버: 내 컴퓨터(localhost)에서만 접속 가능하다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, statSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { overview as monitorOverview, addVideo, addManualMetric, deleteVideo, fetchYoutubeNow, saveKey, startMonitor, listAlerts, markAlertsSeen, requestReport } from './monitor.js';
import { listProjects, getProject, outputFile, buildStatus, startBuild, openFolder, updateFromGit } from './studio.js';
import { listPlans, addPlan, updatePlan, deletePlan, markPosted } from './plans.js';
import { listMemories, addMemory, updateMemory, deleteMemory, recall } from './memory.js';
import { startMeeting, ceoSay, listMeetings, getMeeting } from './meetings.js';
import { submitInstruction, reviewTask, updateEmployee, todayUsage } from './agents.js';

// .env 파일(API 키 등 비밀값)을 읽는다. GitHub에는 올라가지 않는다.
try {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const PORT = Number(process.env.PORT || 3001);
const HOST = '127.0.0.1'; // 외부 접속 차단 (이 컴퓨터에서만)
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
const reply = (res, r, okStatus = 200) => json(res, r.error ? { error: r.error } : r, r.error ? r.status || 400 : okStatus);

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 10000) throw Object.assign(new Error('too large'), { status: 413 }); }
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('invalid json'), { status: 400 }); }
}

const getApi = {
  '/api/health': () => ({ ok: true, company: 'tigercat-ai', time: new Date().toISOString() }),
  '/api/employees': () => db.prepare("SELECT id, name, title, role, reports_to AS reportsTo, engine, tools, persona, active FROM employees ORDER BY CASE id WHEN 'secretary' THEN 0 ELSE 1 END, rowid").all(),
  '/api/tasks': () => db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 50').all(),
  '/api/summary': () => ({
    employees: db.prepare('SELECT COUNT(*) AS n FROM employees WHERE active = 1').get().n,
    tasks: db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n,
    memories: db.prepare('SELECT COUNT(*) AS n FROM memories').get().n,
    usage: todayUsage(),
  }),
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  try {
    if (req.method === 'POST') {
      // 다른 웹사이트가 내 컴퓨터의 이 서버를 몰래 호출하지 못하게 막는다.
      const origin = req.headers.origin;
      if (origin && origin !== `http://localhost:${PORT}` && origin !== `http://127.0.0.1:${PORT}`) return json(res, { error: 'forbidden origin' }, 403);
      let m;
      if (url.pathname === '/api/tasks') {
        const d = await readJson(req);
        const r = submitInstruction(d.instruction, d.assignee || 'secretary');
        return reply(res, r, 202);
      }
      if ((m = url.pathname.match(/^\/api\/tasks\/(\d+)\/review$/))) {
        const d = await readJson(req);
        return reply(res, reviewTask(m[1], d.verdict, d.note));
      }
      if (url.pathname === '/api/monitor/videos') return reply(res, addVideo(await readJson(req)), 201);
      if ((m = url.pathname.match(/^\/api\/monitor\/videos\/(\d+)\/metric$/))) return reply(res, addManualMetric(m[1], await readJson(req)), 201);
      if ((m = url.pathname.match(/^\/api\/monitor\/videos\/(\d+)\/delete$/))) return reply(res, deleteVideo(m[1]));
      if (url.pathname === '/api/monitor/fetch') return reply(res, await fetchYoutubeNow());
      if (url.pathname === '/api/monitor/key') return reply(res, saveKey((await readJson(req)).key));
      if (url.pathname === '/api/monitor/report') return reply(res, requestReport(), 202);
      if (url.pathname === '/api/alerts/seen') return reply(res, markAlertsSeen());
      if (url.pathname === '/api/studio/build') return reply(res, startBuild((await readJson(req)).name), 202);
      if (url.pathname === '/api/studio/open') return reply(res, openFolder((await readJson(req)).name));
      if (url.pathname === '/api/studio/update') return reply(res, updateFromGit());
      if (url.pathname === '/api/studio/restart') {
        // start-site.cmd 가 종료 코드 75 를 보면 사이트를 다시 켠다.
        json(res, { ok: true });
        setTimeout(() => process.exit(75), 300);
        return;
      }
      if (url.pathname === '/api/plans') {
        const d = await readJson(req);
        return reply(res, addPlan({ title: d.title, body: d.body, remindWhen: d.remindWhen, remindDate: d.remindDate }), 201);
      }
      if (url.pathname === '/api/plans/posted') return reply(res, markPosted());
      if ((m = url.pathname.match(/^\/api\/plans\/(\d+)\/delete$/))) return reply(res, deletePlan(m[1]));
      if ((m = url.pathname.match(/^\/api\/plans\/(\d+)$/))) return reply(res, updatePlan(m[1], await readJson(req)));
      if (url.pathname === '/api/memories') {
        const d = await readJson(req);
        return reply(res, addMemory({ employeeId: d.employeeId || null, kind: d.kind || 'rule', summary: d.summary, doNotRepeat: !!d.doNotRepeat }), 201);
      }
      if ((m = url.pathname.match(/^\/api\/memories\/(\d+)\/delete$/))) return reply(res, deleteMemory(m[1]));
      if ((m = url.pathname.match(/^\/api\/memories\/(\d+)$/))) return reply(res, updateMemory(m[1], await readJson(req)));
      if (url.pathname === '/api/meetings') {
        const d = await readJson(req);
        return reply(res, startMeeting(d.topic, d.participants, d.rounds), 202);
      }
      if ((m = url.pathname.match(/^\/api\/meetings\/(\d+)\/messages$/))) {
        const d = await readJson(req);
        return reply(res, ceoSay(m[1], d.body));
      }
      if ((m = url.pathname.match(/^\/api\/employees\/([a-z]+)$/))) {
        return reply(res, updateEmployee(m[1], await readJson(req)));
      }
      return json(res, { error: 'not found' }, 404);
    }
    if (req.method !== 'GET') return json(res, { error: 'method not allowed' }, 405);
    if (getApi[url.pathname]) return json(res, getApi[url.pathname]());
    if (url.pathname === '/api/memories') return json(res, listMemories({ employee: url.searchParams.get('employee') || undefined, kind: url.searchParams.get('kind') || undefined }));
    if (url.pathname === '/api/memories/recall') {
      const emp = url.searchParams.get('employee') || 'secretary';
      return json(res, recall(emp, url.searchParams.get('q') || '').map((x) => ({ id: x.id, kind: x.kind, summary: x.summary, doNotRepeat: x.do_not_repeat, company: x.employee_id === null })));
    }
    if (url.pathname === '/api/monitor/overview') return json(res, monitorOverview());
    if (url.pathname === '/api/alerts') return json(res, listAlerts());
    if (url.pathname === '/api/studio/projects') return json(res, listProjects());
    if (url.pathname === '/api/studio/project') { const pr = getProject(url.searchParams.get('name')); return pr ? json(res, pr) : json(res, { error: 'not found' }, 404); }
    if (url.pathname === '/api/studio/status') return json(res, buildStatus());
    let vm;
    if ((vm = url.pathname.match(/^\/media-out\/([a-z0-9_]+)\/([a-z0-9_]+)\.mp4$/)) && vm[1] === vm[2]) {
      // 완성 영상 재생 (앞뒤로 건너뛰기를 위해 Range 요청 지원)
      const f = outputFile(vm[1]);
      if (!f) return json(res, { error: 'not found' }, 404);
      const size = statSync(f).size;
      const rg = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (rg) {
        const start = rg[1] ? Number(rg[1]) : 0, end = rg[2] ? Math.min(Number(rg[2]), size - 1) : size - 1;
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        return createReadStream(f, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': size });
      return createReadStream(f).pipe(res);
    }
    if (url.pathname === '/api/plans') return json(res, listPlans());
    if (url.pathname === '/api/meetings') return json(res, listMeetings());
    let mm;
    if ((mm = url.pathname.match(/^\/api\/meetings\/(\d+)$/))) {
      const meeting = getMeeting(mm[1]);
      return meeting ? json(res, meeting) : json(res, { error: 'not found' }, 404);
    }
    const file = url.pathname === '/' ? '/index.html' : url.pathname;
    const target = join(publicDir, file);
    if (!target.startsWith(publicDir + sep)) return json(res, { error: 'forbidden' }, 403);
    try {
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      json(res, { error: 'not found' }, 404);
    }
  } catch (e) {
    json(res, { error: e.message }, e.status || 500);
  }
});

function openBrowser() {
  if (process.env.OPEN_BROWSER !== '1') return;
  const url = `http://localhost:${PORT}`;
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {}
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    // 이미 켜져 있는 경우: 새로 켜지 않고 브라우저만 연다.
    console.log('');
    console.log('  업무사이트가 이미 켜져 있습니다. 브라우저를 엽니다.');
    openBrowser();
    setTimeout(() => process.exit(0), 800);
    return;
  }
  console.error('서버를 켜지 못했습니다:', e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  tigercat-ai 업무사이트가 켜졌습니다.');
  console.log(`  브라우저에서 열기:  http://localhost:${PORT}`);
  console.log('  끄려면 이 창에서 Ctrl + C 를 누르세요.');
  console.log('');
  startMonitor(); // 조회수 수시 확인 시작 (YouTube API 키가 있을 때만 동작)
  openBrowser(); // 서버가 준비된 뒤에 브라우저를 연다 (먼저 열려서 접속 실패가 나던 문제 방지)
});
