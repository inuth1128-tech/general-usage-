// 성과 모니터링: 올린 영상의 조회수를 기록하고, 수시로 확인하고, 쓰레드(SNS 담당)가 리포트를 쓴다.
import { db } from './db.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitInstruction } from './agents.js';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const PLATFORMS = ['youtube', 'instagram', 'facebook', 'threads'];
const MILESTONES = [100, 500, 1000, 5000, 10000, 50000, 100000, 1000000];
const state = { lastRun: null, lastError: null, running: false };
const intervalMin = () => Math.max(5, Number(process.env.MONITOR_MINUTES || 60));
const apiBase = () => process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3';
const hasKey = () => !!process.env.YOUTUBE_API_KEY;

export function youtubeId(input) {
  const t = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtube\.com\/(?:shorts\/|watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function saveKey(key) {
  const k = String(key || '').trim();
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(k)) return { error: 'API 키 모양이 올바르지 않습니다. 구글에서 복사한 글자만 그대로 붙여넣어 주세요.', status: 400 };
  let lines = [];
  if (existsSync(envPath)) lines = readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !/^\s*YOUTUBE_API_KEY\s*=/.test(l));
  lines.push('YOUTUBE_API_KEY=' + k);
  writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
  process.env.YOUTUBE_API_KEY = k;
  state.lastError = null;
  return { ok: true };
}

function insertMetric(videoId, views, likes, comments, source) {
  const prev = db.prepare('SELECT views FROM metrics WHERE video_id = ? ORDER BY id DESC LIMIT 1').get(videoId);
  db.prepare('INSERT INTO metrics (video_id, views, likes, comments, source) VALUES (?, ?, ?, ?, ?)').run(videoId, views, likes, comments, source);
  const before = prev ? prev.views : 0;
  const v = db.prepare('SELECT title, platform FROM tracked_videos WHERE id = ?').get(videoId);
  // 한 번에 여러 기준을 넘으면 가장 큰 것 하나만 알린다.
  const crossed = MILESTONES.filter((m) => before < m && views >= m);
  if (crossed.length) {
    const m = crossed[crossed.length - 1];
    db.prepare('INSERT INTO alerts (video_id, message) VALUES (?, ?)').run(videoId, `🎉 [${v.platform}] "${v.title}" 조회수 ${m.toLocaleString('ko-KR')} 돌파! (현재 ${views.toLocaleString('ko-KR')})`);
  }
}

export function addVideo({ platform, url, title }) {
  if (!PLATFORMS.includes(platform)) return { error: '플랫폼이 올바르지 않습니다.', status: 400 };
  const link = String(url || '').trim().slice(0, 300);
  let ref;
  if (platform === 'youtube') {
    ref = youtubeId(link);
    if (!ref) return { error: 'YouTube 영상 주소를 붙여넣어 주세요. (예: youtube.com/shorts/…)', status: 400 };
  } else {
    ref = link || String(title || '').trim();
    if (!ref) return { error: '영상 이름이나 주소를 적어 주세요.', status: 400 };
  }
  const t = String(title || '').trim().slice(0, 100) || (platform === 'youtube' ? `YouTube ${ref}` : ref.slice(0, 60));
  if (db.prepare('SELECT 1 FROM tracked_videos WHERE platform = ? AND ref = ?').get(platform, ref)) return { error: '이미 등록된 영상입니다.', status: 409 };
  const r = db.prepare('INSERT INTO tracked_videos (platform, ref, title, url) VALUES (?, ?, ?, ?)').run(platform, ref, t, link || null);
  return { ok: true, id: Number(r.lastInsertRowid) };
}

export function addManualMetric(videoId, { views, likes, comments }) {
  const v = db.prepare('SELECT id FROM tracked_videos WHERE id = ?').get(Number(videoId));
  if (!v) return { error: '없는 영상입니다.', status: 404 };
  const n = (x) => (x === undefined || x === null || x === '' ? null : Number(x));
  const vs = n(views), ls = n(likes), cs = n(comments);
  for (const x of [vs, ls, cs]) if (x !== null && (!Number.isInteger(x) || x < 0 || x > 1e10)) return { error: '숫자는 0 이상의 정수로 적어 주세요.', status: 400 };
  if (vs === null) return { error: '조회수를 적어 주세요.', status: 400 };
  insertMetric(v.id, vs, ls, cs, 'manual');
  return { ok: true };
}

export function deleteVideo(id) {
  const r = db.prepare('DELETE FROM tracked_videos WHERE id = ?').run(Number(id));
  return r.changes ? { ok: true } : { error: '없는 영상입니다.', status: 404 };
}

export function overview() {
  const videos = db.prepare('SELECT * FROM tracked_videos ORDER BY id DESC').all().map((v) => {
    const rows = db.prepare('SELECT views, likes, comments, source, taken_at FROM metrics WHERE video_id = ? ORDER BY id DESC LIMIT 60').all(v.id);
    const latest = rows[0] || null, prev = rows[1] || null;
    const dayAgo = db.prepare("SELECT views FROM metrics WHERE video_id = ? AND taken_at <= datetime('now','localtime','-1 day') ORDER BY id DESC LIMIT 1").get(v.id);
    return {
      id: v.id, platform: v.platform, title: v.title, url: v.url, createdAt: v.created_at,
      latest, change: latest && prev ? latest.views - prev.views : null,
      change24h: latest && dayAgo ? latest.views - dayAgo.views : null,
      series: rows.map((r) => r.views).reverse(),
    };
  });
  return { status: { hasKey: hasKey(), lastRun: state.lastRun, lastError: state.lastError, intervalMin: intervalMin(), running: state.running }, videos };
}

// ---- YouTube 자동 조회 (공개 통계라 API 키만 있으면 됨) ----
export async function fetchYoutubeNow() {
  if (!hasKey()) return { error: 'YouTube API 키가 아직 없습니다. 아래에 키를 붙여넣어 주세요.', status: 400 };
  if (state.running) return { error: '이미 조회 중입니다.', status: 409 };
  const vids = db.prepare("SELECT id, ref FROM tracked_videos WHERE platform = 'youtube'").all();
  if (!vids.length) return { ok: true, updated: 0, note: '등록된 YouTube 영상이 없습니다.' };
  state.running = true;
  try {
    let updated = 0;
    for (let i = 0; i < vids.length; i += 50) {
      const chunk = vids.slice(i, i + 50);
      const url = `${apiBase()}/videos?part=statistics,snippet&id=${chunk.map((v) => v.ref).join(',')}&key=${encodeURIComponent(process.env.YOUTUBE_API_KEY)}`;
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body.error && body.error.message) || `YouTube 응답 오류 (${res.status})`);
      const byId = new Map((body.items || []).map((it) => [it.id, it]));
      for (const v of chunk) {
        const it = byId.get(v.ref);
        if (!it) continue; // 비공개/삭제된 영상
        const st = it.statistics || {};
        const row = db.prepare('SELECT title FROM tracked_videos WHERE id = ?').get(v.id);
        if (row.title === `YouTube ${v.ref}` && it.snippet && it.snippet.title) db.prepare('UPDATE tracked_videos SET title = ? WHERE id = ?').run(String(it.snippet.title).slice(0, 100), v.id);
        insertMetric(v.id, Number(st.viewCount || 0), st.likeCount === undefined ? null : Number(st.likeCount), st.commentCount === undefined ? null : Number(st.commentCount), 'auto');
        updated++;
      }
    }
    state.lastRun = new Date().toISOString(); state.lastError = null;
    return { ok: true, updated };
  } catch (e) {
    state.lastError = e.message;
    return { error: '조회에 실패했습니다: ' + e.message, status: 502 };
  } finally { state.running = false; }
}

let timer = null;
export function startMonitor() {
  if (timer) return;
  const tick = () => { if (hasKey()) fetchYoutubeNow(); };
  setTimeout(tick, 15000);
  timer = setInterval(tick, intervalMin() * 60000);
  timer.unref();
}

// ---- 알림 ----
export const listAlerts = () => db.prepare('SELECT id, message, created_at AS createdAt FROM alerts WHERE seen = 0 ORDER BY id DESC LIMIT 20').all();
export function markAlertsSeen() { db.prepare('UPDATE alerts SET seen = 1 WHERE seen = 0').run(); return { ok: true }; }

// ---- 쓰레드(SNS 담당)에게 성과 리포트 요청 (Claude 호출 1회) ----
export function requestReport() {
  const o = overview();
  if (!o.videos.length) return { error: '등록된 영상이 없습니다. 먼저 영상을 등록해 주세요.', status: 400 };
  const f = (x) => (x === null || x === undefined ? '-' : Number(x).toLocaleString('ko-KR'));
  const lines = o.videos.map((v) => `- [${v.platform}] ${v.title}: 조회수 ${f(v.latest && v.latest.views)}, 좋아요 ${f(v.latest && v.latest.likes)}, 댓글 ${f(v.latest && v.latest.comments)}, 직전 대비 ${f(v.change)}, 24시간 변화 ${f(v.change24h)}, 확인 시각 ${v.latest ? v.latest.taken_at : '-'}, 게시 후 기록 ${v.series.length}회`);
  const instruction = `성과 리포트를 써 주세요. 아래는 지금까지 기록된 영상별 숫자입니다.\n${lines.join('\n')}\n\n쉬운 한국어로 다음 형식만 사용: 1) 한 줄 요약 2) 잘된 점 3) 아쉬운 점과 가설(숫자가 적으면 "아직 판단하기 이르다"고 솔직히 쓰기) 4) 다음에 할 행동 3가지. 숫자에 없는 내용은 지어내지 마세요.`;
  return submitInstruction(instruction, 'social');
}
