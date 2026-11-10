// 쇼츠 조립기: 장면 이미지 + Arthur 음성 + 큰 영어 자막 → 9:16 mp4 (ffmpeg 사용, 크레딧 0)
// 사용법:  node media/make-short.mjs media/short1.json
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('사용법: node media/make-short.mjs media/short1.json'); process.exit(1); }
const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out', cfg.name);
const assets = join(out, 'assets');
await mkdir(assets, { recursive: true });

const log = (m) => console.log('  ' + m);
const exists = (p) => access(p).then(() => true, () => false);

// 1) 파일 내려받기 (이미 있으면 건너뜀)
async function fetchTo(url, file) {
  if (await exists(file)) return log('이미 있음: ' + basename(file));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`내려받기 실패(${r.status}): ${url}`);
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
  log('내려받음: ' + basename(file));
}
console.log('\n[1/4] 파일 내려받기');
const imgFiles = cfg.images.map((_, i) => `assets/scene${i + 1}.png`);
for (let i = 0; i < cfg.images.length; i++) await fetchTo(cfg.images[i], join(out, imgFiles[i]));
await fetchTo(cfg.audio, join(out, 'assets/narration.mp3'));

// ffmpeg / ffprobe 확인
for (const bin of ['ffmpeg', 'ffprobe']) {
  const t = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  if (t.error) { console.error(`\n${bin}를 찾을 수 없습니다. PowerShell을 새로 열어 다시 시도하거나 ffmpeg 설치를 확인하세요.`); process.exit(1); }
}

// 2) 음성 길이와 속도 보정
console.log('\n[2/4] 음성 분석');
const audioPath = join(out, 'assets/narration.mp3');
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath], { encoding: 'utf8' });
const rawDur = parseFloat(probe.stdout);
if (!rawDur) { console.error('음성 길이를 읽지 못했습니다.'); process.exit(1); }
const tempo = Math.min(1.08, Math.max(1, rawDur / cfg.targetSeconds));
const dur = rawDur / tempo;
log(`원래 길이 ${rawDur.toFixed(2)}초 → 속도 x${tempo.toFixed(3)} → 최종 ${dur.toFixed(2)}초`);

const sentences = cfg.scenes.flatMap((s, si) => s.sentences.map((text) => ({ text, scene: si })));
const words = (t) => t.split(/\s+/).filter(Boolean).length;

// 문장 경계 찾기: 음성의 무음 구간이 (문장 수 - 1)개면 그 위치를 쓰고, 아니면 단어 수 비율로 나눈다.
function findBoundaries() {
  try {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-i', audioPath, '-af', 'silencedetect=noise=-32dB:d=0.18', '-f', 'null', '-'], { encoding: 'utf8' });
    const starts = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
    const ends = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
    const gaps = [];
    for (let i = 0; i < starts.length; i++) {
      const e = ends[i] ?? rawDur;
      if (starts[i] < 0.2 || e > rawDur - 0.1) continue; // 맨 앞/맨 뒤 무음은 제외
      gaps.push((starts[i] + e) / 2);
    }
    if (gaps.length === sentences.length - 1) return { mode: '음성 무음 구간', b: gaps.map((g) => g / tempo) };
  } catch {}
  const total = sentences.reduce((a, s) => a + words(s.text), 0);
  let acc = 0; const b = [];
  for (let i = 0; i < sentences.length - 1; i++) { acc += words(sentences[i].text); b.push((acc / total) * dur); }
  return { mode: '단어 수 비율(추정)', b };
}
const { mode, b } = findBoundaries();
log('자막 타이밍 방식: ' + mode);
sentences.forEach((s, i) => { s.start = i === 0 ? 0 : b[i - 1]; s.end = i === sentences.length - 1 ? dur : b[i]; });
const sceneStart = cfg.scenes.map((_, si) => sentences.find((s) => s.scene === si).start);
const sceneDur = sceneStart.map((st, i) => (i === sceneStart.length - 1 ? dur : sceneStart[i + 1]) - st);

// 3) 자막 파일(ASS): 큰 영문 대문자, 빨강은 지정한 단어만
console.log('\n[3/4] 자막 만들기');
const font = process.env.CAPTION_FONT || (process.platform === 'win32' ? 'Consolas' : process.platform === 'darwin' ? 'Menlo' : 'DejaVu Sans Mono');
const ts = (t) => { const c = Math.round(t * 100); const h = Math.floor(c / 360000), m = Math.floor((c % 360000) / 6000), s = Math.floor((c % 6000) / 100); return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`; };
const red = new Set(cfg.redWords.map((w) => w.toUpperCase()));
const styled = (text) => text.toUpperCase().split(' ').map((w) => (red.has(w.replace(/[^A-Z']/g, '')) ? `{\\c&H303BFF&}${w}{\\c&HFFFFFF&}` : w)).join(' ');
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},74,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,8,90,90,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${sentences.map((s) => `Dialogue: 0,${ts(s.start)},${ts(s.end)},Default,,0,0,0,,${styled(s.text)}`).join('\n')}
`;
await writeFile(join(out, 'captions.ass'), ass, 'utf8');
sceneDur.forEach((d, i) => log(`장면 ${i + 1}: ${sceneStart[i].toFixed(2)}초부터 ${d.toFixed(2)}초간`));

// 4) 영상 조립
console.log('\n[4/4] 영상 조립 (1~2분 걸릴 수 있습니다)');
const args = ['-y', '-hide_banner', '-loglevel', 'error', '-stats'];
cfg.scenes.forEach((s, i) => args.push('-loop', '1', '-framerate', '30', '-t', sceneDur[i].toFixed(3), '-i', imgFiles[s.image]));
args.push('-i', 'assets/narration.mp3');
const n = cfg.scenes.length;
const f = [];
for (let i = 0; i < n; i++) f.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,fps=30,format=yuv420p[v${i}]`);
f.push(`${cfg.scenes.map((_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0[vc]`);
f.push(`[vc]ass=captions.ass,fade=t=out:st=${(dur - 0.4).toFixed(2)}:d=0.4[vout]`);
f.push(`[${n}:a]atempo=${tempo.toFixed(4)},afade=t=out:st=${(dur - 0.3).toFixed(2)}:d=0.3[aout]`);
args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', dur.toFixed(3),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${cfg.name}.mp4`);
const r = spawnSync('ffmpeg', args, { cwd: out, stdio: 'inherit' });
if (r.status !== 0) { console.error('\n영상 조립에 실패했습니다. 위의 오류 메시지를 캡처해서 알려 주세요.'); process.exit(1); }
console.log(`\n완성: ${join(out, cfg.name + '.mp4')}  (${dur.toFixed(1)}초, 1080x1920)`);
