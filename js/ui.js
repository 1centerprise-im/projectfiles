/* ============================================================
   UI.JS - Format panel, context menu, toolbar wiring, and
   selection-related UI logic. Separated from editor.js to
   keep each module under 300 lines.
   ============================================================ */

/* --- Format Panel: show/hide --- */
function showFormatPanel() {
  formatPanel.classList.add('visible');
  updateFormatPanelValues();
}
function hideFormatPanel() {
  formatPanel.classList.remove('visible');
}

/* --- Wire up all format panel controls --- */
/* Called once during init to attach event listeners to format inputs */
function setupFormatPanel() {
  const fp = formatPanel;
  /* Font family dropdown */
  fp.querySelector('#fpFont').addEventListener('change', (e) =>
    applyToSelected(n => n.fontFamily = e.target.value));
  /* Font size number input */
  fp.querySelector('#fpSize').addEventListener('input', (e) =>
    applyToSelected(n => n.fontSize = parseInt(e.target.value) || 13));
  /* Text color picker */
  fp.querySelector('#fpTextColor').addEventListener('input', (e) =>
    applyToSelected(n => n.textColor = e.target.value));
  /* Bold and Italic toggle buttons */
  fp.querySelector('#fpBold').addEventListener('click', () => toggleProp('bold'));
  fp.querySelector('#fpItalic').addEventListener('click', () => toggleProp('italic'));
  /* Text alignment buttons */
  fp.querySelector('#fpAlignL').addEventListener('click', () =>
    applyToSelected(n => n.textAlign = 'left'));
  fp.querySelector('#fpAlignC').addEventListener('click', () =>
    applyToSelected(n => n.textAlign = 'center'));
  fp.querySelector('#fpAlignR').addEventListener('click', () =>
    applyToSelected(n => n.textAlign = 'right'));
  /* Shape buttons (rounded, square, circle, diamond) */
  ['rounded', 'square', 'circle', 'diamond'].forEach(s => {
    fp.querySelector(`#fpShape_${s}`).addEventListener('click', () =>
      applyToSelected(n => n.shape = s));
  });
  /* Border color picker */
  fp.querySelector('#fpBorderColor').addEventListener('input', (e) =>
    applyToSelected(n => n.borderColor = e.target.value));
  /* Border width slider */
  fp.querySelector('#fpBorderWidth').addEventListener('input', (e) =>
    applyToSelected(n => n.borderWidth = parseInt(e.target.value) || 0));
  /* Edge label text input */
  fp.querySelector('#fpEdgeLabel').addEventListener('input', (e) =>
    applyToEdge(ed => ed.label = e.target.value));
  /* Edge thickness slider */
  fp.querySelector('#fpEdgeThick').addEventListener('input', (e) =>
    applyToEdge(ed => ed.thickness = parseFloat(e.target.value) || 2));
  /* Edge color picker */
  fp.querySelector('#fpEdgeColor').addEventListener('input', (e) =>
    applyToEdge(ed => ed.color = e.target.value));
}

/* --- Apply a formatting function to all selected nodes --- */
/* After applying, updates the DOM element and saves */
function applyToSelected(fn) {
  selectedNodes.forEach(id => {
    const n = mapData.nodes.find(n => n.id === id);
    if (n) {
      fn(n);
      updateNodeElement(nodeElements[id], n);
    }
  });
  pushUndo();
  autoSave();
}

/* --- Toggle a boolean property (bold, italic) on selected nodes --- */
function toggleProp(prop) {
  const first = mapData.nodes.find(n => selectedNodes.has(n.id));
  const val = first ? !first[prop] : true;
  applyToSelected(n => n[prop] = val);
}

/* --- Apply a formatting function to the selected edge --- */
function applyToEdge(fn) {
  if (!selectedEdge) return;
  const ed = mapData.edges.find(e => e.id === selectedEdge);
  if (ed) {
    fn(ed);
    renderAllEdges(edgeSvg, mapData.edges, mapData.nodes, nodeElements,
      mapData.edgeThickness, mapData.edgeColor);
    pushUndo();
    autoSave();
  }
}

/* --- Sync format panel input values with current selection --- */
/* Shows node controls or edge controls depending on what's selected */
function updateFormatPanelValues() {
  if (selectedNodes.size > 0) {
    /* Find the first selected node to read its properties */
    const n = mapData.nodes.find(n => selectedNodes.has(n.id));
    if (!n) return;
    formatPanel.querySelector('#fpFont').value = n.fontFamily || 'Nunito';
    formatPanel.querySelector('#fpSize').value = n.fontSize || 13;
    formatPanel.querySelector('#fpTextColor').value = n.textColor || '#2a2520';
    formatPanel.querySelector('#fpBold').classList.toggle('active', !!n.bold);
    formatPanel.querySelector('#fpItalic').classList.toggle('active', !!n.italic);
    formatPanel.querySelector('#fpBorderColor').value = n.borderColor || '#c8c0b8';
    formatPanel.querySelector('#fpBorderWidth').value = n.borderWidth || 0;
    /* Show node controls, hide edge controls */
    document.getElementById('nodeFormatControls').style.display = 'flex';
    document.getElementById('edgeFormatControls').style.display = 'none';
  } else if (selectedEdge) {
    /* Show edge controls */
    const ed = mapData.edges.find(e => e.id === selectedEdge);
    if (ed) {
      formatPanel.querySelector('#fpEdgeLabel').value = ed.label || '';
      formatPanel.querySelector('#fpEdgeThick').value = ed.thickness || mapData.edgeThickness || 2;
      formatPanel.querySelector('#fpEdgeColor').value = ed.color || mapData.edgeColor || '#b8b0a6';
    }
    document.getElementById('nodeFormatControls').style.display = 'none';
    document.getElementById('edgeFormatControls').style.display = 'flex';
  }
}

/* --- Right-click context menu handler --- */
/* Shows different menu items depending on whether a node or canvas was clicked */
function onContextMenu(e) {
  e.preventDefault();
  const nodeEl = e.target.closest('.mm-node');
  ctxMenu.innerHTML = '';

  if (nodeEl) {
    /* Context menu for a specific node */
    const node = mapData.nodes.find(n => n.id === nodeEl.dataset.id);
    ctxMenu.innerHTML = `
      <div class="ctx-item" data-action="add-child">Add Child</div>
      <div class="ctx-item" data-action="add-note">Add Note</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-action="attach-link">Attach Link</div>
      <div class="ctx-item" data-action="remove-link">Remove Link</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-action="delete-node" style="color:var(--red)">Delete Node</div>`;
    /* Handle click on menu item */
    ctxMenu.onclick = (ev) => {
      const action = ev.target.dataset.action;
      if (action === 'add-child') addChild(node);
      else if (action === 'add-note') addChild(node, true);
      else if (action === 'attach-link') {
        const url = prompt('Enter URL:');
        if (url) { node.link = url; renderMap(); autoSave(); }
      }
      else if (action === 'remove-link') { node.link = ''; renderMap(); autoSave(); }
      else if (action === 'delete-node') deleteSelectedNodes(node.id);
      ctxMenu.classList.remove('visible');
    };
  } else {
    /* Context menu for empty canvas area */
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left - panX) / zoom;
    const y = (e.clientY - rect.top - panY) / zoom;
    ctxMenu.innerHTML = `
      <div class="ctx-item" data-action="add-here">Add Node Here</div>`;
    ctxMenu.onclick = (ev) => {
      if (ev.target.dataset.action === 'add-here') {
        const id = 'n' + (mapData.nid++);
        mapData.nodes.push(createNodeData(id, x, y, 'New Node', 0));
        renderMap(); pushUndo(); autoSave();
      }
      ctxMenu.classList.remove('visible');
    };
  }
  /* Position menu at cursor */
  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.top = e.clientY + 'px';
  ctxMenu.classList.add('visible');
}

/* --- Selection visual update --- */
/* Adds/removes CSS classes on node elements based on selection state */
function updateSelectionVisuals() {
  Object.entries(nodeElements).forEach(([id, el]) => {
    el.classList.remove('selected', 'multi-selected');
    if (selectedNodes.has(id)) {
      el.classList.add(selectedNodes.size > 1 ? 'multi-selected' : 'selected');
    }
  });
}

/* --- Recolor all selected nodes to a new color index --- */
function recolorSelected(ci) {
  selectedNodes.forEach(id => {
    const n = mapData.nodes.find(n => n.id === id);
    if (n) {
      n.ci = ci;
      updateNodeElement(nodeElements[id], n);
    }
  });
  pushUndo();
  autoSave();
}

/* --- Edge click handler (delegated from SVG) --- */
function onEdgeClick(e) {
  const hit = e.target.closest('.edge-hit');
  if (!hit) return;
  /* Deselect nodes, select edge */
  selectedNodes.clear();
  updateSelectionVisuals();
  selectedEdge = hit.dataset.edgeId;
  selectEdge(edgeSvg, selectedEdge);
  showFormatPanel();
}

/* --- Paste handler: Ctrl+V attaches URL to selected node --- */
function onPaste(e) {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (selectedNodes.size !== 1) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (text && text.startsWith('http')) {
    const id = [...selectedNodes][0];
    const node = mapData.nodes.find(n => n.id === id);
    if (node) {
      node.link = text.trim();
      renderMap();
      autoSave();
    }
  }
}

/* --- Wire up toolbar buttons --- */
/* Called once during init */
function setupToolbar() {
  /* Map title: update on input */
  document.getElementById('mapTitle').addEventListener('input', (e) => {
    mapData.title = e.target.value;
    autoSave();
  });
  /* Navigate back to home */
  document.getElementById('btnMyMaps').addEventListener('click', () =>
    window.location.href = 'index.html');
  /* Add node button */
  document.getElementById('btnAddNode').addEventListener('click', () =>
    addNodeAtCenter());
  /* Auto layout button */
  document.getElementById('btnAutoLayout').addEventListener('click', doAutoLayout);
  /* Save button (triggers JSON download) */
  document.getElementById('btnSave').addEventListener('click', doSave);
  /* Color swatch clicks: recolor selected node(s) */
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () =>
      recolorSelected(parseInt(sw.dataset.ci)));
  });
}
