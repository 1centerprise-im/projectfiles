# Code Review — Arrow Selection & Drag Fix

**Date:** 2026-04-21
**Branch:** `claude/sharp-ritchie-a9a422`
**Scope:** Two-symptom bug in Draw-mode — arrows can't be selected without exiting Draw, and can't be dragged in any mode.

---

## 1. Specification

### Bug report

URL: `editor.html?folder=consultancy&map=074_IOM`

**Symptom 1 — selection in Draw-mode:**
Clicking an existing arrow while Draw is active does nothing. Workaround: toggle Draw off, then click.

**Symptom 2 — drag:**
Even after selecting an arrow (with workaround), dragging on the arrow body does not move it. Drag has no handler at all for annotations.

Frequency: 100%, Zen + Chrome identical.

### Decided behavior (from brainstorm)

- In Draw-mode, click on existing arrow → select it (bar opens). Draw stays active.
- Click in empty canvas in Draw-mode → create new arrow (unchanged).
- Selected arrow is draggable from any point along its body in any mode.

---

## 2. Initial Fix (applied in this session)

Single file: [js/editor.js](js/editor.js). ~43 lines added.

**Changes:**
1. New global `isDraggingAnn`.
2. `onCanvasDown` — new branch **before** drawMode check:
   ```js
   var annHit = e.target.closest && e.target.closest('.ann-hit');
   if (annHit) {
     e.preventDefault();
     selectAnnotationById(annHit.dataset.annId);
     beginAnnotationDrag(e, annHit.dataset.annId);
     return;
   }
   ```
3. Extracted helper `selectAnnotationById(annId)` — shared by mousedown and click paths.
4. New functions `beginAnnotationDrag` / `doAnnotationDrag` / `endAnnotationDrag` — mirror the node-drag pattern. Update `x1/y1/x2/y2` attributes in-place (no `renderAnnotations()` during drag — that would destroy the mousedown target mid-gesture).
5. Removed `if (drawMode) return;` guard in `onAnnotationClick`.
6. `onMove`/`onUp` — new branches for `isDraggingAnn`.
7. Undo only pushed when real movement (delta > 1px) happens — clicks don't pollute the undo stack.

Edit bar is hidden during drag (pinned to old midpoint) and re-shown in `endAnnotationDrag` at the new midpoint.

---

## 3. Iteration 2 — Reported Failure & Diagnosis

**Reported test results (2026-04-21):**
- Scenarios 1, 4, 8 (regression checks): pass.
- Scenario 2 (click arrow in Draw): **fail** — click ignored entirely.
- Scenarios 3 and 5 (drag): **fail** — arrow does not move on drag.

### 3.1 Diagnosis — infrastructure bug, not code bug

The served JavaScript was **not the edited version**.

**Evidence:**

| Check | Local file | Served file (via `curl http://localhost:8765/js/editor.js`) |
|---|---|---|
| Line count | 965 | 901 |
| Presence of `isDraggingAnn` | Yes (line 16) | **No** |
| `.ann-hit` hit-test in `onCanvasDown` | Yes (line 250) | **No** |
| `beginAnnotationDrag` defined | Yes (line 786) | **No** |

The diff (~64 lines) matches the fix exactly — the served file is the **pre-fix** version.

### 3.2 Root cause — two Python processes on port 8765

```
netstat -ano | grep :8765
TCP  0.0.0.0:8765  LISTENING  1376    <- pre-existing process (old working copy)
TCP  0.0.0.0:8765  LISTENING  35088   <- my process (this worktree)
```

On Windows, multiple listeners on the same port are permitted via `SO_REUSEADDR`-like behavior. Connections are routed to the **first** bound socket (PID 1376). PID 1376 was started earlier from a different working copy (probably `main`) that has the pre-fix `editor.js`. The browser was correctly loading `editor.js` — just from the wrong server.

### 3.3 Why each reported symptom is consistent with this diagnosis

- **Scenario 4 passed** (click outside Draw selects arrow): pre-fix code has `onAnnotationClick` without the drawMode guard path blocked — existing selection logic works.
- **Scenario 2 failed** (click in Draw): pre-fix `onAnnotationClick` has `if (drawMode) return;` at line 748 of the old file. Fix removed this guard and added a mousedown-level replacement. Neither exists in served file → click in Draw is silently ignored.
- **Scenarios 3 & 5 failed** (drag): pre-fix code has no drag handlers for annotations at all. `beginAnnotationDrag` is absent.

All three symptoms are explained by "served file is pre-fix," with no need to invoke any actual code bug.

### 3.4 Rule-outs (why it's NOT a code bug)

- **SVG `pointer-events` quirk**: hypothesized that `#ann-svg { pointer-events: none }` blocks child `.ann-hit { pointer-events: stroke }` from becoming mousedown target. Rejected — Scenario 4 (click outside Draw) works in the served file via `annSvg` click listener, which means `.ann-hit` **can** be an event target.
- **`e.target.closest` on SVGElement**: supported in Chrome/Firefox/Zen in all versions user has. Not the cause.
- **CSS cascade in draw-mode**: checked — `.draw-mode` class only changes `cursor` on container and `pointer-events: none` on `.mm-node`. No rule affects `.ann-hit`.

---

## 4. Remediation

1. Kill PID 1376 (old Python server serving stale `editor.js`).
2. Verify only one listener on port 8765 remains (PID 35088).
3. User does hard refresh (Ctrl+Shift+R) to bust browser cache.
4. Re-run manual test protocol (8 scenarios).
5. If any still fails — that's a real code bug, investigate further.

---

## 5. Lessons

- When served content and on-disk content diverge, suspect infrastructure (multiple servers, proxy, browser cache) **before** suspecting runtime logic. A `curl` diff against the local file takes 5 seconds and rules out a whole class of non-bugs.
- Windows `SO_REUSEADDR` behavior differs from Linux. On Linux, the second `bind()` on the same port fails — on Windows, both succeed and routing becomes implementation-defined. Add a `netstat -ano | grep :PORT` sanity check after starting any dev server.
- Consider using a nonstandard port per worktree (e.g., hash of worktree name) to prevent collision with any lingering server from another copy.
