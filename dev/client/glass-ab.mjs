// Old vs new glass in the live client (#137): a panel that switches the player's and the toolbar's glass between the
// layers of this build ("Yeni": the pre-blur and the thin lines in layers of their own) and main's structure ("Eski":
// both inside the bend and mid filters, recomputed per reader), in the same page load, so the two compare fairly.
//   Spotify started with --remote-debugging-port=9229 and this build installed, then: node dev/client/glass-ab.mjs
// Panel: Eski / Yeni (⌥A switches), Yanıp sön (switches every 0.6s, to see any difference by eye), a live meter of
// the frames while the page scrolls (per mode), and Otomatik test (scrolls the page 4s in each mode, three times,
// with vsync on: what the screen shows). On this Mac both may hold 60fps; Low Power Mode shows the difference.
// The panel and the switch live until the page reloads; nothing is saved.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9229').catch(() => null);
if (!browser) { console.log('Spotify is not running with --remote-debugging-port=9229.'); process.exit(1); }
const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('xpui'));
const out = await page.evaluate(() => {
  document.getElementById('am-ab-lab')?.remove(); window.__amAb?.stop();
  const groups = () => [...document.querySelectorAll('.am-player-face, #am-toolbar-glass > .am-tglass-pane')];
  const filterOf = l => document.getElementById((l.style.backdropFilter || getComputedStyle(l).backdropFilter).match(/#([\w-]+)/)?.[1]);
  // Main's structure, rebuilt from this build's filters: the soft layer's blur back inside the bend (its taps read it),
  // the thin layer's three primitives back at the start of mid (its halo, darkening and wash read their result).
  const toOld = g => {
    if (g.dataset.amAb === 'old') return true;
    const [soft, bend, thin, mid] = ['soft', 'bend', 'thin', 'mid'].map(p => g.querySelector(':scope > .am-tglass-' + p));
    if (!soft || !bend || !thin || !mid) return false;
    const fs = filterOf(soft), fb = filterOf(bend), ft = filterOf(thin), fm = filterOf(mid);
    const blur = fs.firstElementChild.cloneNode(true); blur.setAttribute('result', 'soft'); blur.dataset.amAb = '1'; fb.prepend(blur);
    fb.querySelectorAll('feDisplacementMap').forEach(e => { if (e.getAttribute('in') === 'SourceGraphic') { e.setAttribute('in', 'soft'); e.dataset.amAbIn = '1'; } });
    const prims = [...ft.children].map(c => { const k = c.cloneNode(true); k.dataset.amAb = '1'; return k; });
    let firstGlass = true;
    for (const e of [...fm.children]) {
      const r = e.getAttribute('result'), reads = r === 'halo' || r === 'dk' || r === 'cc' || (r === 'glass' && firstGlass);
      if (r === 'glass') firstGlass = false;
      if (reads) for (const a of ['in', 'in2']) if (e.getAttribute(a) === 'SourceGraphic') { e.setAttribute(a, 'core'); e.dataset['amAb' + a] = '1'; }
    }
    fm.prepend(...prims); soft.style.display = thin.style.display = 'none'; g.dataset.amAb = 'old'; return true;
  };
  const toNew = g => {
    if (g.dataset.amAb !== 'old') return;
    for (const f of ['bend', 'mid'].map(p => filterOf(g.querySelector(':scope > .am-tglass-' + p)))) {
      f.querySelectorAll('[data-am-ab]').forEach(e => e.remove());
      f.querySelectorAll('[data-am-ab-in]').forEach(e => { e.setAttribute('in', 'SourceGraphic'); delete e.dataset.amAbIn; });
      f.querySelectorAll('[data-am-abin2]').forEach(e => { e.setAttribute('in2', 'SourceGraphic'); delete e.dataset.amAbin2; });
      f.querySelectorAll('[data-am-abin]').forEach(e => { e.setAttribute('in', 'SourceGraphic'); delete e.dataset.amAbin; });
    }
    for (const p of ['soft', 'thin']) g.querySelector(':scope > .am-tglass-' + p).style.display = '';
    delete g.dataset.amAb;
  };
  if (!groups().some(g => g.querySelector(':scope > .am-tglass-soft'))) return 'This build has no soft layer: install the branch first (and keep the Liquid Glass player on, glass not Eco).';
  let mode = 'new';
  const apply = () => groups().forEach(g => mode === 'old' ? toOld(g) : toNew(g));
  // The toolbar's glass is rebuilt when its controls change (routes): put the chosen mode back.
  const keep = setInterval(apply, 300);
  // Meter: frame intervals while the page scrolls (a scroll event in the last 120ms), per mode.
  const stats = { old: [], new: [] }; let lastScroll = 0, prev = 0, raf = 0;
  addEventListener('scroll', () => { lastScroll = performance.now(); }, { capture: true, passive: true });
  const tick = t => { if (prev && t - lastScroll < 120 && t - prev < 500) stats[mode].push(t - prev); prev = t; raf = requestAnimationFrame(tick); render(); };
  const sum = a => { if (a.length < 10) return '—'; const mean = a.reduce((x, y) => x + y, 0) / a.length, slow = a.filter(x => x > 20).length; return `${(1000 / mean).toFixed(1)} fps, geç kare %${(100 * slow / a.length).toFixed(1)} (${a.length} kare)`; };
  const box = document.createElement('div'); box.id = 'am-ab-lab';
  box.innerHTML = `<style>#am-ab-lab{position:fixed;left:16px;bottom:96px;z-index:2147483646;width:300px;padding:12px;border-radius:12px;background:#1c1c1e;color:#eee;font:12px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 8px 30px #0008;-webkit-app-region:no-drag}
    #am-ab-lab b{font-size:13px}#am-ab-lab .seg{display:flex;gap:4px;margin:8px 0}#am-ab-lab .seg button{flex:1;padding:6px;border:0;border-radius:7px;background:#333;color:#eee;font:inherit;cursor:pointer}
    #am-ab-lab .seg button.on{background:var(--am-accent,#fa2d48);color:#fff}#am-ab-lab .row{display:flex;gap:6px;align-items:center;margin:6px 0}#am-ab-lab .act{padding:5px 8px;border:0;border-radius:6px;background:#333;color:#eee;font:inherit;cursor:pointer}
    #am-ab-lab .m{font-variant-numeric:tabular-nums;color:#bbb}#am-ab-lab .x{position:absolute;right:8px;top:6px;background:none;border:0;color:#888;font-size:16px;cursor:pointer}</style>
    <button class="x" title="Kapat">×</button><b>Cam lab: eski / yeni</b>
    <div class="seg"><button data-m="old">Eski (main)</button><button data-m="new">Yeni (soft + thin)</button></div>
    <div class="row"><label><input type="checkbox" class="blink"> Yanıp sön (0.6 sn)</label><span class="m">⌥A değiştirir</span></div>
    <div class="m">Kaydırırken:<br>Eski: <span class="so">—</span><br>Yeni: <span class="sn">—</span></div>
    <div class="row"><button class="act auto">Otomatik test</button><button class="act reset">Sıfırla</button></div><div class="m res"></div>
    <div class="m" style="margin-top:6px">Bu Mac'te ikisi de 60fps'te kalabilir; fark Düşük Güç Modu'nda belirginleşir.</div>`;
  document.body.append(box);
  const $ = s => box.querySelector(s);
  const render = () => { box.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.m === mode)); $('.so').textContent = sum(stats.old); $('.sn').textContent = sum(stats.new); };
  const set = m => { mode = m; apply(); render(); };
  box.querySelectorAll('.seg button').forEach(b => b.onclick = () => set(b.dataset.m));
  let blink = 0; $('.blink').onchange = e => { clearInterval(blink); if (e.target.checked) blink = setInterval(() => set(mode === 'old' ? 'new' : 'old'), 600); };
  const key = e => { if (e.altKey && e.code === 'KeyA') { e.preventDefault(); set(mode === 'old' ? 'new' : 'old'); } }; addEventListener('keydown', key, true);
  $('.reset').onclick = () => { stats.old = []; stats.new = []; $('.res').textContent = ''; render(); };
  // Automatic: 4s of scrolling (5px a frame, turning at the ends) in each mode, alternating, three rounds.
  $('.auto').onclick = async () => {
    const v = document.querySelector('.main-view-container__scroll-node [data-overlayscrollbars-viewport]'); if (!v) return;
    $('.auto').disabled = true; const res = { old: [], new: [] }, was = mode;
    for (let r = 0; r < 3; r++) for (const m of ['old', 'new']) {
      set(m); await new Promise(ok => setTimeout(ok, 400)); const iv = []; let p = 0, dir = 1; const end = performance.now() + 4000;
      await new Promise(ok => { const f = t => { if (p) iv.push(t - p); p = t; v.scrollTop += dir * 5; if (v.scrollTop > v.scrollHeight - v.clientHeight - 5) dir = -1; else if (v.scrollTop <= 0) dir = 1; if (t < end) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
      res[m].push(iv); $('.res').textContent = `Tur ${r + 1}/3: ${m === 'old' ? 'eski' : 'yeni'} bitti`;
    }
    const line = m => { const all = res[m].flat(), mean = all.reduce((x, y) => x + y, 0) / all.length; return `${(1000 / mean).toFixed(1)} fps, geç kare %${(100 * all.filter(x => x > 20).length / all.length).toFixed(1)}`; };
    $('.res').textContent = `Otomatik (3 × 4 sn): eski ${line('old')} · yeni ${line('new')}`; set(was); $('.auto').disabled = false;
  };
  $('.x').onclick = () => window.__amAb.stop();
  window.__amAb = { stop() { clearInterval(keep); clearInterval(blink); cancelAnimationFrame(raf); removeEventListener('keydown', key, true); mode = 'new'; apply(); box.remove(); delete window.__amAb; }, set, stats };
  raf = requestAnimationFrame(tick); render();
  return 'Lab is open in Spotify (bottom left).';
});
console.log(out);
await browser.close().catch(() => {}); process.exit(0);
