# #137: scrolling lag with the Liquid Glass player on

Research for mcloudHQ/mcloud#137 (reporter: MacBook Air M2 16GB, macOS 27.3, Spotify 1.3.6.1921, Spicetify 2.46.4,
Spicy Lyrics, mouse wheel; 30–40fps everywhere; "Liquid Glass player" off makes it smooth at once; Full / Balanced /
Eco reportedly make no difference while it is on). Measured 2026-11-07 on `main` at `d2b53dd` (after #144, #159, #172,
#173). Nothing here changes the theme yet; the fix is the user's pick (end of this file).

## Setup

- This Mac: Apple M5, 4P + 6E CPU, **8-core GPU** (MacBook Air, fanless, 60Hz), battery, normal power mode. Spotify
  1400×900 CSS px at 2x, light appearance, sidebar 311px. Page: "Neon Genesis Evangelion OST" (the reporter's own
  video showed an Evangelion playlist), scrolled 3px a frame by rAF.
- Spotify started in the background without vsync (`--disable-gpu-vsync --disable-frame-rate-limit
  --disable-mac-overlays`, plus the no-throttling flags), so the draw interval is a frame's cost (as `dev/client/cost.mjs`).
- The user's Now Playing pane was open with Spicy Lyrics' animated background. Without vsync that canvas redraws
  hundreds of times a second and saturated the GPU (first run: 2–4 frames in 2s, meaningless). Every number below
  hides it (`#am-nowplaying,.am-native-right,.spicy-dynamic-bg,#Desktop_PanelContainer_Id{display:none}`); the
  reporter had no panel open.
- **Noise:** the user kept working (other apps open; the GPU was ~86% busy with Spotify idle), the die was 59–65°C.
  The same `full` state measured 12.4–18.0ms across the afternoon (6.9–7.5ms on a cool, quiet Mac on 2026-11-06).
  Only differences within one interleaved run are compared; each is the median of 3–4 rounds.
- Tools (this folder, `research/issue-137/`): `m137.mjs` (cost per real setting state and render passes per frame
  from Skia's trace), `split.js` (the prototype below, live and reversible), `busy.mjs` / `inner.mjs` (where the GPU
  process's main thread spends a frame), `pixdiff.mjs` (pixels with and without the prototype), `freq.c` + `clocks.py`
  (sudoless CPU/GPU clocks from IOReport, as macmon reads them), `scrollfor.mjs`.

## 1. What each setting costs

One run, interleaved, ms per frame (no vsync; 16.7 is the budget at 60Hz):

| state | ms/frame | Δ | render passes/frame |
| --- | --- | --- | --- |
| full (Balanced = Full outside the Spicy page) | 13.06 | | ~196 |
| **Eco** (`body.am-solid`) | **0.85** | −12.2 | ~1–2 |
| **"Liquid Glass player" off** (`am-liquid` removed) | 5.51 | −7.6 | ~88 |
| Eco + player off | 0.91 | −12.2 | |
| player's lens hidden, toolbar kept | 9.26 | −3.8 | ~117 |
| toolbar's lens hidden, player kept | 7.99 | −5.1 | ~116 |
| sidebar glow hidden | 11.63 | −1.4 | ~185 |
| both lenses hidden | 3.90 | −9.2 | ~36 |
| no backdrop filter at all | 0.74 | −12.3 | ~1 |

- **"Liquid Glass player" is not only the player.** `am-liquid` also gates the toolbar's lens (`glassShapes()` /
  `glassLive()` in `syncToolbarGlass`), the shelf chevrons and the menu glass. Turning it off removes both lenses
  (~156 of ~196 passes); the player falls back to a blur and the toolbar to Spotify's own buttons. That is why the
  reporter saw the lag vanish "instantly".
- **Eco removes everything here** (0.85ms, 94% less), in every build since `cb22b32` (2026-10-31: `syncPlayerGlass` is
  off under `am-solid`) and `a4a06ba` (toolbar shapes solid). The reporter's "even on Eco it stutters" could not be
  reproduced: on the GPU Eco is cheaper than "Liquid Glass player" off. Candidates: the setting was compared by eye
  after a short try; their build predated #159 (merged 2026-11-07, after their test), whose `:has()` restyles of a
  scrolling track list (~20ms, 27–37 long frames → 0–2) hit the main thread in every glass mode. Worth asking them to
  retry Eco on the current build.
- Balanced differs from Full only on the Spicy Lyrics page, so "Full / Balanced make no difference" is expected.

## 2. Where the time goes

**Render passes, not area.** ~196 Skia/Graphite render passes a frame, ~156 of them the two lenses (player ~78,
toolbar ~78, the toolbar being four shapes in one shared set of layers). Per layer (passes removed by hiding it):

| layer | player | toolbar |
| --- | --- | --- |
| bend (4 bilinear taps, 6 maps) | ~27 | ~25 |
| mid (thin lines, halo, edge read, wash on the toolbar) | ~32 | ~42 |
| tone (colour, highlight) | ~18 | ~15 |
| rim (hairline) | ~8 | ~8 |

At this load that is ~60µs a pass ((13.1 − 3.9) / ~158).

**The frame is bound by the GPU process's main thread** (`busy.mjs`: CrGpuMain 100% busy, 11.9ms a frame with the
lenses, 3.1ms without). Inside it (`inner.mjs`, self time per frame, full glass):

| | ms/frame | per frame |
| --- | --- | --- |
| `IOSurfaceImageBacking::WaitForCommandsToBeScheduled::Dawn` (waiting for the GPU) | 5.26 | 1 |
| `CommandBufferMTL::FillCommands` (Dawn encoding Metal commands) | 3.26 | 8 |
| `graphite::CommandBuffer::addRenderPass` | 0.97 | 196 |
| `graphite::TaskList::addCommands` | 0.60 | 204 |
| `Queue::Submit` | 0.46 | 8 |

So about half is CPU work that grows with the pass count (encoding, ~25µs a pass) and half is waiting on the GPU,
which also grows with passes. **Clocks while it runs** (`clocks.py`, sampled during the no-vsync scroll): GPU ~740–870
MHz average active (max 1578), P-cluster ~1.4–1.5 GHz (max 4.46), E-cluster ~2.1–2.3 GHz. Neither side runs near its
top clock: the CPU encodes, then waits while the GPU draws, so each stays partly idle and DVFS keeps both mid-range.
The cost is the latency of a long chain of small passes, which a slower chip pays on both sides.

**Why some layers cost more passes than primitives.** Chromium evaluates a filter as a tree, so a result read by
several primitives is recomputed for each reader (already found for the thin lines, `f1b5421`, and for `feMerge`):

- bend: `soft` (a 0.35–0.4px blur of the page) is read by all four displacement taps → computed 4×; the `fx` map by
  two composites → 2×.
- mid: `core` (the thin-line result: blur, darken, mix) is read by the halo, the darkening and the final mix, and on
  the toolbar by the wash → 3–4×.
- tone: `tn` (the toned glass) is read by the highlight's luminance and the final mix → 2×.

## 3. How this scales to the reporter's M2

- **Chip-independent:** ~196 passes a frame, ~156 of them the lenses, ~29 of them recomputations.
- **This Mac in Low Power Mode (2026-11-06, cool):** full 17.7ms, player's lens hidden 10.0, toolbar's 10.8, lenses
  and other backdrops hidden 0.7–1.5: over the budget with both lenses, within it with either one alone.
- **M2 vs M5:** both halves of the cost scale with the chip. Single-core CPU (the encoding) M2 ≈ 0.6× of M5; the M2
  Air's GPU (8 or 10 cores, ~1.4GHz max) against this M5's 8 cores at up to 1.58GHz is roughly 0.6–0.7×. So an M2 pays
  ~1.5–1.7× per pass: the 7–8ms the lenses cost on a quiet M5 becomes ~11–14ms, plus ~6ms for the rest of the page.
  That is over 16.7ms, and with vsync a frame that misses waits for the next one, so the page alternates between
  16.7 and 33ms frames: the "30–40fps" the reporter describes. Fanless heat (the M2 Air throttles under sustained
  load, as this M5 Air did: 6.9 → 13–18ms over the afternoon) and other apps on the GPU push it further.
- **Low Power Mode against the M2's clocks (measured 16:46–16:57, same load, `clocks.py` while scrolling).** Normal
  mode, full glass: GPU 1108–1325 MHz average active (top 1182–1578), P-cluster 3.34–3.55 GHz. Low Power Mode: GPU
  ~590–600 MHz average (top 1084–1278), P-cluster ~1.33–1.38 GHz (top 1.6–1.9). The M2's maxima are GPU ~1.4 GHz and
  P-core 3.49 GHz. So under this load normal mode runs near the M2's clocks (with the M5's higher work per clock),
  and Low Power Mode runs well below them: the M2 sits between the two, and Low Power Mode is a harsher stand-in than
  the M2 itself.

  | ms/frame | normal (first round, before the switch) | Low Power Mode (median of 3) |
  | --- | --- | --- |
  | full | 9.3 | 18.5 |
  | all three splits | 7.4 | 16.4 |
  | player's lens hidden | 6.3 | 11.7 |
  | toolbar's lens hidden | 8.4 | 13.1 |
  | both lenses hidden | 6.0 | 6.5 |
  | Eco | 1.1 | 0.9 |

  (The normal block's later rounds ran after the user switched the mode at 16:49:30, so only its first round is
  normal.) If the M2 lands between the two columns, the full glass costs ~10–18ms there plus heat and other apps:
  over the budget under load, which is what the reporter sees. The splits bring the stand-in to the edge (16.4ms),
  not clearly under it; one lens off brings it to 11.7–13.1.
- **Not the cause:** the halo's radius (halo at 10.9 instead of 13.5/15.3: no change, +0.23ms); the 4K external screen
  (the reporter sees the same on the built-in one, and the cost is per pass rather than per pixel); the map bytes
  (fixed on 2026-10-30, maps are three pieces); the queue panel and `:has()` (fixed by #144 and #159, and they do not
  depend on the glass setting). Mouse wheel vs trackpad: both scroll the same layer and redraw the whole area under
  each glass every frame that moves, so the per-frame cost is the same. A wheel sent over CDP was paced at exactly
  60 frames a second even without vsync, so its cost could not be read that way; with the glass on, the client
  accepted ~145 notches in 2s instead of ~400 (input waits on the busy GPU process).

## 4. Ranked causes

1. **The two lenses' pass count** (~156 passes, ~70% of the frame; evidence: table 1, pass counts, Low Power Mode).
   Either lens alone fits on this Mac in Low Power Mode; both together miss the frame. The reporter's toggle removes
   both.
2. **Recomputed results inside the filters** (~29 passes, ~15% of the frame; evidence: the split prototype below).
3. **Serialized CPU encode / GPU wait** (each pass costs latency on both sides, so a slower CPU and a slower GPU both
   add up; evidence: `inner.mjs`, clocks).
4. **Other backdrops:** sidebar blur, Spotify's top bar and list header as glass, the sidebar glow (~3ms together, the
   glow ~1.2–1.4ms).
5. Heat and other apps sharing the GPU (this Mac: 7 → 13–18ms for the same frame).

## 5. Fixes

### Prototyped: one more layer for each recomputed result (look kept)

`split.js` moves a result that several primitives read into a layer of its own, with the same box and clip, under
the layer that reads it; the reader then gets it as its backdrop, a texture computed once. This is `f1b5421`'s
thin-line split (local branch `claude/issue-137-scroll-glass`, approved by the user live on 2026-11-06 and reverted
until the reporter answered), extended to `soft` and `tn`, on the player and on the toolbar's shared layers.

| variant | ms/frame (run A) | ms/frame (run B) | passes/frame |
| --- | --- | --- | --- |
| full | 13.76 | 13.41 | 196 |
| `soft` split (bend) | 13.17 (−0.59) | | 184–189 |
| `thin` split (mid) | 12.36 (−1.41) | | 177–181 |
| `soft` + `thin` | 12.00 (−1.76) | 11.55 (−1.86) | 168–172 |
| `tone` split | | 12.95 (−0.45) | 187–193 |
| all three | | 11.15 (−2.26) | 166–168 |
| both lenses hidden | 4.10 | 4.07 | 36–38 |

In the normal-mode block run later (busier Mac): full 18.0 → all three 12.8 (−5.2, −29%). The lenses' share drops
by ~24–30%; the whole frame by 13–29%.

Pixels (`pixdiff.mjs`, page still, animations paused, three scroll positions; repeated captures without the change
differ by 0):

| split | player max / mean / pixels >2 | toolbar max / mean / pixels >2 |
| --- | --- | --- |
| `soft` | 6 / 0.000 / 0% | 0 / 0 / 0% |
| `thin` | 6 / 0.13 / 0.7% | 8 / 0.06 / 0.9% |
| `tone` | 19 / 0.01 / 0.1% | 16 / 0.03 / 0.26% |

`soft` is identical; `thin` is the 8-bit rounding of the extra layer (as on 2026-11-06); `tone`'s larger values sit on
the glass's edge (the antialiased ring is now blended by two clipped layers, not one) on ~0.07–0.19% of pixels.

### Other candidates

| idea | gain | look | status |
| --- | --- | --- | --- |
| `soft` + `thin` splits | −1.8ms (~13%), 196 → 170 passes | identical / ≤8/255 | prototyped, ready to implement |
| + `tone` split | −0.45ms more | edge ring up to 19/255 | prototyped; user to judge |
| one image per map instead of three pieces + merge | ≤ −2.5ms in Low Power Mode (2026-11-06 probe, pixel-wrong upper bound) | identical if drawn exactly | not prototyped; brings back map bytes (the 2026-10-30 problem), must be measured |
| split "Liquid Glass player" into player and toolbar settings | −3.8 / −5.1ms for whoever turns one off | that glass goes | needs the user's OK (a new setting) |
| adaptive: when scroll frames run over budget for a while (rAF deltas), drop one lens to its frosted fill until idle, only on that machine | up to −9ms there, nothing changes on fast Macs | changes the look on slow Macs, while scrolling | needs the user's OK |
| `lite` glass while scrolling | −9.5ms (3.8ms, like no lenses) | visibly simpler while moving | **rejected by the user on 2026-11-06** |
| smaller halo blur | none (+0.23ms) | changes the look | dropped |

### Recommendation

1. **Ship the `soft` and `thin` splits now** (look kept: `soft` pixel-identical, `thin` the version the user already
   approved). ~13% off the frame, ~25 passes. Optionally `tone` after a live look at the glass's edge.
2. **Ask the reporter** to update and retry: Eco (which removes the glass entirely here; if it still stutters, the cause
   is not the glass), then Full with the update. Ask for their GPU core count (About This Mac).
3. In Low Power Mode (harsher than an M2) the splits leave the full glass at 16.4ms, on the edge. If the M2 still
   misses the frame after 1, the remaining cost is structural (~130 passes for two lenses). The look-
   keeping options are spent; the next step is the user's choice between the adaptive fallback on slow Macs and
   separate player / toolbar glass toggles.

## 6. Implemented: `soft` + `thin` layers (look kept)

On the user's instruction ("no glass off, no change to the look"), commits `cc06ab4` (the thin-line layer from
`f1b5421`) and `13472a8` (the bend's pre-blur as a `soft` layer under it). `tone` is left out: its split blends the
glass's antialiased edge ring twice (up to 19/255).

- **Cost, same page load, 6 interleaved rounds** (old build with the prototype toggled; the installed build has the
  same structure, ~170 passes): full 13.64 → 11.37ms median, faster in all 6 rounds (−0.9 to −4.3ms); −17% of the
  frame, −23% of the lenses. Builds compared across reloads were too noisy to read (12.5 vs 12.8).
- **Look, old build vs new build installed in the client**, glass only (player content and toolbar icons hidden,
  animations paused, scroll 300/900/1500): player max 6/255, mean 0.13–0.22, 98.7–99.3% of pixels within 2 levels;
  toolbar max 7–9, mean 0.07–0.33, 95.8–98.9% within 2 levels, at most 6 pixels over 8. That is the thin layer's
  8-bit rounding the user approved live on 2026-11-06; `soft` alone is identical.
- `dev/smoke.mjs` checks the `soft` layer (one blur, the bend's taps read `SourceGraphic`), five layers per glass,
  and now waits for the Now Playing pane's slide before reading its rect (the extra layer slowed the headless
  renderer enough to read it mid-slide). 90/90 twice with Spotify idle. "a menu's glass keeps its loaded map pieces"
  fails now and then on `main` too when the Mac is busy (100ms waits).
- **What is left with the look kept:** every other result in the filters is read once. Joining the map pieces into
  one image cut 15 passes on the player but no time (the bytes come back). The player and the toolbar cannot share
  layers (different blur radii and tone curves). The window's size adds to the lenses' cost (900×620 7.6ms →
  1700×1050 11.8ms on this Mac), and a trivial backdrop layer costs ~100–125µs, almost regardless of the window.
- **The reporter's second video** (streamable `lp8cu2`, original 2720×1974 = a ~1360×987pt window on the 4K screen at
  2x, sidebar hidden, album colour on, BTS albums): ~35fps while moving with the glass on (11–17s), ~48–52fps with it
  off (0–3s, 25–28s), counted from frame changes (wheel pauses excluded only roughly). Their GPU History shows the M2
  at ~70–85% while scrolling.

## Not done yet

- Real wheel scrolling with vsync recorded from the window (`wincap`) on the stand-in.
- The map-image idea, measured with its bytes.
