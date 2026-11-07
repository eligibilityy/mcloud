// Per-thread busy time (ms per drawn frame) while the page scrolls, for a CSS variant: is the frame bound by the GPU
// process's threads (CPU) or by the GPU itself?
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [css = ''] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9229'), page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('xpui')), cdp = await browser.newBrowserCDPSession();
await page.evaluate(css => { let s = document.getElementById('m137'); if (!s) { s = document.createElement('style'); s.id = 'm137'; document.head.append(s); } s.textContent = css;
  const w = window.__m137 ??= {}; cancelAnimationFrame(w.raf); const v = document.querySelector('.main-view-container__scroll-node [data-overlayscrollbars-viewport]');
  let dir = 1; const f = () => { v.scrollTop += dir * 3; if (v.scrollTop > 2400) dir = -1; else if (v.scrollTop <= 0) dir = 1; w.raf = requestAnimationFrame(f); }; w.raf = requestAnimationFrame(f); }, css);
await sleep(1500);
const ev = [], on = e => ev.push(...e.value); cdp.on('Tracing.dataCollected', on); const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['toplevel', 'viz', 'gpu'], recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
await sleep(2000); await cdp.send('Tracing.end'); await done;
await page.evaluate(() => { cancelAnimationFrame(window.__m137.raf); document.getElementById('m137').textContent = ''; });
const th = {}, pr = {}; for (const e of ev) if (e.ph === 'M') { if (e.name === 'thread_name') th[e.pid + ':' + e.tid] = e.args.name; if (e.name === 'process_name') pr[e.pid] = e.args.name; }
const frames = ev.filter(e => e.name === 'DirectRenderer::DrawFrame' && (e.ph === 'X' || e.ph === 'B')).length;
const tot = {}, end = {}; for (const e of ev.filter(e => e.ph === 'X' && e.dur).sort((a, b) => a.ts - b.ts)) { const id = e.pid + ':' + e.tid, k = `${pr[e.pid] || e.pid}/${th[id] || e.tid}`; if (e.ts >= (end[id] || 0)) { tot[k] = (tot[k] || 0) + e.dur / 1000; end[id] = e.ts + e.dur; } else if (e.ts + e.dur > end[id]) { tot[k] += (e.ts + e.dur - end[id]) / 1000; end[id] = e.ts + e.dur; } }
console.log(`frames ${frames} in 2s = ${(2000 / frames).toFixed(2)} ms/frame`);
for (const [k, t] of Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${(t / 2000 * 100).toFixed(0).padStart(4)}% busy  ${(t / frames).toFixed(2)} ms/frame  ${k}`);
await browser.close().catch(() => {}); process.exit(0);
