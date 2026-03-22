/* ============================================================
   NODES.JS - Node rendering, creation, deletion, formatting
   - renderNodeElement(): creates a DOM div for one node
   - updateNodeElement(): refreshes an existing node div
   - createNodeData(): makes a new node data object
   - startEditing(): inline text editing via textarea
   - getNodeCenter(): center point for edge connections
   - getChildren() / getDescendants(): tree traversal helpers
   ============================================================ */

/* --- Color palette: ci property in JSON maps to this array --- */
var COLORS = [
  { bg: '#ffffff', bd: '#c8c0b8', name: 'White'  },  // ci: 0
  { bg: '#ddeeff', bd: '#3b6ea5', name: 'Blue'   },  // ci: 1
  { bg: '#dff5e3', bd: '#27a85f', name: 'Green'  },  // ci: 2
  { bg: '#fff8d4', bd: '#c8960a', name: 'Yellow' },  // ci: 3
  { bg: '#fde8d0', bd: '#e07b3a', name: 'Orange' },  // ci: 4
  { bg: '#fde0de', bd: '#c0392b', name: 'Red'    },  // ci: 5
  { bg: '#ede0ff', bd: '#7b52ab', name: 'Purple' },  // ci: 6
  { bg: '#2a2520', bd: '#2a2520', name: 'Dark'   }   // ci: 7 (white text)
];

/* --- Create a DOM element for a node --- */
/* Reads all properties from the node data object and builds a styled div */
function renderNodeElement(node) {
  var el = document.createElement('div');
  el.className = 'mm-node';
  el.dataset.id = node.id;

  /* Shape class: default is "rounded" (border-radius via CSS) */
  if (node.shape === 'square')  el.classList.add('shape-square');
  if (node.shape === 'circle')  el.classList.add('shape-circle');
  if (node.shape === 'diamond') el.classList.add('shape-diamond');
  /* Note nodes get dashed border + italic style */
  if (node.isNote) el.classList.add('note');

  /* Apply color from the COLORS palette using ci index */
  var ci = (typeof node.ci === 'number') ? node.ci : 0;
  var color = COLORS[ci] || COLORS[0];
  el.style.background = color.bg;
  el.style.borderColor = node.borderColor || color.bd;
  el.style.borderWidth = (node.borderWidth || 2) + 'px';
  /* ci=7 (Dark) needs white text; otherwise use node's textColor or default */
  el.style.color = (ci === 7) ? '#ffffff' : (node.textColor || '#2a2520');

  /* Font properties */
  el.style.fontSize = (node.fontSize || 13) + 'px';
  el.style.fontFamily = node.fontFamily || 'Nunito';
  el.style.fontWeight = node.bold ? '700' : '400';
  el.style.fontStyle = node.italic ? 'italic' : 'normal';
  el.style.textAlign = node.textAlign || 'left';
  /* Flexbox alignment to match text-align */
  if (node.textAlign === 'center') el.style.justifyContent = 'center';
  else if (node.textAlign === 'right') el.style.justifyContent = 'flex-end';

  /* Position: absolute within the canvas div */
  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  /* Only set explicit size if w/h > 0; otherwise let CSS min-width handle it */
  if (node.w > 0) el.style.width = node.w + 'px';
  if (node.h > 0) el.style.height = node.h + 'px';

  /* Text label */
  var textSpan = document.createElement('span');
  textSpan.className = 'node-text';
  textSpan.textContent = node.text || '';
  el.appendChild(textSpan);

  /* Google Drive link icon (only if node.link has a URL) */
  if (node.link) {
    el.appendChild(makeLinkIcon(node.link, color.bd));
  }

  /* Action buttons (visible when node is selected) */
  var actions = document.createElement('div');
  actions.className = 'node-actions';
  actions.innerHTML =
    '<button class="node-delete" title="Delete">&times;</button>' +
    '<button class="node-add-child" title="Add child">+</button>' +
    '<button class="node-collapse" title="Collapse/Expand">&minus;</button>' +
    '<div class="node-connect" title="Drag to connect"></div>' +
    '<div class="node-resize" title="Resize"></div>';
  el.appendChild(actions);

  return el;
}

/* --- Create the Google Drive link icon --- */
/* A colored triangle SVG. Clicking it opens the URL in a new tab. */
function makeLinkIcon(url, borderColor) {
  var icon = document.createElement('div');
  icon.className = 'node-link-icon';
  icon.title = 'Open link';
  /* Simple colored triangle */
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="' + borderColor + '">' +
    '<path d="M12 2L2 19h20L12 2zm0 4l7 12H5l7-12z" opacity="0.7"/>' +
    '<path d="M7.5 17h9L12 7.5 7.5 17z"/></svg>';
  /* Click handler: open link in new tab */
  icon.addEventListener('click', function(e) {
    e.stopPropagation();
    window.open(url, '_blank');
  });
  return icon;
}

/* --- Update an existing node DOM element after data changes --- */
function updateNodeElement(el, node) {
  var ci = (typeof node.ci === 'number') ? node.ci : 0;
  var color = COLORS[ci] || COLORS[0];
  el.style.background = color.bg;
  el.style.borderColor = node.borderColor || color.bd;
  el.style.borderWidth = (node.borderWidth || 2) + 'px';
  el.style.color = (ci === 7) ? '#ffffff' : (node.textColor || '#2a2520');
  el.style.fontSize = (node.fontSize || 13) + 'px';
  el.style.fontFamily = node.fontFamily || 'Nunito';
  el.style.fontWeight = node.bold ? '700' : '400';
  el.style.fontStyle = node.italic ? 'italic' : 'normal';
  el.style.textAlign = node.textAlign || 'left';
  el.style.justifyContent =
    node.textAlign === 'center' ? 'center' :
    node.textAlign === 'right' ? 'flex-end' : 'flex-start';
  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  el.style.width = node.w > 0 ? node.w + 'px' : '';
  el.style.height = node.h > 0 ? node.h + 'px' : '';
  /* Update shape classes */
  el.classList.remove('shape-square', 'shape-circle', 'shape-diamond');
  if (node.shape === 'square')  el.classList.add('shape-square');
  if (node.shape === 'circle')  el.classList.add('shape-circle');
  if (node.shape === 'diamond') el.classList.add('shape-diamond');
  /* Update text */
  var ts = el.querySelector('.node-text');
  if (ts) ts.textContent = node.text || '';
  /* Update link icon */
  var oldIcon = el.querySelector('.node-link-icon');
  if (oldIcon) oldIcon.remove();
  if (node.link) {
    el.insertBefore(makeLinkIcon(node.link, color.bd), el.querySelector('.node-actions'));
  }
}

/* --- Create a new node data object with defaults --- */
function createNodeData(id, x, y, text, ci, opts) {
  opts = opts || {};
  return {
    id: id, x: x, y: y, w: 0, h: 0,
    text: text || 'New Node', ci: ci || 0,
    link: '', collapsed: false, isNote: !!opts.isNote,
    fontSize: opts.fontSize || 13, fontFamily: opts.fontFamily || 'Nunito',
    textColor: '', bold: false, italic: false, textAlign: 'left',
    shape: 'rounded', borderColor: '', borderWidth: 0
  };
}

/* --- Start inline editing: replace text span with textarea --- */
function startEditing(nodeEl, nodeData, onDone) {
  if (nodeEl.querySelector('.node-edit-textarea')) return;
  var textSpan = nodeEl.querySelector('.node-text');
  textSpan.style.display = 'none';
  var ta = document.createElement('textarea');
  ta.className = 'node-edit-textarea';
  ta.value = nodeData.text || '';
  ta.style.fontSize = nodeEl.style.fontSize;
  ta.style.fontFamily = nodeEl.style.fontFamily;
  ta.style.color = nodeEl.style.color;
  ta.style.textAlign = nodeEl.style.textAlign;
  nodeEl.appendChild(ta);
  ta.focus();
  ta.select();
  function finish() {
    nodeData.text = ta.value;
    textSpan.textContent = ta.value;
    textSpan.style.display = '';
    ta.remove();
    if (onDone) onDone();
  }
  ta.addEventListener('blur', finish);
  ta.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    if (e.key === 'Escape') { ta.value = nodeData.text; ta.blur(); }
    e.stopPropagation();
  });
}

/* --- Get center point of a node for edge drawing --- */
/* Uses el.offsetWidth/Height if available, else sensible defaults */
function getNodeCenter(node, el) {
  var w = (el && el.offsetWidth) ? el.offsetWidth : (node.w > 0 ? node.w : 140);
  var h = (el && el.offsetHeight) ? el.offsetHeight : (node.h > 0 ? node.h : 40);
  return { x: node.x + w / 2, y: node.y + h / 2 };
}

/* --- Get direct children of a node (via outgoing edges) --- */
function getChildren(nodeId, edges) {
  return edges.filter(function(e) { return e.from === nodeId; }).map(function(e) { return e.to; });
}

/* --- Get all descendants recursively (for collapse/expand) --- */
function getDescendants(nodeId, edges) {
  var result = [], stack = [nodeId], visited = {};
  while (stack.length) {
    var cur = stack.pop();
    getChildren(cur, edges).forEach(function(child) {
      if (!visited[child]) { visited[child] = true; result.push(child); stack.push(child); }
    });
  }
  return result;
}
