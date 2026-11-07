// Pixel difference of the player and toolbar glass with the splits on vs off (page still, animations paused).
import { chromium } from 'playwright';
import fs from 'node:fs';
const kinds = process.argv[2] || 'soft,thin,tone', scrolls = (process.argv[3] || '300,900,1500').split(',').map(Number);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9229'), page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('xpui')), pc = await page.context().newCDPSession(page);
await page.evaluate(fs.readFileSync(new URL('./split.js', import.meta.url), 'utf8'));
await page.evaluate(() => { let s = document.getElementById('m137p'); if (!s) { s = document.createElement('style'); s.id = 'm137p'; document.head.append(s); } s.textContent = '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}'; });
const boxes = await page.evaluate(() => { const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return { x: Math.floor(b.x) - 2, y: Math.floor(b.y) - 2, width: Math.ceil(b.width) + 4, height: Math.ceil(b.height) + 4 }; }; return { player: r('.am-player-face'), toolbar: r('#am-toolbar-glass .am-tglass-pane') }; });
const shot = async clip => (await pc.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })).data;
const cmp = (a, b) => page.evaluate(async ([a, b]) => {
  const px = async d => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + d)).blob()); const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height).data; };
  const A = await px(a), B = await px(b); let max = 0, sum = 0, n = 0, over2 = 0, over8 = 0;
  for (let i = 0; i < A.length; i += 4) { const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])); max = Math.max(max, d); sum += d; n++; if (d > 2) over2++; if (d > 8) over8++; }
  return { max, mean: +(sum / n).toFixed(3), over2: +(100 * over2 / n).toFixed(2) + '%', over8: +(100 * over8 / n).toFixed(3) + '%', px: n };
}, [a, b]);
for (const top of scrolls) {
  await page.evaluate(top => { document.querySelector('.main-view-container__scroll-node [data-overlayscrollbars-viewport]').scrollTop = top; }, top); await sleep(400);
  const out = {};
  for (const [k, box] of Object.entries(boxes)) {
    const a = await shot(box); await page.evaluate(k => __split.on(k), kinds); await sleep(300); const b = await shot(box); await page.evaluate(() => __split.off()); await sleep(300); const a2 = await shot(box);
    out[k] = { split: await cmp(a, b), noise: await cmp(a, a2) };
    if (top === scrolls[0]) { fs.writeFileSync(`pd-${k}-off.png`, Buffer.from(a, 'base64')); fs.writeFileSync(`pd-${k}-on.png`, Buffer.from(b, 'base64')); }
  }
  console.log(`scrollTop ${top}:`, JSON.stringify(out));
}
await page.evaluate(() => document.getElementById('m137p').remove());
await browser.close().catch(() => {}); process.exit(0);
