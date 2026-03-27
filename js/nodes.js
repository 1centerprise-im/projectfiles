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
  { bg: '#f5f0e8', bd: '#d4cbbe', name: 'Cream' },  // ci: 0
  { bg: '#fff0c4', bd: '#c8960a', name: 'Gold'  },  // ci: 1
  { bg: '#f0997b', bd: '#993c1d', name: 'Coral' },  // ci: 2
  { bg: '#85b7eb', bd: '#185fa5', name: 'Blue'  },  // ci: 3
  { bg: '#5dcaa5', bd: '#0f6e56', name: 'Teal'  },  // ci: 4
  { bg: '#ef9f27', bd: '#854f0b', name: 'Amber' },  // ci: 5
  { bg: '#185fa5', bd: '#042c53', name: 'Navy'  },  // ci: 6 (white text)
  { bg: '#2c2c2a', bd: '#444441', name: 'Dark'  }   // ci: 7 (white text)
];

/* --- Determine if a color index is "dark" (needs white text) --- */
function isDarkColor(ci) { return ci >= 6; }

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
  el.style.borderColor = node.borderColor || color.bd;
  if (node.borderWidth > 0) el.style.borderWidth = node.borderWidth + 'px';
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

  /* Google Drive link icon - only if node has a real URL */
  if (node.link && node.link.trim() !== '') {
    el.appendChild(makeLinkIcon(node.link));
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
function makeLinkIcon(url) {
  var icon = document.createElement('div');
  icon.className = 'node-link-icon';
  icon.title = 'Open in Google Drive';
  icon.innerHTML = '<svg viewBox="0 0 87.3 78" width="20" height="20" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M6.6 66.85L14.2 78h58.9l7.6-11.15z" fill="#0066da"/>' +
    '<path d="M29.15 0L0 50.55l14.2 11.15L58.3 0z" fill="#00ac47"/>' +
    '<path d="M58.3 0L29.15 50.55h58.15L80.7 0z" fill="#ea4335"/>' +
    '<path d="M29.15 50.55l-14.95 16.3L21.8 78h36.5l7.6-11.15z" fill="#00832d"/>' +
    '<path d="M58.3 0H29.15l29.15 50.55h28.4z" fill="#2684fc"/>' +
    '<path d="M14.2 61.7L29.15 50.55 0 50.55z" fill="#ffba00"/></svg>';
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
  el.style.borderColor = node.borderColor || color.bd;
  if (node.borderWidth > 0) el.style.borderWidth = node.borderWidth + 'px';
  else el.style.borderWidth = '';
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
  if (node.link && node.link.trim() !== '') {
    el.insertBefore(makeLinkIcon(node.link), el.querySelector('.node-actions'));
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

/* --- Migrate collapsedChildren array back to collapsed boolean --- */
function migrateCollapseData(nodes, edges) {
  nodes.forEach(function(n) {
    /* If node has collapsedChildren array, convert to boolean */
    if (Array.isArray(n.collapsedChildren)) {
      n.collapsed = n.collapsedChildren.length > 0;
      delete n.collapsedChildren;
    }
    /* Ensure collapsed is a boolean */
    if (typeof n.collapsed !== 'boolean') n.collapsed = false;
  });
}

/* --- Compute set of all hidden node IDs (simple: collapsed hides all descendants) --- */
function getHiddenNodeIds(nodes, edges) {
  var hidden = {};
  nodes.forEach(function(n) {
    if (n.collapsed) {
      getDescendants(n.id, edges).forEach(function(id) { hidden[id] = true; });
    }
  });
  return hidden;
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
