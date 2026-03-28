/* ============================================================
   UI.JS - Format panel, context menu, toolbar wiring, and
   selection-related UI logic.
   ============================================================ */

/* --- Format Panel show/hide --- */
function showFormatPanel() {
  formatPanel.classList.add('visible');
  updateFormatPanelValues();
}
function hideFormatPanel() {
  formatPanel.classList.remove('visible');
}

/* --- Wire up all format panel controls (called once at init) --- */
function setupFormatPanel() {
  var fp = formatPanel;
  /* Node formatting */
  fp.querySelector('#fpFont').addEventListener('change', function(e) {
    applyToSelected(function(n) { n.fontFamily = e.target.value; });
  });
  fp.querySelector('#fpSize').addEventListener('input', function(e) {
    applyToSelected(function(n) { n.fontSize = parseInt(e.target.value) || 13; });
  });
  fp.querySelector('#fpTextColor').addEventListener('input', function(e) {
    applyToSelected(function(n) { n.textColor = e.target.value; });
  });
  fp.querySelector('#fpBold').addEventListener('click', function() { toggleProp('bold'); });
  fp.querySelector('#fpItalic').addEventListener('click', function() { toggleProp('italic'); });
  fp.querySelector('#fpAlignL').addEventListener('click', function() {
    applyToSelected(function(n) { n.textAlign = 'left'; });
  });
  fp.querySelector('#fpAlignC').addEventListener('click', function() {
    applyToSelected(function(n) { n.textAlign = 'center'; });
  });
  fp.querySelector('#fpAlignR').addEventListener('click', function() {
    applyToSelected(function(n) { n.textAlign = 'right'; });
  });
  /* Shape buttons */
  ['rounded', 'square', 'circle', 'diamond'].forEach(function(s) {
    fp.querySelector('#fpShape_' + s).addEventListener('click', function() {
      applyToSelected(function(n) { n.shape = s; });
    });
  });
  fp.querySelector('#fpBorderColor').addEventListener('input', function(e) {
    applyToSelected(function(n) { n.borderColor = e.target.value; });
  });
  fp.querySelector('#fpBorderWidth').addEventListener('input', function(e) {
    applyToSelected(function(n) { n.borderWidth = parseInt(e.target.value) || 0; });
  });
}

/* --- Apply function to all selected nodes, re-render, save --- */
function applyToSelected(fn) {
  selectedNodes.forEach(function(id) {
    var n = mapData.nodes.find(function(n) { return n.id === id; });
    if (n) { fn(n); updateNodeElement(nodeEls[id], n); }
  });
  pushUndo(); autoSave();
}

/* --- Toggle a boolean prop (bold, italic) on selected nodes --- */
function toggleProp(prop) {
  var first = mapData.nodes.find(function(n) { return selectedNodes.has(n.id); });
  var val = first ? !first[prop] : true;
  applyToSelected(function(n) { n[prop] = val; });
}

/* --- Sync format panel values to current selection --- */
function updateFormatPanelValues() {
  var nfc = document.getElementById('nodeFormatControls');
  if (selectedNodes.size > 0) {
    var n = mapData.nodes.find(function(nd) { return selectedNodes.has(nd.id); });
    if (!n) return;
    formatPanel.querySelector('#fpFont').value = n.fontFamily || 'Nunito';
    formatPanel.querySelector('#fpSize').value = n.fontSize || 13;
    formatPanel.querySelector('#fpTextColor').value = n.textColor || '#2a2520';
    formatPanel.querySelector('#fpBold').classList.toggle('active', !!n.bold);
    formatPanel.querySelector('#fpItalic').classList.toggle('active', !!n.italic);
    formatPanel.querySelector('#fpBorderColor').value = n.borderColor || '#c8c0b8';
    formatPanel.querySelector('#fpBorderWidth').value = n.borderWidth || 0;
    nfc.style.display = 'flex';
  }
}

/* --- Selection visual update (add/remove CSS classes) --- */
function updateSelectionVisuals() {
  Object.keys(nodeEls).forEach(function(id) {
    var el = nodeEls[id];
    el.classList.remove('selected', 'multi-selected');
    if (selectedNodes.has(id)) {
      el.classList.add(selectedNodes.size > 1 ? 'multi-selected' : 'selected');
    }
  });
}

/* --- Recolor selected nodes to a new color index --- */
function recolorSelected(ci) {
  selectedNodes.forEach(function(id) {
    var n = mapData.nodes.find(function(nd) { return nd.id === id; });
    if (n) { n.ci = ci; updateNodeElement(nodeEls[id], n); }
  });
  pushUndo(); autoSave();
}

/* --- Paste: Ctrl+V to attach URL to selected node --- */
function onPaste(e) {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (selectedNodes.size !== 1) return;
  var text = (e.clipboardData || window.clipboardData).getData('text');
  if (text && text.trim().startsWith('http')) {
    e.preventDefault();
    var id = selectedNodes.values().next().value;
    var node = mapData.nodes.find(function(n) { return n.id === id; });
    if (node) { node.link = text.trim(); pushUndo(); fullRender(); autoSave(); showToast('Link added to node'); }
  }
}

/* --- Right-click context menu --- */
function onContextMenu(e) {
  e.preventDefault();
  var nodeEl = e.target.closest('.mm-node');
  ctxMenu.innerHTML = '';
  if (nodeEl) {
    var node = mapData.nodes.find(function(n) { return n.id === nodeEl.dataset.id; });
    ctxMenu.innerHTML =
      '<div class="ctx-item" data-action="add-child">Add Child</div>' +
      '<div class="ctx-item" data-action="add-note">Add Note</div>' +
      '<div class="ctx-sep"></div>' +
      '<div class="ctx-item" data-action="attach-link">Attach Link</div>' +
      '<div class="ctx-item" data-action="remove-link">Remove Link</div>' +
      '<div class="ctx-sep"></div>' +
      '<div class="ctx-item" data-action="delete-node" style="color:var(--red)">Delete Node</div>';
    ctxMenu.onclick = function(ev) {
      var action = ev.target.dataset.action;
      if (action === 'add-child') addChild(node);
      else if (action === 'add-note') addChild(node, true);
      else if (action === 'attach-link') { var u = prompt('Enter URL:'); if (u) { node.link = u; fullRender(); autoSave(); } }
      else if (action === 'remove-link') { node.link = ''; fullRender(); autoSave(); }
      else if (action === 'delete-node') deleteNodes(node.id);
      ctxMenu.classList.remove('visible');
    };
  } else {
    var pos = toCanvas(e);
    ctxMenu.innerHTML = '<div class="ctx-item" data-action="add-here">Add Node Here</div>';
    ctxMenu.onclick = function(ev) {
      if (ev.target.dataset.action === 'add-here') {
        var id = 'n' + (mapData.nid++);
        mapData.nodes.push(createNodeData(id, pos.x, pos.y, 'New Node', 0));
        fullRender(); pushUndo(); autoSave();
      }
      ctxMenu.classList.remove('visible');
    };
  }
  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.top = e.clientY + 'px';
  ctxMenu.classList.add('visible');
}

/* --- Unsaved changes modal --- */
function showUnsavedModal() {
  var old = document.getElementById('unsavedModal');
  if (old) old.remove();
  var m = document.createElement('div');
  m.id = 'unsavedModal';
  m.className = 'token-modal-overlay';
  m.innerHTML =
    '<div class="token-modal">' +
    '<h3>Unsaved Changes</h3>' +
    '<p>You have unsaved changes. Do you want to save before leaving?</p>' +
    '<div class="token-actions" style="justify-content:space-between">' +
    '<button class="tb-btn" id="unsavedCancel">Cancel</button>' +
    '<div style="display:flex;gap:8px">' +
    '<button class="tb-btn" id="unsavedLeave" style="color:var(--red)">Leave Without Saving</button>' +
    '<button class="tb-btn primary" id="unsavedSave">Save and Leave</button>' +
    '</div></div></div>';
  document.body.appendChild(m);
  document.getElementById('unsavedCancel').onclick = function() { m.remove(); };
  document.getElementById('unsavedLeave').onclick = function() {
    hasUnsavedChanges = false;
    window.location.href = 'projects.html';
  };
  document.getElementById('unsavedSave').onclick = async function() {
    var btn = document.getElementById('unsavedSave');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    cancelGhAutoSave();
    try {
      await saveMap(folder, mapName, mapData);
      hasUnsavedChanges = false;
      showToast('Saved to GitHub');
      window.location.href = 'projects.html';
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Save and Leave';
      showToast('Save failed: ' + err.message, true);
    }
  };
}

/* --- Wire toolbar buttons (called once at init) --- */
function setupToolbar() {
  document.getElementById('mapTitle').addEventListener('input', function(e) {
    mapData.title = e.target.value; hasUnsavedChanges = true; updateSaveDot('unsaved'); scheduleGhAutoSave(); autoSave();
  });
  document.getElementById('btnMyMaps').addEventListener('click', function() {
    if (hasUnsavedChanges) {
      showUnsavedModal();
    } else {
      window.location.href = 'projects.html';
    }
  });
  document.getElementById('btnAddNode').addEventListener('click', addNodeAtCenter);
  document.getElementById('btnSave').addEventListener('click', doSave);
  document.querySelectorAll('.color-swatch').forEach(function(sw) {
    sw.addEventListener('click', function() { recolorSelected(parseInt(sw.dataset.ci)); });
  });
}
