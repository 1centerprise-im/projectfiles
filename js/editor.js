/* EDITOR.JS - Core: canvas, pan/zoom, drag, resize, connect,
   rubber band, keyboard, undo. UI logic lives in ui.js. */

var mapData = null, folder = '', mapName = '';
var zoom = 1, panX = 0, panY = 0;
var selectedNodes = new Set(), selectedEdge = null;
var nodeEls = {}, undoStack = [];
var isPanning = false, isDragging = false, isResizing = false;
var isConnecting = false, isRubberBand = false;
var connectFrom = null, spaceDown = false;
var dragStart = {x:0,y:0}, panStart = {x:0,y:0};
var canvas, edgeSvg, container, formatPanel, zoomBadge, ctxMenu;

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
  canvas = document.getElementById('canvas');
  edgeSvg = document.getElementById('edge-svg');
  container = document.getElementById('canvasContainer');
  formatPanel = document.getElementById('formatPanel');
  zoomBadge = document.getElementById('zoomBadge');
  ctxMenu = document.getElementById('ctxMenu');
  /* Load map JSON from server, or create empty for new maps */
  if (params.get('new') !== '1' && folder && mapName) mapData = await fetchMap(folder, mapName);
  if (!mapData) mapData = createEmptyMap(mapName ? mapName.replace(/_/g,' ') : 'New Map');
  document.getElementById('mapTitle').value = mapData.title || '';
  console.log('[editor] Loaded:', mapData.title, mapData.nodes.length, 'nodes');
  fullRender(); setupEvents(); fitView(); updateZoomBadge(); pushUndo();
}

function fullRender() {
  /* Remove old node divs */
  canvas.querySelectorAll('.mm-node').forEach(function(el) { el.remove(); });
  nodeEls = {};
  /* Find nodes hidden by collapsed ancestors */
  var hiddenIds = {};
  mapData.nodes.forEach(function(n) {
    if (n.collapsed) {
      getDescendants(n.id, mapData.edges).forEach(function(id) { hiddenIds[id] = true; });
    }
  });
  /* Create a DOM element for EACH node in the data */
  mapData.nodes.forEach(function(node) {
    var el = renderNodeElement(node);
    if (hiddenIds[node.id]) el.style.display = 'none';
    canvas.appendChild(el);
    nodeEls[node.id] = el;
    attachNodeEvents(el, node);
  });
  /* Draw ALL edges as SVG paths */
  renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeEls,
    mapData.edgeThickness, mapData.edgeColor);
  /* Update collapse toggle labels */
  mapData.nodes.forEach(function(n) {
    var el = nodeEls[n.id]; if (!el) return;
    var btn = el.querySelector('.node-collapse'); if (!btn) return;
    var ch = getChildren(n.id, mapData.edges);
    if (!ch.length) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    btn.textContent = n.collapsed ? ch.length : '\u2212';
  });
  console.log('[editor] Rendered', Object.keys(nodeEls).length, 'nodes');
}

function attachNodeEvents(el, node) {
  el.addEventListener('mousedown', function(e) {
    if (e.target.closest('.node-connect')) return beginConnect(e, node);
    if (e.target.closest('.node-resize'))  return beginResize(e, node);
    if (e.target.closest('.node-delete'))  return deleteNodes(node.id);
    if (e.target.closest('.node-add-child')) return addChild(node);
    if (e.target.closest('.node-collapse')) return toggleCollapse(node);
    if (e.target.closest('.node-link-icon')) return;
    e.stopPropagation();
    /* Selection logic: Ctrl for multi, else single */
    if (e.ctrlKey || e.metaKey) {
      selectedNodes.has(node.id) ? selectedNodes.delete(node.id) : selectedNodes.add(node.id);
    } else if (!selectedNodes.has(node.id)) {
      selectedNodes.clear(); selectedNodes.add(node.id);
    }
    selectedEdge = null; deselectAllEdges(edgeSvg);
    updateSelectionVisuals(); showFormatPanel();
    beginDrag(e);
  });
  el.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    startEditing(el, node, function() { fullRender(); autoSave(); });
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
  edgeSvg.addEventListener('click', onEdgeClick);
  container.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('click', function() { ctxMenu.classList.remove('visible'); });
  window.addEventListener('paste', onPaste);
  setupToolbar();
  setupFormatPanel();
}

/* --- Canvas mousedown: pan or rubber band --- */
function onCanvasDown(e) {
  if (e.target.closest('.mm-node') || e.target.closest('.edge-hit')) return;
  if (e.button === 1 || spaceDown) {
    isPanning = true; dragStart = {x:e.clientX,y:e.clientY};
    panStart = {x:panX,y:panY}; container.classList.add('panning');
  } else if (e.button === 0) {
    selectedNodes.clear(); selectedEdge = null;
    deselectAllEdges(edgeSvg); updateSelectionVisuals(); hideFormatPanel();
    isRubberBand = true; dragStart = toCanvas(e);
    setRubberBand(e.clientX, e.clientY, 0, 0);
  }
}
function onMove(e) {
  if (isPanning) { panX = panStart.x+(e.clientX-dragStart.x); panY = panStart.y+(e.clientY-dragStart.y); applyTransform(); }
  else if (isDragging) doDrag(e);
  else if (isResizing) doResize(e);
  else if (isConnecting) doConnect(e);
  else if (isRubberBand) doRubberBand(e);
}
function onUp(e) {
  if (isPanning) { isPanning = false; container.classList.remove('panning'); }
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
  selectedNodes.forEach(function(id) {
    var n = mapData.nodes.find(function(n) { return n.id === id; });
    if (n) window._dOff[id] = {x:n.x, y:n.y};
  });
}
function doDrag(e) {
  var c = toCanvas(e), dx = c.x - dragStart.x, dy = c.y - dragStart.y;
  selectedNodes.forEach(function(id) {
    var n = mapData.nodes.find(function(nd) { return nd.id === id; });
    var o = window._dOff[id];
    if (n && o) { n.x = o.x+dx; n.y = o.y+dy; var el = nodeEls[id]; if (el) { el.style.left=n.x+'px'; el.style.top=n.y+'px'; } }
  });
  renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeEls, mapData.edgeThickness, mapData.edgeColor);
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
  renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeEls, mapData.edgeThickness, mapData.edgeColor);
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
  var c = toCanvas(e), r = container.getBoundingClientRect();
  var x = Math.min(dragStart.x,c.x), y = Math.min(dragStart.y,c.y);
  var w = Math.abs(c.x-dragStart.x), h = Math.abs(c.y-dragStart.y);
  var rb = document.getElementById('rubberBand');
  if (rb) rb.style.cssText = 'display:block;left:'+(x*zoom+panX)+'px;top:'+(y*zoom+panY+r.top)+'px;width:'+(w*zoom)+'px;height:'+(h*zoom)+'px;';
  window._rbR = {x:x,y:y,w:w,h:h};
}
function endRubberBand() {
  var rb = document.getElementById('rubberBand'); if (rb) rb.style.display = 'none';
  var r = window._rbR; if (!r || (r.w < 5 && r.h < 5)) return;
  mapData.nodes.forEach(function(n) {
    var el = nodeEls[n.id]; if (!el || el.style.display === 'none') return;
    if (n.x+el.offsetWidth>r.x && n.x<r.x+r.w && n.y+el.offsetHeight>r.y && n.y<r.y+r.h) selectedNodes.add(n.id);
  });
  updateSelectionVisuals(); showFormatPanel();
}

/* --- Keyboard shortcuts --- */
function onKeyDown(e) {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { spaceDown = true; e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
  if (e.ctrlKey && e.key === 'z') { undo(); e.preventDefault(); }
  if (e.ctrlKey && e.key === 'a') { selectAll(); e.preventDefault(); }
  if (e.key === 'Escape') { selectedNodes.clear(); selectedEdge = null; deselectAllEdges(edgeSvg); updateSelectionVisuals(); hideFormatPanel(); }
}

/* --- Node/edge operations --- */
function deleteSelection() {
  if (selectedEdge) { mapData.edges = deleteEdgeById(mapData.edges, selectedEdge); selectedEdge = null; }
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
function toggleCollapse(node) { node.collapsed = !node.collapsed; fullRender(); autoSave(); }
function doAutoLayout() { pushUndo(); autoLayout(mapData.nodes, mapData.edges); fullRender(); autoSave(); }
function doSave() { downloadMap(mapData, mapName || 'mindmap'); }
function autoSave() { if (folder && mapName) saveToLocal(folder, mapName, mapData); }

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
  zoom = Math.min(rect.width / bw, rect.height / bh, 1.5);
  zoom = Math.max(0.2, Math.min(2, zoom));
  /* Center the bounding box in the viewport */
  panX = (rect.width / 2) - ((minX + maxX) / 2) * zoom;
  panY = (rect.height / 2) - ((minY + maxY) / 2) * zoom;
  applyTransform();
}

/* --- Undo (snapshot-based) --- */
function pushUndo() { undoStack.push(JSON.stringify(mapData)); if (undoStack.length > 30) undoStack.shift(); }
function undo() {
  if (undoStack.length < 2) return;
  undoStack.pop(); mapData = JSON.parse(undoStack[undoStack.length - 1]);
  selectedNodes.clear(); selectedEdge = null; fullRender(); hideFormatPanel();
}
