/* ============================================================
   NODES.JS - Node rendering, creation, deletion, formatting
   Handles all DOM manipulation for mind map nodes including
   inline editing, shape rendering, and action buttons.
   ============================================================ */

/* --- Color palette (must match editor.js COLORS) --- */
const COLORS = [
  { bg:'#ffffff', bd:'#c8c0b8', name:'White'  },  // ci: 0
  { bg:'#ddeeff', bd:'#3b6ea5', name:'Blue'   },  // ci: 1
  { bg:'#dff5e3', bd:'#27a85f', name:'Green'  },  // ci: 2
  { bg:'#fff8d4', bd:'#c8960a', name:'Yellow' },  // ci: 3
  { bg:'#fde8d0', bd:'#e07b3a', name:'Orange' },  // ci: 4
  { bg:'#fde0de', bd:'#c0392b', name:'Red'    },  // ci: 5
  { bg:'#ede0ff', bd:'#7b52ab', name:'Purple' },  // ci: 6
  { bg:'#2a2520', bd:'#2a2520', name:'Dark'   },  // ci: 7
];

/* --- Render a single node as a DOM element --- */
/* Takes node data object, returns an HTMLElement positioned on the canvas */
function renderNode(node) {
  const el = document.createElement('div');
  el.className = 'mm-node';
  el.dataset.id = node.id;

  /* Apply shape class */
  if (node.shape === 'square') el.classList.add('shape-square');
  else if (node.shape === 'circle') el.classList.add('shape-circle');
  else if (node.shape === 'diamond') el.classList.add('shape-diamond');

  /* Note style */
  if (node.isNote) el.classList.add('note');

  /* Apply colors from palette */
  const ci = node.ci || 0;
  const color = COLORS[ci] || COLORS[0];
  el.style.background = color.bg;
  el.style.borderColor = node.borderColor || color.bd;
  el.style.borderWidth = (node.borderWidth || 2) + 'px';
  /* Dark theme: white text */
  el.style.color = ci === 7 ? '#ffffff' : (node.textColor || '#2a2520');

  /* Font styling */
  el.style.fontSize = (node.fontSize || 13) + 'px';
  el.style.fontFamily = node.fontFamily || 'Nunito';
  el.style.fontWeight = node.bold ? '700' : '400';
  el.style.fontStyle = node.italic ? 'italic' : 'normal';
  el.style.textAlign = node.textAlign || 'left';
  if (node.textAlign === 'center') el.style.justifyContent = 'center';
  else if (node.textAlign === 'right') el.style.justifyContent = 'flex-end';

  /* Position and size */
  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  if (node.w > 0) el.style.width = node.w + 'px';
  if (node.h > 0) el.style.height = node.h + 'px';

  /* Text content */
  const textSpan = document.createElement('span');
  textSpan.className = 'node-text';
  textSpan.textContent = node.text || '';
  el.appendChild(textSpan);

  /* Google Drive link icon (shown if node has a URL) */
  if (node.link) {
    const linkIcon = createLinkIcon(node.link, ci);
    el.appendChild(linkIcon);
  }

  /* Action buttons container (visible when selected) */
  const actions = document.createElement('div');
  actions.className = 'node-actions';
  /* Delete button (X) */
  actions.innerHTML = `
    <button class="node-delete" title="Delete node">&times;</button>
    <button class="node-add-child" title="Add child">+</button>
    <button class="node-collapse" title="Collapse/Expand">&minus;</button>
    <div class="node-connect" title="Drag to connect"></div>
    <div class="node-resize" title="Resize"></div>
  `;
  el.appendChild(actions);

  return el;
}

/* --- Create Google Drive link icon SVG --- */
/* Shows a colored triangle icon; clicking opens the link */
function createLinkIcon(url, ci) {
  const icon = document.createElement('div');
  icon.className = 'node-link-icon';
  icon.title = 'Open link';
  const color = COLORS[ci] || COLORS[0];
  /* Simple triangle SVG colored by node's border color */
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="${color.bd}" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 19h20L12 2zm0 4l7 12H5l7-12z" opacity="0.8"/>
    <path d="M7.5 17h9L12 7.5 7.5 17z"/>
  </svg>`;
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    window.open(url, '_blank');
  });
  return icon;
}

/* --- Create a new node data object --- */
/* Returns a plain object matching the JSON format */
function createNodeData(id, x, y, text, ci, opts) {
  return {
    id: id,
    x: x,
    y: y,
    w: 0,
    h: 0,
    text: text || 'New Node',
    ci: ci || 0,
    link: '',
    collapsed: false,
    isNote: (opts && opts.isNote) || false,
    fontSize: (opts && opts.fontSize) || 13,
    fontFamily: (opts && opts.fontFamily) || 'Nunito',
    textColor: '',
    bold: false,
    italic: false,
    textAlign: 'left',
    shape: 'rounded',
    borderColor: '',
    borderWidth: 0
  };
}

/* --- Start inline editing of a node --- */
/* Replaces the text span with a textarea for editing */
function startEditing(nodeEl, nodeData, onDone) {
  if (nodeEl.querySelector('.node-edit-textarea')) return; // already editing
  const textSpan = nodeEl.querySelector('.node-text');
  textSpan.style.display = 'none';

  const ta = document.createElement('textarea');
  ta.className = 'node-edit-textarea';
  ta.value = nodeData.text || '';
  ta.style.fontSize = nodeEl.style.fontSize;
  ta.style.fontFamily = nodeEl.style.fontFamily;
  ta.style.color = nodeEl.style.color;
  ta.style.textAlign = nodeEl.style.textAlign;
  nodeEl.appendChild(ta);
  ta.focus();
  ta.select();

  /* Finish editing on blur or Enter (Shift+Enter for newline) */
  function finish() {
    nodeData.text = ta.value;
    textSpan.textContent = ta.value;
    textSpan.style.display = '';
    ta.remove();
    if (onDone) onDone();
  }
  ta.addEventListener('blur', finish);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    if (e.key === 'Escape') { ta.value = nodeData.text; ta.blur(); }
    e.stopPropagation(); // don't trigger canvas shortcuts while editing
  });
}

/* --- Update an existing node DOM element to match data --- */
/* Called after changing node properties (color, font, etc.) */
function updateNodeElement(el, node) {
  /* Re-apply all visual properties */
  const ci = node.ci || 0;
  const color = COLORS[ci] || COLORS[0];
  el.style.background = color.bg;
  el.style.borderColor = node.borderColor || color.bd;
  el.style.borderWidth = (node.borderWidth || 2) + 'px';
  el.style.color = ci === 7 ? '#ffffff' : (node.textColor || '#2a2520');
  el.style.fontSize = (node.fontSize || 13) + 'px';
  el.style.fontFamily = node.fontFamily || 'Nunito';
  el.style.fontWeight = node.bold ? '700' : '400';
  el.style.fontStyle = node.italic ? 'italic' : 'normal';
  el.style.textAlign = node.textAlign || 'left';
  el.style.justifyContent = node.textAlign === 'center' ? 'center' :
    node.textAlign === 'right' ? 'flex-end' : 'flex-start';

  /* Position and size */
  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  if (node.w > 0) el.style.width = node.w + 'px';
  else el.style.width = '';
  if (node.h > 0) el.style.height = node.h + 'px';
  else el.style.height = '';

  /* Update shape classes */
  el.classList.remove('shape-square', 'shape-circle', 'shape-diamond');
  if (node.shape === 'square') el.classList.add('shape-square');
  else if (node.shape === 'circle') el.classList.add('shape-circle');
  else if (node.shape === 'diamond') el.classList.add('shape-diamond');

  /* Update text */
  const textSpan = el.querySelector('.node-text');
  if (textSpan) textSpan.textContent = node.text || '';

  /* Update or add/remove link icon */
  const oldIcon = el.querySelector('.node-link-icon');
  if (oldIcon) oldIcon.remove();
  if (node.link) el.insertBefore(createLinkIcon(node.link, ci), el.querySelector('.node-actions'));
}

/* --- Get the center point of a node (for edge drawing) --- */
function getNodeCenter(node, el) {
  const w = el ? el.offsetWidth : (node.w || 140);
  const h = el ? el.offsetHeight : (node.h || 40);
  return { x: node.x + w / 2, y: node.y + h / 2 };
}

/* --- Get children of a node (nodes connected by edges FROM this node) --- */
function getChildren(nodeId, edges) {
  return edges.filter(e => e.from === nodeId).map(e => e.to);
}

/* --- Get all descendants recursively --- */
function getDescendants(nodeId, edges) {
  const result = [];
  const stack = [nodeId];
  const visited = new Set();
  while (stack.length) {
    const current = stack.pop();
    const children = getChildren(current, edges);
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child);
        result.push(child);
        stack.push(child);
      }
    }
  }
  return result;
}
