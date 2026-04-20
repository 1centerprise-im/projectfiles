# Code Review Report v2 — Marquee Deselect Bug Fix

**Date:** 2026-04-20
**Scope:** Two-iteration fix for the marquee/click interaction in the Mind Map Editor.
**Branch:** `claude/zen-hoover-9377fa`
**Predecessor:** `CODE_REVIEW.md` (2026-03-28, full codebase audit)

---

## 1. SPECIFICATION

### Bug report (as filed)

URL: `editor.html?folder=consultancy&map=NAP`

Steps:
1. Open map with multiple nodes.
2. Drag a marquee over empty canvas to select all nodes (green border, +/- buttons, red X appear).
3. Left-click once on empty canvas — expecting selection to clear.

Expected: green borders disappear, canvas stays put.
Actual: borders remain, canvas visibly jumps upward.
Frequency: 100%, reproduced in Zen and Chrome.

### Decided behavior (from brainstorming)

- **Click on empty canvas** → clears selection. No pan starts on simple click.
- **Drag on empty canvas** → marquee selection.
- **Pan** → only via middle-mouse-button or `Space + drag`.
- Pan-on-left-drag is **not** introduced — would conflict with marquee.

---

## 2. ROOT CAUSES

The bug had **three layered causes**, not one. Fixing only the topmost cause would have left two regressions.

### 2.1 Stale `window._rbR` (selection)

`onCanvasDown` left-button branch starts a rubber-band gesture on every mousedown over empty canvas — even for clicks with no drag. `endRubberBand` reads `window._rbR` to determine which nodes fall inside the marquee rectangle.

`window._rbR` is only updated inside `doRubberBand` — which fires on mousemove. A click with no movement leaves `_rbR` untouched, so `endRubberBand` reads the **previous gesture's rectangle** — the one that just selected every node — and re-selects them all.

### 2.2 Layout-shift from in-flow panels (canvas "jumps")

`#format-panel` and `#draw-bar` sat between the toolbar and `#canvasContainer` in a `flex: column` layout. Every time selection appeared/disappeared the panel toggled `display: none ↔ flex`, which resized the canvas container and visually shifted the canvas.

Initially mistaken for a "pan" bug — `panY` was unchanged, but the visible region moved because the container itself moved.

### 2.3 Wrong rubber-band coordinates (visual offset)

`doRubberBand` computed `top = y * zoom + panY + container.getBoundingClientRect().top`. Adding `r.top` was wrong: the rubber-band div is a child of `container` (which is `position: relative`), so `top` is already container-relative. The `+ r.top` term double-offset the band by toolbar+panel height (~84px), so the visible rectangle lagged the cursor downward.

`setRubberBand` had the mirror bug: it was called with `e.clientX, e.clientY` (page coords) but stored them as container-relative.

---

## 3. FIX SUMMARY

| File | Change | Purpose |
|---|---|---|
| `js/editor.js` `onCanvasDown` | Set `window._rbR = null` when starting rubber-band; pass container-relative coords to `setRubberBand` | Cause 2.1 + 2.3 |
| `js/editor.js` `endRubberBand` | Set `window._rbR = null` after reading | Defense-in-depth for 2.1 |
| `js/editor.js` `doRubberBand` | Removed `+ r.top` and the now-unused `getBoundingClientRect` call | Cause 2.3 |
| `js/editor.js` `setupEvents` + new `syncFloatingPanelsTop` | Measure toolbar height live and write `top` on the floating panels; re-run on `resize` | Cause 2.2 (works at any toolbar wrap) |
| `css/styles.css` `.editor-wrap` | Added `position: relative` | Anchor for absolutely-positioned panels |
| `css/styles.css` `.format-panel`, `.draw-bar` | `position: absolute; top: 46px; left: 0; right: 0; box-shadow: ...` | Float over canvas instead of pushing it |
| `css/styles.css` `@media (max-width: 640px)` | `flex-wrap: nowrap; overflow-x: auto` for `.format-panel` | Avoid 2-3 row wrap eating mobile canvas |

JS-side `top: 46px` in CSS is the fallback for the brief moment before `syncFloatingPanelsTop` runs; the live measurement immediately overrides it.

### Why two iterations were needed

After iteration 1 (cause 2.1 only), the user manually retested and surfaced the layout-shift and marquee-offset symptoms separately. Iteration 1's fix was correct but incomplete — it stopped the *re-selection* but not the *visible jump*. Iteration 2 addressed the deeper layout cause and the unrelated coordinate bug surfaced by careful manual testing.

### What was deliberately *not* changed

- View-only mode banner — uses a separate code path; no panels float there.
- Pan / marquee policy — already matched the spec.
- `window._dOff`, `window._hiddenOff`, etc. ad-hoc state — see follow-ups.

---

## 4. TEST RESULTS (automated smoke + manual plan)

### 4.1 Automated smoke (Chromium via Claude Preview MCP)

| # | Scenario | Result |
|---|---|---|
| 1 | Show format panel after selecting a node | `canvasShift = 0px`, panel `top = 103px` (matches actual toolbar height in narrow viewport) |
| 2 | Marquee position vs cursor | `leftOffsetErr = 0`, `topOffsetErr = 0` (was ~84px) |
| 3 | After `selectAll()`, click empty canvas | `9 → 0` selected: **PASS** |
| 4 | 2px micro-marquee | 0 selected: **PASS** (5px threshold preserved) |
| 5 | Page load console errors | None |

### 4.2 Manual test plan (for user verification in real browser)

Local server: `python -m http.server 8765` from repo root.
URL: `http://localhost:8765/editor.html?folder=consultancy&map=NAP`

| # | Action | Expected |
|---|---|---|
| 1 | Click a node | Format panel appears over canvas, canvas does **not** jump |
| 2 | Click empty canvas | Format panel disappears, canvas does **not** jump |
| 3 | Drag a marquee | Rectangle follows cursor without vertical offset |
| 4 | Marquee → click empty | Selection clears (the original bug) |
| 5 | Middle-click + drag empty canvas | Pan still works |
| 6 | Hold Space + left-drag | Pan still works |
| 7 | Toggle Draw mode | Draw bar appears over canvas without shift |
| 8 | Resize window narrow→wide | Panels reposition under toolbar at all widths |
| 9 | Right-click empty / right-click node | Context menu still appears |
| 10 | View-only mode (`&mode=view`) | Banner intact, no panel-related shift |

---

## 5. REVIEW NOTES (self)

- Net change: ~10 lines added in CSS, ~12 lines added in JS, 0 deletions of behavior.
- No new globals introduced — `_rbR` already lived on `window`; `syncFloatingPanelsTop` is a top-level function consistent with existing style.
- Live toolbar-height measurement avoids the brittleness of hardcoded `top: 46px`, which the smoke test caught immediately (real height was 103px in narrow viewport).
- The mobile media query hides the wrap-overflow problem in narrow widths but does not solve the "panel covers top of canvas" UX trade-off — accepted by user as standard canvas-editor behavior.

### Follow-ups (not in this PR)

- Move ad-hoc state on `window` (`_rbR`, `_dOff`, `_hiddenOff`, `_rn`, `_rs`) into a single editor-state object. Tracked in CODE_REVIEW.md §1 "Global variables everywhere".
- Pre-existing: `pushUndo()` runs on initial load → map opens flagged as unsaved. Out of scope here.
- Add Playwright e2e covering: marquee + click-deselect, marquee coordinate accuracy, panel layout-shift regression.
- Consider extracting toolbar height into a CSS custom property updated by JS, so other future floating elements can use `top: var(--toolbar-h)` instead of inline styles.
