# Code Review Report — Mind Map Editor

**Date:** 2026-03-28
**Scope:** Full codebase audit — 3 HTML pages, 7 JS files, 1 CSS file, 10 JSON data files
**Total lines of code:** ~2,400 (JS: ~1,700, CSS: ~857, HTML: ~230)

---

## 1. CODE STRUCTURE

**Rating: GOOD**

### File organization
The project has a clean separation of concerns:
- `storage.js` — GitHub API and persistence
- `nodes.js` — Node data model and DOM rendering
- `edges.js` — Edge rendering and SVG operations
- `autolayout.js` — Tree layout algorithm (standalone, no side effects)
- `ui.js` — Format panel, toolbar, context menu
- `editor.js` — Core editor state, canvas, pan/zoom, drag, keyboard
- `home.js` — Projects browser page logic

Each file has a clear header comment describing its responsibility. Dependencies flow in one direction (storage < nodes < edges < ui < editor).

### Concerns

- **editor.js is the largest file (~500 lines)** and handles many responsibilities: canvas interaction, node drag/resize/connect, rubber band selection, keyboard shortcuts, collapse/expand, undo, fit-view, and view-only mode. It would benefit from splitting view-only mode and collapse logic into separate files.

- **Global variables everywhere.** All state lives in top-level `var` declarations across files. `mapData`, `nodeEls`, `selectedNodes`, `selectedEdge`, `zoom`, `panX`, `panY`, etc. are all globals. Any file can read/write any state. This works at the current scale but will become fragile if the project grows.

- **No module system.** Files are loaded via `<script>` tags in dependency order. Functions implicitly call each other across files (e.g., `ui.js` calls `fullRender()` defined in `editor.js`, `editor.js` calls `renderNodeElement()` from `nodes.js`). This circular-ish dependency is manageable now but would break if files were reordered.

---

## 2. BUGS AND RISKS

**Rating: NEEDS IMPROVEMENT**

### 2.1 Race condition in concurrent saves (CRITICAL)

`ghPut()` does a GET-then-PUT pattern to fetch the latest SHA before writing. But there is **no lock or queue** — if the user clicks Save while an auto-save or status change is in-flight, two `ghPut()` calls to `index.json` can race:

1. Call A reads SHA `abc123`
2. Call B reads SHA `abc123` (before A completes)
3. Call A writes with SHA `abc123` → succeeds, SHA becomes `def456`
4. Call B writes with SHA `abc123` → **409 Conflict** from GitHub API

This applies to:
- `saveIndex()` called from `changeStatus()`, `createMap()`, `deleteMap()`, `moveMapToFolder()`
- Two rapid saves from the editor (Save button + autosave)

**Fix:** Add a simple queue/mutex for GitHub writes, or at minimum retry on 409.

### 2.2 `moveMapToFolder()` is not atomic

The move operation does 3 sequential GitHub API calls:
1. Write file to new location
2. Delete file from old location
3. Update index.json

If step 2 or 3 fails, the file exists in both locations (step 2 fail) or the file is moved but index.json still points to old location (step 3 fail). There is no rollback.

### 2.3 Stale closure references in context menu

In `onContextMenu()` (ui.js:120-158), the `node` variable captured in the `ctxMenu.onclick` closure comes from `mapData.nodes.find()` at the time the menu was opened. If undo or another operation replaces `mapData` before the user clicks a menu item, the `node` reference is stale — same class of bug as the collapse button fix.

### 2.4 `deleteFolder()` does not delete map files

`deleteFolder()` in storage.js only removes the folder entry from index.json. It does **not** delete the actual map JSON files on GitHub. They become orphans. The `confirmDeleteFolder()` UI warns about maps being deleted, but the actual file deletion never happens.

### 2.5 Orphan data on disk

The `maps/zarzamin/` folder has 2 map files (`01_WSN.json`, `03_NSIFT_ROSHTKALA.json`) that are not listed in `maps/index.json`. These maps are invisible in the UI. Similarly, `maps/pfd/WaterShed_South.json` exists on disk but is not in the index.

### 2.6 Legacy edge properties in saved data

`maps/consultancy/074_IOM.json` contains edges with `color`, `arrow`, and `thickness` properties from the old edge styling feature. While harmless (the renderer ignores them), they add noise to the data. A migration could clean these up.

### 2.7 Event listeners on `window` are never removed

In `setupEvents()` (editor.js:200-216), listeners for `mousemove`, `mouseup`, `keydown`, `keyup`, `paste`, and `beforeunload` are added to `window` but never removed. Since this is a single-page editor that doesn't dynamically tear down, this is not a leak per se — but it means the editor cannot be cleanly instantiated multiple times.

### 2.8 `setupRootDropZone()` adds duplicate listeners

In home.js:284-304, `setupRootDropZone()` is called on every `render()` when inside a folder. Each call adds new `dragover`, `dragleave`, and `drop` listeners to the same element without removing old ones. After 5 renders, there are 5 duplicate handlers.

---

## 3. PERFORMANCE

**Rating: GOOD**

### 3.1 `renderAllEdges()` rebuilds entire SVG on every drag frame

During node dragging, `doDrag()` calls `renderAllEdges()` on every `mousemove` event. This clears the entire SVG (`svg.innerHTML = ''`) and recreates all path elements. For a map with 20 edges this is fine. For 200+ edges, this would cause jank.

**Optimization:** Only update the paths connected to the moving node(s), or use `requestAnimationFrame` throttling.

### 3.2 Linear node lookups on every operation

Throughout the codebase, `mapData.nodes.find()` is used to look up nodes by ID. This is O(n) per call. In `doDrag()`, this happens for every selected node on every mouse move. Building a `nodeMap = {}` (ID → node object) once and maintaining it would make all lookups O(1).

Similarly, `renderAllEdges()` does a linear scan of `nodes[]` for every edge to find `fromNode` and `toNode`.

### 3.3 `getHiddenNodeIds()` called multiple times per operation

`getHiddenNodeIds()` is called in `fullRender()`, `doDrag()`, and `doResize()`. Each call iterates all nodes and calls `getDescendants()` for collapsed ones. This could be cached and invalidated only when collapse state changes.

### 3.4 `pushUndo()` serializes entire map on every change

`JSON.stringify(mapData)` is called on every drag-end, resize-end, color change, font change, etc. For large maps, this could be slow. The undo stack stores up to 30 full snapshots — for a 200-node map, that could be several MB of JSON strings in memory.

### 3.5 `fullRender()` destroys and recreates all DOM nodes

Every call to `fullRender()` removes all `.mm-node` divs and recreates them from scratch. This works but is wasteful — a diff-based update (only modify changed nodes) would be faster and avoid layout thrashing.

---

## 4. DATA INTEGRITY

**Rating: NEEDS IMPROVEMENT**

### 4.1 SHA-before-save pattern is consistently used ✓

`ghPut()` always calls `ghGet()` first to fetch the latest SHA. This is correct. However, see the race condition issue in section 2.1.

### 4.2 No validation on loaded JSON

`loadMap()` and `loadIndex()` parse JSON without any schema validation. A corrupted or malformed JSON file would crash the editor with an unhelpful error. There are no checks for required fields (`nodes`, `edges`, `nid`).

### 4.3 `nid` counter can produce duplicate IDs

The `nid` counter is used for both node IDs (`n` + nid) and edge IDs (`e` + nid). If `nid` is 5, creating a node produces `n5` and increments to 6, then creating an edge produces `e6`. But if `nid` gets out of sync (e.g., from a corrupted save), duplicate IDs could occur. There's no uniqueness check.

### 4.4 localStorage backup is never restored

`saveToLocal()` writes a backup to localStorage on every autosave, but there is no code to detect or offer to restore from localStorage when the GitHub load fails or returns stale data. The backup is written but never used.

### 4.5 `createMap()` and `createFolder()` don't check for duplicates consistently

`createFolder()` in storage.js doesn't check if a folder with the same name exists (the UI in home.js does, but the storage function doesn't). `createMap()` doesn't check if a map file already exists — it would silently overwrite.

---

## 5. CODE QUALITY

**Rating: GOOD**

### 5.1 Naming

Function and variable names are clear and descriptive: `renderAllEdges`, `getHiddenNodeIds`, `toggleCollapse`, `pushNeighborsAway`, `beginDrag`, `endConnect`. The code reads well.

### 5.2 Magic numbers

Several magic values should be named constants:
- `140` and `40` — default node width/height, used in 8+ places across edges.js, editor.js, autolayout.js
- `1.5` — default edge thickness
- `'#b0a89e'` — default edge color
- `'#c8c0b8'` — default border color
- `30` — undo stack limit
- `5000` / `4000` — canvas dimensions (in CSS and would benefit from JS constants too)
- `0.15` / `3` — zoom min/max
- `14` — collapse badge offset below node

### 5.3 Code style consistency

- storage.js uses ES6 (`const`, `let`, arrow functions, template literals, `async/await`)
- All other JS files use ES5 (`var`, `function(){}`, string concatenation)
- This inconsistency suggests storage.js was written at a different time or by a different approach. It works (all modern browsers support ES6) but is visually jarring.

### 5.4 `window._dOff`, `window._rn`, `window._rs`, `window._rbR`

Temporary drag/resize state is stored on `window` with underscore-prefixed names. This is a workaround for not having a proper state object. It works but pollutes the global namespace and is fragile — any other script could overwrite these.

### 5.5 HTML built as strings

Both home.js and nodes.js build HTML by string concatenation and `innerHTML`. While the `esc()` function provides XSS protection for user text, this pattern is error-prone. Template literals or `document.createElement` would be safer.

### 5.6 Duplicate `esc()` / `escHtml()` functions

- `esc()` in home.js (line 671)
- `escHtml()` in editor.js (line 74)

Both do the same thing (create a div, set textContent, return innerHTML). Should be a shared utility.

### 5.7 Duplicate `showToast()` / `showHomeToast()` functions

- `showToast()` in editor.js (line 461)
- `showHomeToast()` in home.js (line 648)

Nearly identical implementations. Could be a shared function in a common utilities file.

---

## 6. SUGGESTIONS

### What I would rewrite if starting fresh

1. **Use ES modules** (`import`/`export`) to make dependencies explicit and eliminate globals
2. **Single state object** with a centralized update mechanism (like a simple store) rather than scattered global variables
3. **Virtual DOM or incremental updates** instead of `fullRender()` destroying and recreating all nodes
4. **Proper undo system** using command objects (operations + inverse) instead of full-state snapshots
5. **API abstraction** with a write queue to prevent race conditions

### Top 5 most impactful improvements

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| **1** | **Add save queue/mutex** to prevent race conditions on `ghPut()` | Data loss prevention | Low |
| **2** | **Fix `setupRootDropZone()` duplicate listeners** — add listeners once, not on every render | Bug fix, prevents n-fold event firing | Low |
| **3** | **Fix stale `node` reference in context menu** — look up fresh from mapData by ID | Bug fix, prevents stale operations | Low |
| **4** | **Fix `deleteFolder()` to actually delete map files** on GitHub | Data integrity — users expect deletion | Medium |
| **5** | **Add JSON validation on load** — check for required fields, set defaults for missing ones | Crash prevention | Low |

### Honorable mentions (lower priority, higher effort)

- Extract constants for magic numbers (default node size, colors, limits)
- Optimize drag performance: only update affected edge paths, not all
- Build a node ID → object map for O(1) lookups
- Restore from localStorage backup when API load fails
- Clean up orphan map files (zarzamin folder)
- Unify ES5/ES6 style across all files

---

## Summary

| Area | Rating |
|------|--------|
| Code Structure | GOOD |
| Bugs and Risks | NEEDS IMPROVEMENT |
| Performance | GOOD |
| Data Integrity | NEEDS IMPROVEMENT |
| Code Quality | GOOD |

The codebase is well-organized and readable for its size. The most critical issues are the **save race condition** (can cause 409 errors and lost writes) and **several small bugs** (duplicate event listeners, stale closures, incomplete folder deletion). Performance is adequate for the current scale of 5-20 node maps but would need optimization for larger maps. The top 5 fixes are all low-to-medium effort and would significantly improve reliability.
