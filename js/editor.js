/* EDITOR.JS - Core: canvas, pan/zoom, drag, resize, connect,
   rubber band, keyboard, undo. UI logic lives in ui.js. */

var mapData = null, folder = '', mapName = '';
var zoom = 1, panX = 0, panY = 0;
var selectedNodes = new Set(), selectedEdge = null;
var nodeEls = {}, undoStack = [];
var isPanning = false, isDragging = false, isResizing = false;
var isConnecting = false, isRubberBand = false;
var connectFrom = null, spaceDown = false;
var hasUnsavedChanges = false;
var _ghAutoSaveTimer = null;
var AUTOSAVE_DELAY = 3 * 60 * 1000; /* 3 minutes */
var isViewOnly = false;
var drawMode = false, isDrawing = false, drawStart = null;
var selectedAnnotation = null;
var drawColor = '#c0392b', drawArrow = true;
var dragStart = {x:0,y:0}, panStart = {x:0,y:0};
var canvas, edgeSvg, annSvg, container, formatPanel, zoomBadge, ctxMenu;

/* Convert mouse event to canvas coordinates */
function toCanvas(e) {
  var r = container.getBoundingClientRect();
  return { x: (e.clientX - r.left - panX) / zoom, y: (e.clientY - r.top - panY) / zoom };
}

document.addEventListener('DOMContentLoaded', initEditor);
async function initEditor() {
  var params = new URLSearchParams(window.location.search);
  folder = params.get('folder') || '';
  mapName = params.get('map') || '';
  isViewOnly = params.get('mode') === 'view';
  canvas = document.getElementById('canvas');
  edgeSvg = document.getElementById('edge-svg');
  annSvg = document.getElementById('ann-svg');
  container = document.getElementById('canvasContainer');
  formatPanel = document.getElementById('formatPanel');
  zoomBadge = document.getElementById('zoomBadge');
  ctxMenu = document.getElementById('ctxMenu');
  /* Load map JSON from server, or create empty for new maps */
  if (params.get('new') !== '1' && folder && mapName) mapData = await loadMap(folder, mapName);
  if (!mapData) mapData = createEmptyMap(mapName ? mapName.replace(/_/g,' ') : 'New Map');
  if (!mapData.annotations) mapData.annotations = [];
  document.getElementById('mapTitle').value = mapData.title || '';

  if (isViewOnly) {
    setupViewOnlyMode();
  } else {
    setupEvents();
  }
  fullRender(); fitView(); updateZoomBadge();
  if (!isViewOnly) pushUndo();
}

/* --- View-only mode: hide toolbar, show banner, only allow pan/zoom --- */
function setupViewOnlyMode() {
  var toolbar = document.querySelector('.toolbar');
  if (toolbar) toolbar.style.display = 'none';
  if (formatPanel) formatPanel.style.display = 'none';

  var banner = document.createElement('div');
  banner.className = 'view-only-banner';
  banner.innerHTML =
    '<span class="view-only-label">VIEW ONLY</span>' +
    '<span class="view-only-title">' + escHtml(mapData.title || 'Untitled') + '</span>' +
    '<a class="view-only-edit-btn" href="' + getEditorUrl() + '">Open in Editor</a>';
  document.querySelector('.editor-wrap').insertBefore(banner, container);
  container.classList.add('view-only');

  container.addEventListener('mousedown', onViewOnlyDown);
  window.addEventListener('mousemove', onViewOnlyMove);
  window.addEventListener('mouseup', onViewOnlyUp);
  container.addEventListener('wheel', onWheel, { passive: false });
}

function getEditorUrl() {
  return 'editor.html?folder=' + encodeURIComponent(folder) + '&map=' + encodeURIComponent(mapName);
}

function escHtml(str) {
  var d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function onViewOnlyDown(e) {
  isPanning = true;
  dragStart = {x: e.clientX, y: e.clientY};
  panStart = {x: panX, y: panY};
  container.classList.add('panning');
}
function onViewOnlyMove(e) {
  if (isPanning) {
    panX = panStart.x + (e.clientX - dragStart.x);
    panY = panStart.y + (e.clientY - dragStart.y);
    applyTransform();
  }
}
function onViewOnlyUp() {
  isPanning = false;
  container.classList.remove('panning');
}

function fullRender() {
  /* Remove old node divs */
  canvas.querySelectorAll('.mm-node').forEach(function(el) { el.remove(); });
  nodeEls = {};

  /* Migrate any collapsedChildren arrays to simple collapsed boolean */
  migrateCollapseData(mapData.nodes, mapData.edges);

  /* Compute which nodes are hidden (all descendants of collapsed nodes) */
  var hiddenIds = getHiddenNodeIds(mapData.nodes, mapData.edges);

  /* Create a DOM element for EACH node */
  mapData.nodes.forEach(function(node) {
    var el = renderNodeElement(node);
    if (hiddenIds[node.id]) el.style.display = 'none';
    canvas.appendChild(el);
    nodeEls[node.id] = el;
    if (!isViewOnly) attachNodeEvents(el, node);
  });

  /* Draw ALL edges (skip hidden nodes) */
  renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeEls, hiddenIds);

  /* Draw annotations */
  renderAnnotations();

  /* Update collapse button on each node + draw badges for collapsed ones */
  mapData.nodes.forEach(function(n) {
    var el = nodeEls[n.id]; if (!el) return;
    var btn = el.querySelector('.node-collapse'); if (!btn) return;
    var ch = getChildren(n.id, mapData.edges);
    if (!ch.length) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    if (n.collapsed) {
      btn.textContent = '+';
      btn.title = 'Expand all children';
      drawCollapseBadge(edgeSvg, n, el, mapData.edges, (function(nodeId) {
        return function() {
          var fresh = mapData.nodes.find(function(nd) { return nd.id === nodeId; });
          if (fresh) toggleCollapse(fresh);
        };
      })(n.id));
    } else {
      btn.textContent = '\u2212';
      btn.title = 'Collapse all children';
    }
  });

}

function attachNodeEvents(el, node) {
  el.addEventListener('mousedown', function(e) {
    if (e.target.closest('.node-connect')) return beginConnect(e, node);
    if (e.target.closest('.node-resize'))  return beginResize(e, node);
    if (e.target.closest('.node-delete'))  { e.stopPropagation(); return deleteNodes(node.id); }
    if (e.target.closest('.node-add-child')) { e.stopPropagation(); return addChild(node); }
    if (e.target.closest('.node-collapse')) {
      e.stopPropagation(); e.preventDefault();
      /* Look up fresh node from mapData to avoid stale closure reference */
      var freshNode = mapData.nodes.find(function(n) { return n.id === node.id; });
      if (freshNode) toggleCollapse(freshNode);
      return;
    }
    if (e.target.closest('.node-link-icon')) return;
    e.stopPropagation();
    /* Deselect edge/annotation when clicking a node */
    if (selectedEdge) { selectedEdge = null; deselectAllEdges(edgeSvg); }
    if (selectedAnnotation) { selectedAnnotation = null; deselectAllAnnotations(); }
    /* Selection logic: Ctrl for multi, else single */
    if (e.ctrlKey || e.metaKey) {
      selectedNodes.has(node.id) ? selectedNodes.delete(node.id) : selectedNodes.add(node.id);
    } else if (!selectedNodes.has(node.id)) {
      selectedNodes.clear(); selectedNodes.add(node.id);
    }
    updateSelectionVisuals(); showFormatPanel();
    beginDrag(e);
  });
  el.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    startEditing(el, node, function() { fullRender(); autoSave(); });
  });
  /* Drag-and-drop URL onto node to set as link */
  el.addEventListener('dragover', function(e) {
    e.preventDefault(); e.stopPropagation();
    el.style.outline = '2px dashed #5b8af0';
  });
  el.addEventListener('dragleave', function(e) {
    el.style.outline = '';
  });
  el.addEventListener('drop', function(e) {
    e.preventDefault(); e.stopPropagation();
    el.style.outline = '';
    var url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
    url = url.trim();
    if (url.startsWith('http')) {
      node.link = url;
      pushUndo(); fullRender(); autoSave();
      showToast('Link added to node');
    }
  });
}

/* --- Setup global event listeners --- */
function setupEvents() {
  container.addEventListener('mousedown', onCanvasDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  container.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', function(e) { if (e.code === 'Space') spaceDown = false; });
  container.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('click', function() { ctxMenu.classList.remove('visible'); });
  window.addEventListener('paste', onPaste);
  window.addEventListener('beforeunload', function(e) {
    if (hasUnsavedChanges) { e.preventDefault(); }
  });
  edgeSvg.addEventListener('click', onEdgeClick);
  annSvg.addEventListener('click', onAnnotationClick);
  setupToolbar();
  setupFormatPanel();
  setupDrawBar();
  /* Toolbar wraps on narrow viewports (real height varies 46-130px). The floating
     panels need to sit just below it, so measure live instead of hardcoding top. */
  syncFloatingPanelsTop();
  window.addEventListener('resize', syncFloatingPanelsTop);
}

function syncFloatingPanelsTop() {
  var toolbar = document.querySelector('.toolbar');
  if (!toolbar) return;
  var top = toolbar.offsetHeight + 'px';
  if (formatPanel) formatPanel.style.top = top;
  var db = document.getElementById('drawBar');
  if (db) db.style.top = top;
}

/* --- Canvas mousedown: pan, rubber band, or draw --- */
function onCanvasDown(e) {
  /* In draw mode, ALWAYS start drawing on left-click (bypass node check)
     so clicks over node areas still work even if pointer-events CSS misbehaves */
  if (drawMode && e.button === 0 && !spaceDown) {
    e.preventDefault();
    isDrawing = true;
    drawStart = toCanvas(e);
    showDrawPreview(drawStart, drawStart);
    return;
  }
  if (e.target.closest('.mm-node')) return;
  /* Deselect edge and annotation on canvas click */
  if (selectedEdge) { selectedEdge = null; deselectAllEdges(edgeSvg); }
  if (selectedAnnotation) { selectedAnnotation = null; deselectAllAnnotations(); }
  if (e.button === 1 || spaceDown) {
    isPanning = true; dragStart = {x:e.clientX,y:e.clientY};
    panStart = {x:panX,y:panY}; container.classList.add('panning');
  } else if (e.button === 0) {
    selectedNodes.clear();
    updateSelectionVisuals(); hideFormatPanel();
    isRubberBand = true; dragStart = toCanvas(e);
    /* Reset stale rect from previous gesture; doRubberBand only fires on mousemove,
       so a click-without-drag would otherwise inherit the prior marquee. */
    window._rbR = null;
    /* setRubberBand expects container-relative coords (the rb div is appended to container) */
    var r = container.getBoundingClientRect();
    setRubberBand(e.clientX - r.left, e.clientY - r.top, 0, 0);
  }
}
function onMove(e) {
  if (isPanning) { panX = panStart.x+(e.clientX-dragStart.x); panY = panStart.y+(e.clientY-dragStart.y); applyTransform(); }
  else if (isDrawing) showDrawPreview(drawStart, toCanvas(e));
  else if (isDragging) doDrag(e);
  else if (isResizing) doResize(e);
  else if (isConnecting) doConnect(e);
  else if (isRubberBand) doRubberBand(e);
}
function onUp(e) {
  if (isPanning) { isPanning = false; container.classList.remove('panning'); }
  if (isDrawing) { finalizeDrawing(e); isDrawing = false; }
  if (isDragging) { isDragging = false; pushUndo(); autoSave(); }
  if (isResizing) { isResizing = false; pushUndo(); autoSave(); }
  if (isConnecting) { endConnect(e); isConnecting = false; }
  if (isRubberBand) { endRubberBand(); isRubberBand = false; }
}

/* --- Zoom with mouse wheel (centers on cursor) --- */
function onWheel(e) {
  e.preventDefault();
  var r = container.getBoundingClientRect();
  var mx = e.clientX - r.left, my = e.clientY - r.top, old = zoom;
  zoom = Math.min(3, Math.max(0.15, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
  panX = mx - (mx - panX) * (zoom / old);
  panY = my - (my - panY) * (zoom / old);
  applyTransform(); updateZoomBadge();
}
function applyTransform() {
  canvas.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
}
function updateZoomBadge() { zoomBadge.textContent = Math.round(zoom * 100) + '%'; }

/* --- Node dragging --- */
function beginDrag(e) {
  isDragging = true; dragStart = toCanvas(e); window._dOff = {};
  window._hiddenOff = {};
  var hiddenIds = getHiddenNodeIds(mapData.nodes, mapData.edges);
  selectedNodes.forEach(function(id) {
    var n = mapData.nodes.find(function(n) { return n.id === id; });
    if (n) window._dOff[id] = {x:n.x, y:n.y};
    getDescendants(id, mapData.edges).forEach(function(did) {
      if (hiddenIds[did]) {
        var dn = mapData.nodes.find(function(nd) { return nd.id === did; });
        if (dn && !window._hiddenOff[did]) window._hiddenOff[did] = {x:dn.x, y:dn.y};
      }
    });
  });
}
function doDrag(e) {
  var c = toCanvas(e), dx = c.x - dragStart.x, dy = c.y - dragStart.y;
  selectedNodes.forEach(function(id) {
    var n = mapData.nodes.find(function(nd) { return nd.id === id; });
    var o = window._dOff[id];
    if (n && o) { n.x = o.x+dx; n.y = o.y+dy; var el = nodeEls[id]; if (el) { el.style.left=n.x+'px'; el.style.top=n.y+'px'; } }
  });
  for (var hid in window._hiddenOff) {
    var hn = mapData.nodes.find(function(nd) { return nd.id === hid; });
    var ho = window._hiddenOff[hid];
    if (hn && ho) { hn.x = ho.x + dx; hn.y = ho.y + dy; }
  }
  var hiddenIds = getHiddenNodeIds(mapData.nodes, mapData.edges);
  renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeEls, hiddenIds);
}

/* --- Node resizing --- */
function beginResize(e, node) {
  e.stopPropagation(); isResizing = true; window._rn = node;
  var el = nodeEls[node.id];
  window._rs = {x:e.clientX, y:e.clientY, w:el.offsetWidth, h:el.offsetHeight};
}
function doResize(e) {
  var n = window._rn, s = window._rs; if (!n) return;
  n.w = Math.max(60, s.w+(e.clientX-s.x)/zoom);
  n.h = Math.max(30, s.h+(e.clientY-s.y)/zoom);
  updateNodeElement(nodeEls[n.id], n);
  var hiddenIds = getHiddenNodeIds(mapData.nodes, mapData.edges);
  renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeEls, hiddenIds);
}

/* --- Connection dragging --- */
function beginConnect(e, node) { e.stopPropagation(); isConnecting = true; connectFrom = node.id; }
function doConnect(e) {
  var el = nodeEls[connectFrom]; if (!el) return;
  var fn = mapData.nodes.find(function(n) { return n.id === connectFrom; });
  drawTempLine(edgeSvg, getNodeCenter(fn, el), toCanvas(e));
}
function endConnect(e) {
  removeTempLine(edgeSvg);
  var t = document.elementFromPoint(e.clientX, e.clientY);
  var ne = t ? t.closest('.mm-node') : null;
  if (ne && ne.dataset.id !== connectFrom && !edgeExists(mapData.edges, connectFrom, ne.dataset.id)) {
    mapData.edges.push(createEdgeData('e' + (mapData.nid++), connectFrom, ne.dataset.id));
    fullRender(); pushUndo(); autoSave();
  }
  connectFrom = null;
}

/* --- Rubber band selection --- */
function setRubberBand(x,y,w,h) {
  var rb = document.getElementById('rubberBand');
  if (!rb) { rb = document.createElement('div'); rb.id = 'rubberBand'; rb.className = 'rubber-band'; container.appendChild(rb); }
  rb.style.cssText = 'display:block;left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px;';
}
function doRubberBand(e) {
  var c = toCanvas(e);
  var x = Math.min(dragStart.x,c.x), y = Math.min(dragStart.y,c.y);
  var w = Math.abs(c.x-dragStart.x), h = Math.abs(c.y-dragStart.y);
  var rb = document.getElementById('rubberBand');
  /* rb is a child of container (position:relative); top/left are container-relative.
     Previous code added container.getBoundingClientRect().top here, which double-offset
     the band by the toolbar+panel height. */
  if (rb) rb.style.cssText = 'display:block;left:'+(x*zoom+panX)+'px;top:'+(y*zoom+panY)+'px;width:'+(w*zoom)+'px;height:'+(h*zoom)+'px;';
  window._rbR = {x:x,y:y,w:w,h:h};
}
function endRubberBand() {
  var rb = document.getElementById('rubberBand'); if (rb) rb.style.display = 'none';
  var r = window._rbR;
  window._rbR = null;
  if (!r || (r.w < 5 && r.h < 5)) return;
  mapData.nodes.forEach(function(n) {
    var el = nodeEls[n.id]; if (!el || el.style.display === 'none') return;
    if (n.x+el.offsetWidth>r.x && n.x<r.x+r.w && n.y+el.offsetHeight>r.y && n.y<r.y+r.h) selectedNodes.add(n.id);
  });
  updateSelectionVisuals(); showFormatPanel();
}

/* --- Edge click handler (delegated from SVG) --- */
function onEdgeClick(e) {
  var hit = e.target.closest('.edge-hit');
  if (!hit) return;
  e.stopPropagation();
  selectedNodes.clear(); updateSelectionVisuals(); hideFormatPanel();
  if (selectedAnnotation) { selectedAnnotation = null; deselectAllAnnotations(); }
  selectedEdge = hit.dataset.edgeId;
  selectEdge(edgeSvg, selectedEdge);
}

/* --- Keyboard shortcuts --- */
function onKeyDown(e) {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { spaceDown = true; e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
  if (e.ctrlKey && e.key === 'z') { undo(); e.preventDefault(); }
  if (e.ctrlKey && e.key === 'a') { selectAll(); e.preventDefault(); }
  if (e.key === 'Escape') {
    selectedNodes.clear();
    if (selectedEdge) { selectedEdge = null; deselectAllEdges(edgeSvg); }
    if (selectedAnnotation) { selectedAnnotation = null; deselectAllAnnotations(); }
    if (drawMode) toggleDrawMode();
    updateSelectionVisuals(); hideFormatPanel();
  }
}

/* --- Node operations --- */
function deleteSelection() {
  if (selectedAnnotation) {
    mapData.annotations = mapData.annotations.filter(function(a) { return a.id !== selectedAnnotation; });
    selectedAnnotation = null;
    fullRender(); pushUndo(); autoSave();
    showToast('Drawing removed');
    return;
  }
  if (selectedEdge) {
    mapData.edges = deleteEdgeById(mapData.edges, selectedEdge);
    selectedEdge = null;
    fullRender(); pushUndo(); autoSave();
    showToast('Connection removed');
    return;
  }
  if (selectedNodes.size) deleteNodes();
  fullRender(); pushUndo(); autoSave();
}
function deleteNodes(singleId) {
  (singleId ? [singleId] : Array.from(selectedNodes)).forEach(function(id) {
    mapData.nodes = mapData.nodes.filter(function(n) { return n.id !== id; });
    mapData.edges = deleteEdgesForNode(mapData.edges, id);
  });
  selectedNodes.clear(); fullRender(); pushUndo(); autoSave();
}
function selectAll() { mapData.nodes.forEach(function(n) { selectedNodes.add(n.id); }); updateSelectionVisuals(); showFormatPanel(); }
function addNodeAtCenter() {
  var r = container.getBoundingClientRect(), id = 'n' + (mapData.nid++);
  mapData.nodes.push(createNodeData(id, (r.width/2-panX)/zoom, (r.height/2-panY)/zoom, 'New Node', 0));
  fullRender(); pushUndo(); autoSave();
}
function addChild(parent, isNote) {
  var id = 'n' + (mapData.nid++), eid = 'e' + (mapData.nid++);
  var pw = nodeEls[parent.id] ? nodeEls[parent.id].offsetWidth : 140;
  mapData.nodes.push(createNodeData(id, parent.x+pw+60, parent.y, isNote?'Note':'New Node', parent.ci, {isNote:!!isNote}));
  mapData.edges.push(createEdgeData(eid, parent.id, id));
  fullRender(); pushUndo(); autoSave();
}
/* Toggle collapse: hide/show ALL children at once */
function toggleCollapse(node) {
  node.collapsed = !node.collapsed;
  if (!node.collapsed) pushNeighborsAway(node);
  fullRender(); pushUndo(); autoSave();
}

/* Push-layout: when expanding, move overlapping nodes away */
function pushNeighborsAway(expandedNode) {
  var descendants = getDescendants(expandedNode.id, mapData.edges);
  if (!descendants.length) return;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  descendants.forEach(function(id) {
    var n = mapData.nodes.find(function(nd) { return nd.id === id; });
    if (!n) return;
    var w = n.w > 0 ? n.w : 140, h = n.h > 0 ? n.h : 40;
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + w > maxX) maxX = n.x + w;
    if (n.y + h > maxY) maxY = n.y + h;
  });
  var PAD = 30;
  var subtreeSet = new Set(descendants);
  subtreeSet.add(expandedNode.id);
  mapData.nodes.forEach(function(n) {
    if (subtreeSet.has(n.id)) return;
    var nw = n.w > 0 ? n.w : 140, nh = n.h > 0 ? n.h : 40;
    var overlapsX = n.x + nw > minX - PAD && n.x < maxX + PAD;
    var overlapsY = n.y + nh > minY - PAD && n.y < maxY + PAD;
    if (overlapsX && overlapsY) {
      if (n.y > expandedNode.y) {
        n.y = maxY + PAD;
      } else if (n.x > expandedNode.x) {
        n.x = maxX + PAD;
      }
    }
  });
}
async function doSave(isAuto) {
  if (!folder || !mapName) { if (!isAuto) showToast('No map loaded', true); return; }
  cancelGhAutoSave();
  try {
    updateSaveDot('saving');
    if (!isAuto) showToast('Saving...', false);
    await saveMap(folder, mapName, mapData);
    hasUnsavedChanges = false;
    updateSaveDot('saved');
    showToast(isAuto ? 'Auto-saved' : 'Saved to GitHub');
    setTimeout(function() { if (!hasUnsavedChanges) updateSaveDot(''); }, 2000);
  } catch (err) {
    updateSaveDot('unsaved');
    showToast(isAuto ? 'Auto-save failed - save manually' : 'Save failed: ' + err.message, true);
  }
}

function showToast(msg, isError) {
  var old = document.getElementById('toast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.id = 'toast';
  t.className = 'toast' + (isError ? ' toast-error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('visible'); }, 10);
  if (msg !== 'Saving...') setTimeout(function() { t.classList.remove('visible'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

function autoSave() { if (folder && mapName) saveToLocal(folder, mapName, mapData); }

/* --- GitHub autosave: 3 minutes after last change --- */
function scheduleGhAutoSave() {
  cancelGhAutoSave();
  if (!folder || !mapName) return;
  _ghAutoSaveTimer = setTimeout(function() {
    if (hasUnsavedChanges && localStorage.getItem('gh_token')) {
      doSave(true);
    }
  }, AUTOSAVE_DELAY);
}
function cancelGhAutoSave() {
  if (_ghAutoSaveTimer) { clearTimeout(_ghAutoSaveTimer); _ghAutoSaveTimer = null; }
}

/* --- Save dot indicator next to Save button --- */
function updateSaveDot(state) {
  var dot = document.getElementById('saveDot');
  if (!dot) return;
  dot.className = 'save-dot';
  if (state === 'unsaved') dot.classList.add('unsaved');
  else if (state === 'saving') dot.classList.add('saving');
  else if (state === 'saved') dot.classList.add('saved');
}

/* --- Fit view: zoom and pan to show all nodes centered --- */
function fitView() {
  if (!mapData.nodes.length) return;
  var PAD = 60;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  mapData.nodes.forEach(function(n) {
    var el = nodeEls[n.id];
    var w = (el && el.offsetWidth) ? el.offsetWidth : 140;
    var h = (el && el.offsetHeight) ? el.offsetHeight : 40;
    if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
    if (n.x + w > maxX) maxX = n.x + w; if (n.y + h > maxY) maxY = n.y + h;
  });
  var bw = maxX - minX + PAD*2, bh = maxY - minY + PAD*2;
  var rect = container.getBoundingClientRect();
  zoom = Math.min(rect.width / bw, rect.height / bh, 1.0);
  zoom = Math.max(0.2, zoom);
  panX = (rect.width / 2) - ((minX + maxX) / 2) * zoom;
  panY = (rect.height / 2) - ((minY + maxY) / 2) * zoom;
  applyTransform();
}

/* --- Undo (snapshot-based) --- */
function pushUndo() {
  undoStack.push(JSON.stringify(mapData));
  if (undoStack.length > 30) undoStack.shift();
  hasUnsavedChanges = true;
  updateSaveDot('unsaved');
  scheduleGhAutoSave();
}
function undo() {
  if (undoStack.length < 2) return;
  undoStack.pop(); mapData = JSON.parse(undoStack[undoStack.length - 1]);
  if (!mapData.annotations) mapData.annotations = [];
  selectedNodes.clear(); selectedEdge = null; selectedAnnotation = null; fullRender(); hideFormatPanel();
}

/* ============================================================
   DRAW TOOL - straight lines and arrows on annotation layer
   ============================================================ */

/* --- Toggle draw mode on/off --- */
function toggleDrawMode() {
  drawMode = !drawMode;
  var btn = document.getElementById('btnDraw');
  var bar = document.getElementById('drawBar');
  if (drawMode) {
    btn.classList.add('draw-active');
    bar.classList.add('visible');
    container.classList.add('draw-mode');
    /* Deselect everything */
    selectedNodes.clear(); updateSelectionVisuals(); hideFormatPanel();
    if (selectedEdge) { selectedEdge = null; deselectAllEdges(edgeSvg); }
  } else {
    btn.classList.remove('draw-active');
    bar.classList.remove('visible');
    container.classList.remove('draw-mode');
  }
}

/* --- Wire draw bar controls --- */
function setupDrawBar() {
  document.getElementById('btnDraw').addEventListener('click', toggleDrawMode);
  document.querySelectorAll('.draw-color').forEach(function(sw) {
    sw.addEventListener('click', function() {
      document.querySelectorAll('.draw-color').forEach(function(s) { s.classList.remove('active'); });
      sw.classList.add('active');
      drawColor = sw.dataset.color;
    });
  });
  document.getElementById('btnDrawArrow').addEventListener('click', function() {
    drawArrow = !drawArrow;
    this.classList.toggle('active', drawArrow);
  });
}

/* --- Preview line while dragging --- */
function showDrawPreview(from, to) {
  var prev = annSvg.querySelector('.draw-preview');
  if (!prev) {
    prev = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    prev.setAttribute('class', 'draw-preview');
    prev.setAttribute('stroke-width', '2');
    prev.setAttribute('stroke-linecap', 'round');
    prev.setAttribute('stroke-dasharray', '6,4');
    prev.style.pointerEvents = 'none';
    annSvg.appendChild(prev);
  }
  prev.setAttribute('x1', from.x);
  prev.setAttribute('y1', from.y);
  prev.setAttribute('x2', to.x);
  prev.setAttribute('y2', to.y);
  prev.setAttribute('stroke', drawColor);
}

/* --- Finalize drawing on mouse up --- */
function finalizeDrawing(e) {
  var prev = annSvg.querySelector('.draw-preview');
  if (prev) prev.remove();
  if (!drawStart) return;
  var end = toCanvas(e);
  /* Only create if line is longer than 5px */
  var dx = end.x - drawStart.x, dy = end.y - drawStart.y;
  if (Math.sqrt(dx * dx + dy * dy) < 5) { drawStart = null; return; }
  if (!mapData.annotations) mapData.annotations = [];
  var ann = {
    id: 'a' + (mapData.nid++),
    x1: drawStart.x, y1: drawStart.y,
    x2: end.x, y2: end.y,
    color: drawColor,
    hasArrow: drawArrow,
    thickness: 2
  };
  mapData.annotations.push(ann);
  drawStart = null;
  renderAnnotations();
  pushUndo(); autoSave();
}

/* --- Render all annotations into #ann-svg --- */
function renderAnnotations() {
  if (!annSvg) return;
  annSvg.innerHTML = '';
  if (!mapData.annotations || !mapData.annotations.length) return;

  mapData.annotations.forEach(function(ann) {
    var thick = ann.thickness || 2;
    var color = ann.color || '#c0392b';

    /* Visible line */
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', ann.x1);
    line.setAttribute('y1', ann.y1);
    line.setAttribute('x2', ann.x2);
    line.setAttribute('y2', ann.y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', thick);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('class', 'ann-line');
    line.dataset.annId = ann.id;

    /* Arrow marker */
    if (ann.hasArrow) {
      var markerId = ensureAnnArrowMarker(color);
      line.setAttribute('marker-end', 'url(#' + markerId + ')');
    }

    annSvg.appendChild(line);

    /* Wide invisible hit area (20px for easy clicking) */
    var hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hit.setAttribute('x1', ann.x1);
    hit.setAttribute('y1', ann.y1);
    hit.setAttribute('x2', ann.x2);
    hit.setAttribute('y2', ann.y2);
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '20');
    hit.setAttribute('class', 'ann-hit');
    hit.style.pointerEvents = 'stroke';
    hit.style.cursor = 'pointer';
    hit.dataset.annId = ann.id;
    annSvg.appendChild(hit);
  });
}

/* --- SVG arrow marker for annotations (per color) --- */
function ensureAnnArrowMarker(color) {
  var id = 'ann-arrow-' + color.replace(/[^a-zA-Z0-9]/g, '');
  if (annSvg.querySelector('#' + id)) return id;
  var defs = annSvg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    annSvg.insertBefore(defs, annSvg.firstChild);
  }
  var marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox', '0 0 8 6');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M 0 0 L 8 3 L 0 6 Z');
  path.setAttribute('fill', color);
  marker.appendChild(path);
  defs.appendChild(marker);
  return id;
}

/* --- Annotation click handler (delegated from #ann-svg) --- */
function onAnnotationClick(e) {
  var hit = e.target.closest('.ann-hit');
  if (!hit) return;
  if (drawMode) return; /* Don't select while drawing */
  e.stopPropagation();
  selectedNodes.clear(); updateSelectionVisuals(); hideFormatPanel();
  if (selectedEdge) { selectedEdge = null; deselectAllEdges(edgeSvg); }
  selectedAnnotation = hit.dataset.annId;
  /* Highlight selected annotation */
  deselectAllAnnotations();
  var line = annSvg.querySelector('.ann-line[data-ann-id="' + selectedAnnotation + '"]');
  if (line) line.classList.add('selected');
  showAnnEditBar();
}

/* --- Deselect all annotations --- */
function deselectAllAnnotations() {
  annSvg.querySelectorAll('.ann-line.selected').forEach(function(l) { l.classList.remove('selected'); });
  hideAnnEditBar();
}

/* ============================================================
   ANNOTATION EDIT BAR - floating controls for selected annotation
   ============================================================ */

var ANN_COLORS = ['#c0392b','#2980b9','#27ae60','#e07b3a','#2c2c2a','#9a9088'];
var ANN_THICKNESSES = [{label:'S',val:1.5},{label:'M',val:3},{label:'L',val:5}];

function showAnnEditBar() {
  hideAnnEditBar();
  if (!selectedAnnotation) return;
  var ann = mapData.annotations.find(function(a) { return a.id === selectedAnnotation; });
  if (!ann) return;

  /* Position at midpoint of line, converted to screen coords */
  var mx = (ann.x1 + ann.x2) / 2;
  var my = Math.min(ann.y1, ann.y2) - 20; /* above the line */
  var screenX = mx * zoom + panX;
  var screenY = my * zoom + panY;
  var containerRect = container.getBoundingClientRect();
  screenX += containerRect.left;
  screenY += containerRect.top;

  var bar = document.createElement('div');
  bar.id = 'annEditBar';
  bar.className = 'ann-edit-bar';

  /* Color circles */
  ANN_COLORS.forEach(function(c) {
    var sw = document.createElement('div');
    sw.className = 'draw-color' + (c === (ann.color || '#c0392b') ? ' active' : '');
    sw.style.background = c;
    sw.dataset.color = c;
    sw.addEventListener('click', function(e) {
      e.stopPropagation();
      ann.color = c;
      bar.querySelectorAll('.draw-color').forEach(function(s) { s.classList.remove('active'); });
      sw.classList.add('active');
      renderAnnotations();
      /* Re-highlight */
      var line = annSvg.querySelector('.ann-line[data-ann-id="' + selectedAnnotation + '"]');
      if (line) line.classList.add('selected');
      pushUndo(); autoSave();
    });
    bar.appendChild(sw);
  });

  /* Separator */
  var sep1 = document.createElement('div');
  sep1.className = 'ann-sep';
  bar.appendChild(sep1);

  /* Arrow toggle */
  var arrowBtn = document.createElement('button');
  arrowBtn.className = 'draw-arrow-toggle' + (ann.hasArrow ? ' active' : '');
  arrowBtn.innerHTML = '&#8594;';
  arrowBtn.title = 'Toggle arrow';
  arrowBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    ann.hasArrow = !ann.hasArrow;
    arrowBtn.classList.toggle('active', ann.hasArrow);
    renderAnnotations();
    var line = annSvg.querySelector('.ann-line[data-ann-id="' + selectedAnnotation + '"]');
    if (line) line.classList.add('selected');
    pushUndo(); autoSave();
  });
  bar.appendChild(arrowBtn);

  /* Separator */
  var sep2 = document.createElement('div');
  sep2.className = 'ann-sep';
  bar.appendChild(sep2);

  /* Thickness buttons S M L */
  var curThick = ann.thickness || 2;
  ANN_THICKNESSES.forEach(function(t) {
    var btn = document.createElement('button');
    btn.className = 'ann-thickness' + (curThick === t.val ? ' active' : '');
    btn.textContent = t.label;
    btn.title = t.val + 'px';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      ann.thickness = t.val;
      bar.querySelectorAll('.ann-thickness').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderAnnotations();
      var line = annSvg.querySelector('.ann-line[data-ann-id="' + selectedAnnotation + '"]');
      if (line) line.classList.add('selected');
      pushUndo(); autoSave();
    });
    bar.appendChild(btn);
  });

  /* Separator */
  var sep3 = document.createElement('div');
  sep3.className = 'ann-sep';
  bar.appendChild(sep3);

  /* Delete button */
  var delBtn = document.createElement('button');
  delBtn.className = 'ann-delete';
  delBtn.innerHTML = '&times;';
  delBtn.title = 'Delete';
  delBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    mapData.annotations = mapData.annotations.filter(function(a) { return a.id !== selectedAnnotation; });
    selectedAnnotation = null;
    hideAnnEditBar();
    fullRender(); pushUndo(); autoSave();
    showToast('Drawing removed');
  });
  bar.appendChild(delBtn);

  /* Position */
  bar.style.left = screenX + 'px';
  bar.style.top = screenY + 'px';
  bar.style.transform = 'translate(-50%, -100%)';
  document.body.appendChild(bar);

  /* Adjust if off-screen */
  requestAnimationFrame(function() {
    var rect = bar.getBoundingClientRect();
    if (rect.left < 4) bar.style.left = (4 + rect.width / 2) + 'px';
    if (rect.right > window.innerWidth - 4) bar.style.left = (window.innerWidth - 4 - rect.width / 2) + 'px';
    if (rect.top < containerRect.top) {
      /* Place below the line instead */
      var belowY = Math.max(ann.y1, ann.y2) * zoom + panY + containerRect.top + 20;
      bar.style.top = belowY + 'px';
      bar.style.transform = 'translate(-50%, 0)';
    }
  });
}

function hideAnnEditBar() {
  var old = document.getElementById('annEditBar');
  if (old) old.remove();
}
