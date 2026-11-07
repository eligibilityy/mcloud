// Self time by event name on the GPU process main thread while the page scrolls (ms per frame).
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9229'), page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('xpui')), cdp = await browser.newBrowserCDPSession();
await page.evaluate(() => { const w = window.__m137 ??= {}; cancelAnimationFrame(w.raf); const v = document.querySelector('.main-view-container__scroll-node [data-overlayscrollbars-viewport]');
  let dir = 1; const f = () => { v.scrollTop += dir * 3; if (v.scrollTop > 2400) dir = -1; else if (v.scrollTop <= 0) dir = 1; w.raf = requestAnimationFrame(f); }; w.raf = requestAnimationFrame(f); });
await sleep(1200);
const ev = [], on = e => ev.push(...e.value); cdp.on('Tracing.dataCollected', on); const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['toplevel', 'viz', 'gpu', 'skia', 'disabled-by-default-skia', 'disabled-by-default-skia.gpu', 'gpu.graphite', 'disabled-by-default-gpu.graphite.dawn', 'gpu.dawn', 'disabled-by-default-gpu.dawn'], recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
await sleep(1500); await cdp.send('Tracing.end'); await done;
await page.evaluate(() => cancelAnimationFrame(window.__m137.raf));
const th = {}; for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') th[e.pid + ':' + e.tid] = e.args.name;
const frames = ev.filter(e => e.name === 'DirectRenderer::DrawFrame' && (e.ph === 'X' || e.ph === 'B')).length;
const xs = ev.filter(e => e.ph === 'X' && e.dur && th[e.pid + ':' + e.tid] === 'CrGpuMain').sort((a, b) => a.ts - b.ts || b.dur - a.dur);
// self time: subtract direct children
const self = new Map(), stack = [];
for (const e of xs) { while (stack.length && stack.at(-1).ts + stack.at(-1).dur <= e.ts) stack.pop(); const p = stack.at(-1); self.set(e, e.dur); if (p) self.set(p, self.get(p) - e.dur); stack.push(e); }
const by = {}; for (const [e, d] of self) { const n = e.name.replace(/\(.*$/, '').slice(0, 90); (by[n] ??= [0, 0]); by[n][0] += d / 1000; by[n][1]++; }
console.log(`frames ${frames}`); for (const [n, [d, c]] of Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).slice(0, 18)) console.log(`${(d / frames).toFixed(3).padStart(7)} ms/f  ${(c / frames).toFixed(1).padStart(6)}/f  ${n}`);
await browser.close().catch(() => {}); process.exit(0);
