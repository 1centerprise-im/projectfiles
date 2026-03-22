/* ============================================================
   EDITOR.JS - Core editor: canvas pan/zoom, node interaction,
   drag, resize, connect, rubber band, keyboard, undo.
   UI logic (format panel, context menu, toolbar) is in ui.js.
   ============================================================ */

/* --- Global editor state --- */
let mapData = null, folder = '', mapName = '';
let zoom = 1, panX = 0, panY = 0;
let selectedNodes = new Set(), selectedEdge = null;
let nodeElements = {}, undoStack = [];
let isPanning = false, isDragging = false, isResizing = false;
let isConnecting = false, isRubberBand = false;
let connectFrom = null, spaceDown = false;
let dragStart = {x:0,y:0}, panStart = {x:0,y:0};
/* DOM references (set in init) */
let canvas, edgeSvg, container, formatPanel, zoomBadge, ctxMenu;

/* --- Helper: convert mouse event to canvas coordinates --- */
function toCanvas(e) {
  const r = container.getBoundingClientRect();
  return { x: (e.clientX - r.left - panX) / zoom, y: (e.clientY - r.top - panY) / zoom };
}

/* --- Initialize editor on page load --- */
document.addEventListener('DOMContentLoaded', initEditor);
async function initEditor() {
  const params = new URLSearchParams(window.location.search);
  folder = params.get('folder') || '';
  mapName = params.get('map') || '';
  const isNew = params.get('new') === '1';
  canvas = document.getElementById('canvas');
  edgeSvg = document.getElementById('edge-svg');
  container = document.querySelector('.canvas-container');
  formatPanel = document.getElementById('formatPanel');
  zoomBadge = document.getElementById('zoomBadge');
  ctxMenu = document.getElementById('ctxMenu');
  /* Load or create map data */
  if (isNew || !folder || !mapName) {
    mapData = createEmptyMap(mapName.replace(/_/g, ' ') || 'New Map');
  } else {
    const backup = loadFromLocalStorage(folder, mapName);
    const fetched = await loadMap(folder, mapName);
    if (backup && fetched && backup.savedAt > 0 &&
        confirm('A local backup exists. Restore it? (Cancel to load server version)')) {
      mapData = backup.data;
    } else { mapData = fetched || createEmptyMap(mapName.replace(/_/g, ' ')); }
  }
  document.getElementById('mapTitle').value = mapData.title || '';
  renderMap(); setupEventListeners(); updateZoomBadge(); pushUndo();
}

/* --- Render all nodes and edges from mapData --- */
function renderMap() {
  canvas.querySelectorAll('.mm-node').forEach(el => el.remove());
  nodeElements = {};
  const hiddenIds = new Set();
  mapData.nodes.forEach(n => {
    if (n.collapsed) getDescendants(n.id, mapData.edges).forEach(id => hiddenIds.add(id));
  });
  mapData.nodes.forEach(node => {
    const el = renderNode(node);
    if (hiddenIds.has(node.id)) el.style.display = 'none';
    canvas.appendChild(el); nodeElements[node.id] = el;
    attachNodeEvents(el, node);
  });
  renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeElements,
    mapData.edgeThickness, mapData.edgeColor);
  updateCollapseButtons();
}

/* --- Attach events to a node element --- */
function attachNodeEvents(el, node) {
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('.node-connect')) return startConnect(e, node);
    if (e.target.closest('.node-resize')) return startResize(e, node);
    if (e.target.closest('.node-delete')) return deleteSelectedNodes(node.id);
    if (e.target.closest('.node-add-child')) return addChild(node);
    if (e.target.closest('.node-collapse')) return toggleCollapse(node);
    if (e.target.closest('.node-link-icon')) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      if (selectedNodes.has(node.id)) selectedNodes.delete(node.id);
      else selectedNodes.add(node.id);
    } else if (!selectedNodes.has(node.id)) { selectedNodes.clear(); selectedNodes.add(node.id); }
    selectedEdge = null; deselectAllEdges(edgeSvg);
    updateSelectionVisuals(); showFormatPanel(); startDrag(e, node);
  });
  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startEditing(el, node, () => { renderMap(); autoSave(); });
  });
}

/* --- Setup all event listeners --- */
function setupEventListeners() {
  container.addEventListener('mousedown', onCanvasMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  container.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
  edgeSvg.addEventListener('click', onEdgeClick);
  container.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('click', () => ctxMenu.classList.remove('visible'));
  window.addEventListener('paste', onPaste);
  setupToolbar(); setupFormatPanel();
}

/* --- Canvas mousedown: pan or rubber band --- */
function onCanvasMouseDown(e) {
  if (e.target.closest('.mm-node') || e.target.closest('.edge-hit')) return;
  if (e.button === 1 || spaceDown) {
    isPanning = true; dragStart = {x:e.clientX, y:e.clientY};
    panStart = {x:panX, y:panY}; container.classList.add('panning');
  } else if (e.button === 0) {
    selectedNodes.clear(); selectedEdge = null;
    deselectAllEdges(edgeSvg); updateSelectionVisuals(); hideFormatPanel();
    isRubberBand = true; dragStart = toCanvas(e);
    showRubberBand(e.clientX, e.clientY, 0, 0);
  }
}

function onMouseMove(e) {
  if (isPanning) doPan(e); else if (isDragging) doDrag(e);
  else if (isResizing) doResize(e); else if (isConnecting) doConnect(e);
  else if (isRubberBand) doRubberBand(e);
}
function onMouseUp(e) {
  if (isPanning) { isPanning = false; container.classList.remove('panning'); }
  if (isDragging) { isDragging = false; pushUndo(); autoSave(); }
  if (isResizing) { isResizing = false; pushUndo(); autoSave(); }
  if (isConnecting) { finishConnect(e); isConnecting = false; }
  if (isRubberBand) { finishRubberBand(); isRubberBand = false; }
}

/* --- Pan --- */
function doPan(e) {
  panX = panStart.x + (e.clientX - dragStart.x);
  panY = panStart.y + (e.clientY - dragStart.y); applyTransform();
}
/* --- Zoom (centers on cursor) --- */
function onWheel(e) {
  e.preventDefault();
  const r = container.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top, old = zoom;
  zoom = Math.min(3, Math.max(0.15, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
  panX = mx - (mx - panX) * (zoom / old);
  panY = my - (my - panY) * (zoom / old);
  applyTransform(); updateZoomBadge();
}
function applyTransform() {
  const t = `translate(${panX}px,${panY}px) scale(${zoom})`;
  canvas.style.transform = t; edgeSvg.style.transform = t;
}
function updateZoomBadge() { zoomBadge.textContent = Math.round(zoom*100)+'%'; }

/* --- Node dragging --- */
function startDrag(e, node) {
  isDragging = true; dragStart = toCanvas(e); window._dragOffsets = {};
  selectedNodes.forEach(id => {
    const n = mapData.nodes.find(n => n.id === id);
    if (n) window._dragOffsets[id] = {x:n.x, y:n.y};
  });
}
function doDrag(e) {
  const c = toCanvas(e), dx = c.x - dragStart.x, dy = c.y - dragStart.y;
  selectedNodes.forEach(id => {
    const n = mapData.nodes.find(n => n.id === id), off = window._dragOffsets[id];
    if (n && off) { n.x=off.x+dx; n.y=off.y+dy;
      const el = nodeElements[id]; if (el) { el.style.left=n.x+'px'; el.style.top=n.y+'px'; } }
  });
  renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeElements, mapData.edgeThickness, mapData.edgeColor);
}

/* --- Node resizing --- */
function startResize(e, node) {
  e.stopPropagation(); isResizing = true; window._resizeNode = node;
  const el = nodeElements[node.id];
  window._resizeStart = {x:e.clientX, y:e.clientY, w:el.offsetWidth, h:el.offsetHeight};
}
function doResize(e) {
  const n = window._resizeNode, s = window._resizeStart; if (!n) return;
  n.w = Math.max(60, s.w+(e.clientX-s.x)/zoom); n.h = Math.max(30, s.h+(e.clientY-s.y)/zoom);
  updateNodeElement(nodeElements[n.id], n);
  renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeElements, mapData.edgeThickness, mapData.edgeColor);
}

/* --- Connection dragging --- */
function startConnect(e, node) { e.stopPropagation(); isConnecting = true; connectFrom = node.id; }
function doConnect(e) {
  const el = nodeElements[connectFrom]; if (!el) return;
  drawTempConnectLine(edgeSvg, getNodeCenter(mapData.nodes.find(n=>n.id===connectFrom), el), toCanvas(e));
}
function finishConnect(e) {
  removeTempConnectLine(edgeSvg);
  const t = document.elementFromPoint(e.clientX, e.clientY);
  const ne = t ? t.closest('.mm-node') : null;
  if (ne && ne.dataset.id !== connectFrom && !edgeExists(mapData.edges, connectFrom, ne.dataset.id)) {
    mapData.edges.push(createEdgeData('e'+(mapData.nid++), connectFrom, ne.dataset.id));
    renderMap(); pushUndo(); autoSave();
  }
  connectFrom = null;
}

/* --- Rubber band selection --- */
function showRubberBand(x,y,w,h) {
  let rb = document.getElementById('rubberBand');
  if (!rb) { rb=document.createElement('div'); rb.id='rubberBand'; rb.className='rubber-band'; container.appendChild(rb); }
  Object.assign(rb.style, {display:'block',left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
}
function doRubberBand(e) {
  const c = toCanvas(e), r = container.getBoundingClientRect();
  const x=Math.min(dragStart.x,c.x), y=Math.min(dragStart.y,c.y);
  const w=Math.abs(c.x-dragStart.x), h=Math.abs(c.y-dragStart.y);
  const rb = document.getElementById('rubberBand');
  if (rb) Object.assign(rb.style, {left:(x*zoom+panX)+'px',top:(y*zoom+panY+r.top)+'px',width:(w*zoom)+'px',height:(h*zoom)+'px'});
  window._rbRect = {x,y,w,h};
}
function finishRubberBand() {
  const rb = document.getElementById('rubberBand'); if (rb) rb.style.display='none';
  const r = window._rbRect; if (!r||(r.w<5&&r.h<5)) return;
  mapData.nodes.forEach(n => {
    const el=nodeElements[n.id]; if (!el||el.style.display==='none') return;
    if (n.x+el.offsetWidth>r.x&&n.x<r.x+r.w&&n.y+el.offsetHeight>r.y&&n.y<r.y+r.h) selectedNodes.add(n.id);
  });
  updateSelectionVisuals(); showFormatPanel();
}

/* --- Keyboard shortcuts --- */
function onKeyDown(e) {
  if (e.target.tagName==='TEXTAREA'||e.target.tagName==='INPUT') return;
  if (e.code==='Space') { spaceDown=true; e.preventDefault(); }
  if (e.key==='Delete'||e.key==='Backspace') deleteSelection();
  if (e.ctrlKey&&e.key==='z') { undo(); e.preventDefault(); }
  if (e.ctrlKey&&e.key==='a') { selectAll(); e.preventDefault(); }
  if (e.key==='Escape') { selectedNodes.clear(); selectedEdge=null; deselectAllEdges(edgeSvg); updateSelectionVisuals(); hideFormatPanel(); }
}

/* --- Node/edge operations --- */
function deleteSelection() {
  if (selectedEdge) { mapData.edges=deleteEdge(mapData.edges,selectedEdge); selectedEdge=null; }
  if (selectedNodes.size) deleteSelectedNodes();
  renderMap(); pushUndo(); autoSave();
}
function deleteSelectedNodes(singleId) {
  (singleId?[singleId]:[...selectedNodes]).forEach(id => {
    mapData.nodes=mapData.nodes.filter(n=>n.id!==id);
    mapData.edges=deleteEdgesForNode(mapData.edges,id);
  });
  selectedNodes.clear(); renderMap(); pushUndo(); autoSave();
}
function selectAll() { mapData.nodes.forEach(n=>selectedNodes.add(n.id)); updateSelectionVisuals(); showFormatPanel(); }
function addNodeAtCenter() {
  const r=container.getBoundingClientRect(), id='n'+(mapData.nid++);
  mapData.nodes.push(createNodeData(id,(r.width/2-panX)/zoom,(r.height/2-panY)/zoom,'New Node',0));
  renderMap(); pushUndo(); autoSave();
}
function addChild(parent,isNote) {
  const id='n'+(mapData.nid++), eid='e'+(mapData.nid++);
  const pw=nodeElements[parent.id]?nodeElements[parent.id].offsetWidth:140;
  mapData.nodes.push(createNodeData(id,parent.x+pw+60,parent.y,isNote?'Note':'New Node',parent.ci,{isNote:!!isNote}));
  mapData.edges.push(createEdgeData(eid,parent.id,id));
  renderMap(); pushUndo(); autoSave();
}
function toggleCollapse(node) { node.collapsed=!node.collapsed; renderMap(); autoSave(); }
function updateCollapseButtons() {
  mapData.nodes.forEach(n => {
    const el=nodeElements[n.id]; if (!el) return;
    const btn=el.querySelector('.node-collapse'); if (!btn) return;
    const ch=getChildren(n.id,mapData.edges);
    if (!ch.length) { btn.style.display='none'; return; }
    btn.style.display='flex'; btn.textContent=n.collapsed?ch.length:'\u2212';
  });
}
function doAutoLayout() { pushUndo(); autoLayout(mapData.nodes,mapData.edges); renderMap(); autoSave(); }
function doSave() { downloadMap(mapData, mapName||'mindmap'); }
function autoSave() { if (folder&&mapName) saveToLocalStorage(folder,mapName,mapData); }

/* --- Undo (snapshot-based) --- */
function pushUndo() { undoStack.push(JSON.stringify(mapData)); if (undoStack.length>30) undoStack.shift(); }
function undo() {
  if (undoStack.length<2) return;
  undoStack.pop(); mapData=JSON.parse(undoStack[undoStack.length-1]);
  selectedNodes.clear(); selectedEdge=null; renderMap(); hideFormatPanel();
}
