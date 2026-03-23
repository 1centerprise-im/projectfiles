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
  { bg: '#fff8d4', bd: '#c8960a', name: 'Yellow'  },  // ci: 0
  { bg: '#fde0de', bd: '#c0392b', name: 'Red'     },  // ci: 1
  { bg: '#1a6b5a', bd: '#0f4f40', name: 'Teal'    },  // ci: 2 (white text)
  { bg: '#5c3d2e', bd: '#3e2518', name: 'Brown'   },  // ci: 3 (white text)
  { bg: '#1b5e20', bd: '#0a3d12', name: 'DkGreen' },  // ci: 4 (white text)
  { bg: '#4a0e0e', bd: '#8b0000', name: 'Maroon'  },  // ci: 5 (white text)
  { bg: '#1a1a2e', bd: '#0f3460', name: 'Navy'    },  // ci: 6 (white text)
  { bg: '#2a2520', bd: '#2a2520', name: 'Dark'    }   // ci: 7 (white text)
];

/* --- Determine if a color index is "dark" (needs white text, full fill) --- */
function isDarkColor(ci) { return ci >= 2; }

/* --- Create a DOM element for a node --- */
/* Soft modern style: colored bubble fill, no top bar, no heavy borders */
function renderNodeElement(node) {
  var el = document.createElement('div');
  el.className = 'mm-node';
  el.dataset.id = node.id;

  if (node.shape === 'square')  el.classList.add('shape-square');
  if (node.shape === 'circle')  el.classList.add('shape-circle');
  if (node.shape === 'diamond') el.classList.add('shape-diamond');
  if (node.isNote) el.classList.add('note');

  var ci = (typeof node.ci === 'number') ? node.ci : 0;
  var color = COLORS[ci] || COLORS[0];
  var dark = isDarkColor(ci);

  /* All nodes fill with their color */
  el.style.background = color.bg;
  el.style.borderColor = color.bd;
  el.style.color = dark ? '#ffffff' : (node.textColor || '#2a2520');
  if (dark) el.classList.add('node-dark');

  /* Font */
  el.style.fontSize = (node.fontSize || 13) + 'px';
  el.style.fontFamily = node.fontFamily || 'Nunito';
  el.style.fontWeight = node.bold ? '700' : '600';
  el.style.fontStyle = node.italic ? 'italic' : 'normal';
  el.style.textAlign = node.textAlign || 'left';
  if (node.textAlign === 'center') el.style.justifyContent = 'center';
  else if (node.textAlign === 'right') el.style.justifyContent = 'flex-end';

  /* Position */
  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  if (node.w > 0) el.style.width = node.w + 'px';
  if (node.h > 0) el.style.height = node.h + 'px';

  /* Text */
  var textSpan = document.createElement('span');
  textSpan.className = 'node-text';
  textSpan.textContent = node.text || '';
  el.appendChild(textSpan);

  /* Google Drive link icon */
  if (node.link) {
    el.appendChild(makeLinkIcon(node.link, dark ? '#ffffff' : color.bd));
  }

  /* Action buttons */
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
  icon.title = 'Open in Google Drive';
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
  var dark = isDarkColor(ci);

  el.classList.toggle('node-dark', dark);
  el.style.background = color.bg;
  el.style.borderColor = color.bd;
  el.style.color = dark ? '#ffffff' : (node.textColor || '#2a2520');
  el.style.fontSize = (node.fontSize || 13) + 'px';
  el.style.fontFamily = node.fontFamily || 'Nunito';
  el.style.fontWeight = node.bold ? '700' : '600';
  el.style.fontStyle = node.italic ? 'italic' : 'normal';
  el.style.textAlign = node.textAlign || 'left';
  el.style.justifyContent =
    node.textAlign === 'center' ? 'center' :
    node.textAlign === 'right' ? 'flex-end' : 'flex-start';
  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  el.style.width = node.w > 0 ? node.w + 'px' : '';
  el.style.height = node.h > 0 ? node.h + 'px' : '';
  el.classList.remove('shape-square', 'shape-circle', 'shape-diamond');
  if (node.shape === 'square')  el.classList.add('shape-square');
  if (node.shape === 'circle')  el.classList.add('shape-circle');
  if (node.shape === 'diamond') el.classList.add('shape-diamond');
  /* Remove old color bar if present */
  var bar = el.querySelector('.node-color-bar');
  if (bar) bar.remove();
  /* Update text */
  var ts = el.querySelector('.node-text');
  if (ts) ts.textContent = node.text || '';
  /* Update link icon */
  var oldIcon = el.querySelector('.node-link-icon');
  if (oldIcon) oldIcon.remove();
  if (node.link) {
    el.insertBefore(makeLinkIcon(node.link, dark ? '#ffffff' : color.bd), el.querySelector('.node-actions'));
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
