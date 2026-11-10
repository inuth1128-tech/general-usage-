// 업무사이트 서버: 내 컴퓨터(localhost)에서만 접속 가능하다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { submitInstruction, todayUsage } from './secretary.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = '127.0.0.1'; // 외부 접속 차단 (이 컴퓨터에서만)
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const api = {
  '/api/health': () => ({ ok: true, company: 'tigercat-ai', time: new Date().toISOString() }),
  '/api/employees': () => db.prepare('SELECT id, name, title, role, reports_to AS reportsTo, engine, tools, persona, active FROM employees ORDER BY CASE id WHEN \'secretary\' THEN 0 ELSE 1 END, rowid').all(),
  '/api/tasks': () => db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 50').all(),
  '/api/memories': () => db.prepare('SELECT * FROM memories ORDER BY id DESC LIMIT 50').all(),
  '/api/summary': () => ({
    employees: db.prepare('SELECT COUNT(*) AS n FROM employees WHERE active = 1').get().n,
    tasks: db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n,
    memories: db.prepare('SELECT COUNT(*) AS n FROM memories').get().n,
    usage: todayUsage(),
  }),
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (req.method === 'POST' && url.pathname === '/api/tasks') {
    // 다른 웹사이트가 내 컴퓨터의 이 서버를 몰래 호출하지 못하게 막는다.
    const origin = req.headers.origin;
    if (origin && origin !== `http://localhost:${PORT}` && origin !== `http://127.0.0.1:${PORT}`) return json(res, { error: 'forbidden origin' }, 403);
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 10000) return json(res, { error: 'too large' }, 413); }
    let data = {};
    try { data = JSON.parse(raw || '{}'); } catch { return json(res, { error: 'invalid json' }, 400); }
    const r = submitInstruction(data.instruction);
    return json(res, r.error ? { error: r.error } : r, r.status && r.error ? r.status : 202);
  }
  if (req.method !== 'GET') return json(res, { error: 'method not allowed' }, 405);
  if (api[url.pathname]) return json(res, api[url.pathname]());
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  const target = join(publicDir, file);
  if (!target.startsWith(publicDir)) return json(res, { error: 'forbidden' }, 403);
  try {
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    json(res, { error: 'not found' }, 404);
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  tigercat-ai 업무사이트가 켜졌습니다.');
  console.log(`  브라우저에서 열기:  http://localhost:${PORT}`);
  console.log('  끄려면 이 창에서 Ctrl + C 를 누르세요.');
  console.log('');
});
