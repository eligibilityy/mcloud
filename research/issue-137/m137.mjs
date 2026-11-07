// GPU cost per frame (no-vsync Spotify) for real setting states, plus Skia render passes per frame.
//   node m137.mjs <variant,...>   env ROUNDS, PASSES=1 (also count passes), SECS
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HIDE_PLAYER = '.am-player-face,#am-player > .am-tglass-rim{display:none!important}#am-player{backdrop-filter:none!important}';
const V = {
  full: { css: '' },
  eco: { js: 'b.classList.add("am-solid")', undo: 'b.classList.remove("am-solid")' },
  liqoff: { js: 'b.classList.remove("am-liquid")', undo: 'b.classList.add("am-liquid")' },
  ecoliqoff: { js: 'b.classList.add("am-solid");b.classList.remove("am-liquid")', undo: 'b.classList.remove("am-solid");b.classList.add("am-liquid")' },
  noplayer: { css: HIDE_PLAYER },
  notoolbar: { css: '#am-toolbar-glass{display:none!important}' },
  noglow: { css: '#am-sidebar-glow{display:none!important}' },
  nolens: { css: HIDE_PLAYER + '#am-toolbar-glass{display:none!important}' },
  nobackdrop: { css: '*,*::before,*::after{backdrop-filter:none!important}#am-toolbar-glass,.am-player-face,#am-player > .am-tglass-rim,#am-sidebar-glow{display:none!important}' },
};
for (const [k, v] of Object.entries(JSON.parse(process.env.EXTRA || '{}'))) V[k] = v;
const names = process.argv[2].split(','), rounds = +(process.env.ROUNDS || 3), secs = +(process.env.SECS || 2), passes = !!process.env.PASSES;
const browser = await chromium.connectOverCDP('http://127.0.0.1:9229'), page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('xpui')), cdp = await browser.newBrowserCDPSession();
const set = (v, on) => page.evaluate(([css, js, on, base]) => {
  const b = document.body; let s = document.getElementById('m137'); if (!s) { s = document.createElement('style'); s.id = 'm137'; document.head.append(s); }
  s.textContent = base + (on ? css : ''); if (js) { new Function("b", js)(b); if (!js.includes("__split")) document.dispatchEvent(new Event("am-settings")); }
}, [v.css || '', on ? v.js : v.undo, on, process.env.BASE || '']);
const scroll = on => page.evaluate(on => {
  const w = window.__m137 ??= {}; cancelAnimationFrame(w.raf); if (!on) return;
  const v = document.querySelector('.main-view-container__scroll-node [data-overlayscrollbars-viewport]') || document.querySelector('.main-view-container__scroll-node');
  let dir = 1; const f = () => { v.scrollTop += dir * 3; if (v.scrollTop > 2400) dir = -1; else if (v.scrollTop <= 0) dir = 1; w.raf = requestAnimationFrame(f); }; w.raf = requestAnimationFrame(f);
}, on);
const cats = passes ? ['viz', 'gpu', 'skia', 'disabled-by-default-skia', 'disabled-by-default-skia.gpu', 'gpu.graphite', 'disabled-by-default-gpu.graphite.dawn', 'gpu.dawn'] : ['viz'];
const res = {}, pres = {}, names2 = {};
await scroll(true);
for (let r = 0; r < rounds; r++) for (const n of names) {
  const v = V[n]; await set(v, true); await sleep(1500);
  const ev = [], on = e => ev.push(...e.value); cdp.on('Tracing.dataCollected', on); const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: cats, recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
  await sleep(secs * 1000); await cdp.send('Tracing.end'); await done; cdp.off('Tracing.dataCollected', on);
  await set(v, false);
  const ts = ev.filter(e => e.name === 'DirectRenderer::DrawFrame' && (e.ph === 'X' || e.ph === 'B')).map(e => e.ts).sort((a, b) => a - b);
  const ms = (ts.at(-1) - ts[0]) / 1000 / (ts.length - 1); (res[n] ??= []).push(ms);
  let line = `r${r} ${n.padEnd(12)} ${ms.toFixed(2)} ms/frame (${ts.length} frames)`;
  if (passes) {
    const cnt = {}; for (const e of ev) if ((e.ph === 'X' || e.ph === 'B') && /RenderPass|saveLayer/i.test(e.name)) cnt[e.name] = (cnt[e.name] || 0) + 1;
    const per = Object.fromEntries(Object.entries(cnt).map(([k, c]) => [k, c / ts.length])); (pres[n] ??= []).push(per);
    const g = re => Object.entries(per).filter(([k]) => re.test(k)).reduce((a, [, c]) => a + c, 0); line += `  passes=${g(/addRenderPass/).toFixed(1)} saveLayer=${g(/^int SkCanvas::saveLayer/).toFixed(1)}`;
  }
  console.log(line);
}
await scroll(false); await page.evaluate(() => document.getElementById('m137')?.remove());
const median = a => [...a].sort((x, y) => x - y)[a.length >> 1], base = median(res[names[0]]);
console.log('median ms/frame:'); for (const n of names) console.log(`  ${n.padEnd(12)} ${median(res[n]).toFixed(2)}  ${(median(res[n]) - base >= 0 ? '+' : '') + (median(res[n]) - base).toFixed(2)}  [${res[n].map(x => x.toFixed(1)).join(' ')}]`);
await browser.close().catch(() => {}); process.exit(0);
