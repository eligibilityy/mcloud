// Prototype: move a multi-read filter result into a layer of its own (live, reversible). window.__split.on(kinds)/off()
(() => {
  const S = window.__split ??= { undo: [] };
  const filterOf = l => document.getElementById((l.style.backdropFilter || getComputedStyle(l).backdropFilter).match(/#([\w-]+)/)[1]);
  // results: the primitives to move (by result name, in order); out: the name the rest of the filter read them by.
  const split = (l, results, out, cls) => {
    const f = filterOf(l), moved = results.map(r => f.querySelector(`:scope > [result="${r}"]`));
    if (moved.some(m => !m)) return;
    const nf = f.cloneNode(false); nf.id = f.id + '-x' + cls; f.before(nf);
    const marks = moved.map(m => [m, m.nextSibling]);
    for (const m of moved) nf.append(m.cloneNode(true));
    for (const m of moved) m.remove();
    const changed = [];
    for (const e of f.children) for (const a of ['in', 'in2']) if (e.getAttribute(a) === out) { changed.push([e, a]); e.setAttribute(a, 'SourceGraphic'); }
    const nl = l.cloneNode(false); nl.classList.remove('am-tglass-bend', 'am-tglass-mid', 'am-tglass-tone'); nl.classList.add('am-x-' + cls);
    nl.style.backdropFilter = nl.style.webkitBackdropFilter = `url(#${nf.id})`; l.before(nl);
    S.undo.push(() => { for (const [m, next] of marks.reverse()) f.insertBefore(m, next); for (const [e, a] of changed) e.setAttribute(a, out); nl.remove(); nf.remove(); });
  };
  const layers = p => [...document.querySelectorAll(`.am-player-face > .am-tglass-${p}, #am-toolbar-glass .am-tglass-pane > .am-tglass-${p}`)];
  S.on = kinds => {
    S.off();
    if (kinds.includes('soft')) layers('bend').forEach(l => split(l, ['soft'], 'soft', 'soft'));
    if (kinds.includes('thin')) layers('mid').forEach(l => split(l, ['tb', 'td', 'core'], 'core', 'thin'));
    if (kinds.includes('tone')) layers('tone').forEach(l => split(l, ['lum', 'tone', 'gl', 'chroma', 'boost', 'toned', 'tn'], 'tn', 'tn'));
    return document.querySelectorAll('[class*="am-x-"]').length;
  };
  S.off = () => { while (S.undo.length) S.undo.pop()(); };
})();
