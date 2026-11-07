// Scroll the page by rAF for N seconds (no measurement), optional CSS.
import { chromium } from 'playwright';
const [secs = 6, css = ''] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9229'), page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('xpui'));
await page.evaluate(css => { let s = document.getElementById('m137'); if (!s) { s = document.createElement('style'); s.id = 'm137'; document.head.append(s); } s.textContent = css;
  const w = window.__m137 ??= {}; cancelAnimationFrame(w.raf); const v = document.querySelector('.main-view-container__scroll-node [data-overlayscrollbars-viewport]');
  let dir = 1; const f = () => { v.scrollTop += dir * 3; if (v.scrollTop > 2400) dir = -1; else if (v.scrollTop <= 0) dir = 1; w.raf = requestAnimationFrame(f); }; w.raf = requestAnimationFrame(f); }, css);
await new Promise(r => setTimeout(r, secs * 1000));
await page.evaluate(() => { cancelAnimationFrame(window.__m137.raf); document.getElementById('m137').textContent = ''; });
await browser.close().catch(() => {}); process.exit(0);
