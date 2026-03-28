/* ============================================================
   HOME.JS - Logic for projects.html
   Folder-based file browser with drag-and-drop.
   Requires storage.js to be loaded first.
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);

var indexData = null;
var currentFolder = null; // null = root view, string = inside that folder

async function init() {
  var body = document.getElementById('projectsBody');
  if (!body) return;

  try {
    indexData = await loadIndex();
    wireEvents();
    checkUrlParams();
    render();
  } catch (err) {
    body.innerHTML = '<tr><td colspan="5" style="color:#ef4444;padding:20px;">Failed to load project data</td></tr>';
    console.error(err);
  }
}

function wireEvents() {
  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('statusFilter').addEventListener('change', render);
  document.getElementById('btnNewMap').addEventListener('click', showNewMapModal);
  document.getElementById('btnNewFolder').addEventListener('click', showNewFolderModal);
  document.getElementById('breadcrumbBack').addEventListener('click', function(e) {
    e.preventDefault();
    currentFolder = null;
    render();
  });
  // Close any open context menu on click
  document.addEventListener('click', function() {
    var cm = document.getElementById('projectCtxMenu');
    if (cm) cm.remove();
  });
}

/* ============================================================
   MAIN RENDER
   ============================================================ */
function render() {
  var search = (document.getElementById('searchInput').value || '').toLowerCase();
  var statusVal = document.getElementById('statusFilter').value;
  var breadcrumb = document.getElementById('breadcrumb');
  var foldersGrid = document.getElementById('foldersGrid');
  var rootDropZone = document.getElementById('rootDropZone');
  var headerLabel = document.getElementById('headerLabel');
  var headerTitle = document.getElementById('headerTitle');

  if (currentFolder === null) {
    /* ---- ROOT VIEW ---- */
    breadcrumb.style.display = 'none';
    rootDropZone.style.display = 'none';
    headerLabel.textContent = 'ALL PROJECTS';
    headerTitle.textContent = 'Project Files';
    renderFolderCards(foldersGrid, search);
    renderMapsTable(null, search, statusVal);
  } else {
    /* ---- INSIDE A FOLDER ---- */
    var folder = indexData.folders.find(function(f) { return f.name === currentFolder; });
    breadcrumb.style.display = 'flex';
    document.getElementById('breadcrumbFolder').textContent = folder ? folder.label : currentFolder;
    foldersGrid.innerHTML = '';
    rootDropZone.style.display = 'block';
    headerLabel.textContent = 'FOLDER';
    headerTitle.textContent = folder ? folder.label : currentFolder;
    renderMapsTable(currentFolder, search, statusVal);
    setupRootDropZone();
  }
}

/* ============================================================
   FOLDER CARDS (root view)
   ============================================================ */
function renderFolderCards(container, search) {
  container.innerHTML = '';

  // If searching, show all matching maps across all folders instead of folder cards
  if (search) {
    container.innerHTML = '';
    return; // search results shown in the table below
  }

  indexData.folders.forEach(function(folder) {
    var card = document.createElement('div');
    card.className = 'folder-card';
    card.dataset.folder = folder.name;

    var mapCount = folder.maps.length;
    card.innerHTML =
      '<div class="folder-card-icon">' + folderSvg() + '</div>' +
      '<div class="folder-card-info">' +
        '<span class="folder-card-name">' + esc(folder.label) + '</span>' +
        '<span class="folder-card-count">' + mapCount + ' map' + (mapCount !== 1 ? 's' : '') + '</span>' +
      '</div>' +
      '<span class="share-btn folder-share-btn" title="Copy share link">' + linkSvg() + '</span>' +
      '<span class="delete-btn folder-delete-btn" data-folder="' + esc(folder.name) +
      '" title="Delete folder">&times;</span>';

    // Click to open folder
    card.addEventListener('click', function(e) {
      if (e.target.closest('.delete-btn') || e.target.closest('.share-btn')) return;
      currentFolder = folder.name;
      render();
    });

    // Share folder link
    card.querySelector('.share-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      copyShareLink(getFolderShareUrl(folder.name));
    });

    // Right-click context menu on folder
    card.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      showProjectCtxMenu(e.clientX, e.clientY, getFolderShareUrl(folder.name));
    });

    // Delete folder
    card.querySelector('.delete-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      confirmDeleteFolder(folder.name);
    });

    // Drop target: accept dragged maps
    card.addEventListener('dragover', function(e) {
      e.preventDefault();
      card.classList.add('folder-card-dragover');
    });
    card.addEventListener('dragleave', function(e) {
      card.classList.remove('folder-card-dragover');
    });
    card.addEventListener('drop', function(e) {
      e.preventDefault();
      card.classList.remove('folder-card-dragover');
      handleMapDrop(e, folder.name, folder.label);
    });

    container.appendChild(card);
  });
}

function folderSvg() {
  return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
}

/* ============================================================
   MAPS TABLE
   ============================================================ */
function renderMapsTable(folderName, search, statusVal) {
  var body = document.getElementById('projectsBody');
  body.innerHTML = '';
  var count = 0;
  var maps = [];

  if (folderName !== null) {
    // Inside a specific folder
    var folder = indexData.folders.find(function(f) { return f.name === folderName; });
    if (folder) {
      folder.maps.forEach(function(m) {
        maps.push({ folder: folder.name, folderLabel: folder.label, map: m });
      });
    }
  } else if (search) {
    // Searching: show all maps across all folders
    indexData.folders.forEach(function(folder) {
      folder.maps.forEach(function(m) {
        maps.push({ folder: folder.name, folderLabel: folder.label, map: m });
      });
    });
  } else {
    // Root view, no search: don't show maps in folders (they're in folder cards)
    // Only show root-level maps if any exist (currently the structure doesn't have root maps)
    // This is here for future-proofing
  }

  // Filter
  maps = maps.filter(function(item) {
    var m = item.map;
    var matchSearch = !search ||
      m.name.toLowerCase().indexOf(search) !== -1 ||
      (m.number || '').toLowerCase().indexOf(search) !== -1 ||
      item.folderLabel.toLowerCase().indexOf(search) !== -1;
    var matchStatus = !statusVal || (m.status || '').toLowerCase() === statusVal;
    return matchSearch && matchStatus;
  });

  maps.forEach(function(item) {
    var m = item.map;
    count++;
    var tr = document.createElement('tr');
    tr.className = 'project-row';
    tr.draggable = true;
    tr.dataset.mapId = m.id;
    tr.dataset.folder = item.folder;
    tr.dataset.mapName = m.name;

    var statusHtml = '<span class="status-badge status-' + esc((m.status || '').toLowerCase()) +
      '" data-project-id="' + esc(m.id) + '" data-folder="' + esc(item.folder) +
      '" style="cursor:pointer" title="Click to change status">' +
      capitalize(m.status || '') + '</span>';

    var folderTag = search ? '<span class="map-folder-tag">' + esc(item.folderLabel) + '</span>' : '';

    var viewUrl = getMapViewUrl(item.folder, m.id);
    tr.innerHTML =
      '<td class="col-num">' + esc(m.number || '') + '</td>' +
      '<td class="col-name"><span class="project-name-text">' + esc(m.name) + '</span>' + folderTag + '</td>' +
      '<td class="col-status">' + statusHtml + '</td>' +
      '<td class="col-action">' +
        '<span class="share-btn row-share-btn" title="Copy share link">' + linkSvg() + '</span>' +
        '<a href="editor.html?folder=' + encodeURIComponent(item.folder) +
        '&map=' + encodeURIComponent(m.id) + '" class="open-link">OPEN</a></td>' +
      '<td class="col-delete"><span class="delete-btn" data-folder="' + esc(item.folder) +
      '" data-map-id="' + esc(m.id) + '" data-map-name="' + esc(m.name) +
      '" data-type="map" title="Delete map">&times;</span></td>';

    // Share map link
    tr.querySelector('.share-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      copyShareLink(viewUrl);
    });

    // Right-click context menu on map row
    tr.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      showProjectCtxMenu(e.clientX, e.clientY, viewUrl);
    });

    // Click row to open map
    tr.addEventListener('click', function(e) {
      if (e.target.tagName === 'A' || e.target.closest('.status-badge') ||
          e.target.closest('.status-dropdown') || e.target.closest('.delete-btn') ||
          e.target.closest('.share-btn')) return;
      window.location.href = 'editor.html?folder=' + encodeURIComponent(item.folder) + '&map=' + encodeURIComponent(m.id);
    });

    // Drag start
    tr.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('application/x-map-id', m.id);
      e.dataTransfer.setData('application/x-map-folder', item.folder);
      e.dataTransfer.setData('application/x-map-name', m.name);
      e.dataTransfer.effectAllowed = 'move';
      tr.classList.add('dragging-row');
    });
    tr.addEventListener('dragend', function() {
      tr.classList.remove('dragging-row');
    });

    body.appendChild(tr);
  });

  // Wire status badges
  body.querySelectorAll('.status-badge').forEach(function(badge) {
    badge.addEventListener('click', function(e) {
      e.stopPropagation();
      showStatusDropdown(badge);
    });
  });

  // Wire delete buttons
  body.querySelectorAll('.delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      confirmDeleteMap(btn.dataset.folder, btn.dataset.mapId, btn.dataset.mapName);
    });
  });

  document.getElementById('projectCount').textContent = count + ' project' + (count !== 1 ? 's' : '');
}

/* ============================================================
   ROOT DROP ZONE (when inside a folder)
   ============================================================ */
var _rootDropZoneWired = false;
function setupRootDropZone() {
  if (_rootDropZoneWired) return;
  _rootDropZoneWired = true;
  var zone = document.getElementById('rootDropZone');
  zone.addEventListener('dragover', function(e) {
    e.preventDefault();
    zone.classList.add('root-drop-zone-active');
  });
  zone.addEventListener('dragleave', function() {
    zone.classList.remove('root-drop-zone-active');
  });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('root-drop-zone-active');
    // "Root level" isn't supported in the current folder structure,
    // so dropping here shows available folders to move to
    var mapId = e.dataTransfer.getData('application/x-map-id');
    var fromFolder = e.dataTransfer.getData('application/x-map-folder');
    var mapName = e.dataTransfer.getData('application/x-map-name');
    if (!mapId || !fromFolder) return;
    showMoveToFolderModal(mapId, fromFolder, mapName);
  });
}

/* ============================================================
   DRAG & DROP: Move map to folder
   ============================================================ */
async function handleMapDrop(e, toFolder, toFolderLabel) {
  var mapId = e.dataTransfer.getData('application/x-map-id');
  var fromFolder = e.dataTransfer.getData('application/x-map-folder');
  var mapName = e.dataTransfer.getData('application/x-map-name');

  if (!mapId || !fromFolder) return;
  if (fromFolder === toFolder) {
    showHomeToast('Already in this folder');
    return;
  }

  showHomeToast('Moving...');
  try {
    indexData = await moveMapToFolder(mapId, fromFolder, toFolder, toFolderLabel);
    render();
    showHomeToast('Moved \'' + mapName + '\' to ' + toFolderLabel);
  } catch (err) {
    showHomeToast('Move failed: ' + err.message, true);
  }
}

/* Move-to-folder modal (when dropping on root zone or clicking move button) */
function showMoveToFolderModal(mapId, fromFolder, mapName) {
  var old = document.getElementById('moveFolderModal');
  if (old) old.remove();

  var opts = '';
  indexData.folders.forEach(function(f) {
    if (f.name !== fromFolder) {
      opts += '<div class="move-folder-option" data-folder="' + esc(f.name) +
        '" data-label="' + esc(f.label) + '">' +
        folderSvg() + ' ' + esc(f.label) + '</div>';
    }
  });

  if (!opts) {
    showHomeToast('No other folders to move to');
    return;
  }

  var m = document.createElement('div');
  m.id = 'moveFolderModal';
  m.className = 'token-modal-overlay';
  m.innerHTML =
    '<div class="newmap-modal">' +
    '<h3>Move "' + esc(mapName) + '" to...</h3>' +
    '<div class="move-folder-list">' + opts + '</div>' +
    '<div class="newmap-actions">' +
    '<button class="btn-cancel" id="moveCancel">Cancel</button>' +
    '</div></div>';
  document.body.appendChild(m);

  document.getElementById('moveCancel').onclick = function() { m.remove(); };
  m.querySelectorAll('.move-folder-option').forEach(function(opt) {
    opt.addEventListener('click', async function() {
      var toFolder = opt.dataset.folder;
      var toLabel = opt.dataset.label;
      m.remove();
      showHomeToast('Moving...');
      try {
        indexData = await moveMapToFolder(mapId, fromFolder, toFolder, toLabel);
        render();
        showHomeToast('Moved \'' + mapName + '\' to ' + toLabel);
      } catch (err) {
        showHomeToast('Move failed: ' + err.message, true);
      }
    });
  });
}

/* ============================================================
   STATUS CHANGE
   ============================================================ */
function showStatusDropdown(badge) {
  var old = document.querySelector('.status-dropdown');
  if (old) old.remove();

  var projectId = badge.dataset.projectId;
  var folderName = badge.dataset.folder;
  var statuses = ['active', 'completed', 'on-process'];

  var dd = document.createElement('div');
  dd.className = 'status-dropdown';
  statuses.forEach(function(s) {
    var item = document.createElement('div');
    item.className = 'status-dropdown-item';
    item.textContent = capitalize(s);
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      dd.remove();
      changeStatus(folderName, projectId, s);
    });
    dd.appendChild(item);
  });

  var rect = badge.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';
  document.body.appendChild(dd);

  setTimeout(function() {
    document.addEventListener('click', function closeDD() {
      dd.remove();
      document.removeEventListener('click', closeDD);
    }, { once: true });
  }, 10);
}

async function changeStatus(folderName, projectId, newStatus) {
  indexData.folders.forEach(function(f) {
    if (f.name === folderName) {
      f.maps.forEach(function(m) {
        if (m.id === projectId) m.status = newStatus;
      });
    }
  });
  render();
  showHomeToast('Saving...');
  try {
    await saveIndex(indexData);
    showHomeToast('Status updated');
  } catch (err) {
    showHomeToast('Failed: ' + err.message, true);
  }
}

/* ============================================================
   DELETE MAP / FOLDER
   ============================================================ */
function confirmDeleteMap(folder, mapId, mapName) {
  var old = document.getElementById('deleteModal');
  if (old) old.remove();

  var m = document.createElement('div');
  m.id = 'deleteModal';
  m.className = 'token-modal-overlay';
  m.innerHTML =
    '<div class="newmap-modal">' +
    '<h3>Delete Map</h3>' +
    '<p style="color:#ccc;margin:12px 0">Delete <strong>' + esc(mapName) + '</strong>? This cannot be undone.</p>' +
    '<div class="newmap-actions">' +
    '<button class="btn-cancel" id="delCancel">Cancel</button>' +
    '<button class="btn-delete-confirm" id="delConfirm">Delete</button>' +
    '</div></div>';
  document.body.appendChild(m);

  document.getElementById('delCancel').onclick = function() { m.remove(); };
  document.getElementById('delConfirm').onclick = async function() {
    m.remove();
    showHomeToast('Deleting...');
    try {
      await deleteMap(folder, mapId);
      indexData.folders.forEach(function(f) {
        if (f.name === folder) {
          f.maps = f.maps.filter(function(mp) { return mp.id !== mapId; });
        }
      });
      render();
      showHomeToast('Map deleted');
    } catch (err) {
      showHomeToast('Delete failed: ' + err.message, true);
    }
  };
}

function confirmDeleteFolder(folderName) {
  var folder = indexData.folders.find(function(f) { return f.name === folderName; });
  var mapCount = folder ? folder.maps.length : 0;

  var old = document.getElementById('deleteModal');
  if (old) old.remove();

  var warning = mapCount > 0
    ? '<p style="color:#f97316;margin:8px 0;font-size:0.85rem">This folder contains ' + mapCount + ' map' + (mapCount !== 1 ? 's' : '') + '. They will also be deleted.</p>'
    : '';

  var m = document.createElement('div');
  m.id = 'deleteModal';
  m.className = 'token-modal-overlay';
  m.innerHTML =
    '<div class="newmap-modal">' +
    '<h3>Delete Folder</h3>' +
    '<p style="color:#ccc;margin:12px 0">Delete folder <strong>' + esc(folderName) + '</strong>? This cannot be undone.</p>' +
    warning +
    '<div class="newmap-actions">' +
    '<button class="btn-cancel" id="delCancel">Cancel</button>' +
    '<button class="btn-delete-confirm" id="delConfirm">Delete</button>' +
    '</div></div>';
  document.body.appendChild(m);

  document.getElementById('delCancel').onclick = function() { m.remove(); };
  document.getElementById('delConfirm').onclick = async function() {
    m.remove();
    showHomeToast('Deleting...');
    try {
      await deleteFolder(folderName);
      indexData.folders = indexData.folders.filter(function(f) { return f.name !== folderName; });
      if (currentFolder === folderName) currentFolder = null;
      render();
      showHomeToast('Folder deleted');
    } catch (err) {
      showHomeToast('Delete failed: ' + err.message, true);
    }
  };
}

/* ============================================================
   NEW FOLDER MODAL
   ============================================================ */
function showNewFolderModal() {
  var old = document.getElementById('newFolderModal');
  if (old) old.remove();

  var m = document.createElement('div');
  m.id = 'newFolderModal';
  m.className = 'token-modal-overlay';
  m.innerHTML =
    '<div class="newmap-modal">' +
    '<h3>Create New Folder</h3>' +
    '<label>Folder Name</label>' +
    '<input type="text" id="nfName" placeholder="e.g. Consultancy">' +
    '<div class="newmap-actions">' +
    '<button class="btn-cancel" id="nfCancel">Cancel</button>' +
    '<button class="btn-create" id="nfCreate">Create</button>' +
    '</div></div>';
  document.body.appendChild(m);

  document.getElementById('nfCancel').onclick = function() { m.remove(); };
  document.getElementById('nfCreate').onclick = async function() {
    var label = document.getElementById('nfName').value.trim();
    if (!label) { showHomeToast('Enter a folder name', true); return; }
    var name = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!name) { showHomeToast('Invalid folder name', true); return; }

    // Check duplicate
    if (indexData.folders.find(function(f) { return f.name === name; })) {
      showHomeToast('Folder already exists', true);
      return;
    }

    showHomeToast('Creating...');
    try {
      await createFolder(name, label);
      indexData.folders.push({ name: name, label: label, maps: [] });
      m.remove();
      render();
      showHomeToast('Folder created');
    } catch (err) {
      showHomeToast('Failed: ' + err.message, true);
    }
  };

  document.getElementById('nfName').focus();
}

/* ============================================================
   NEW MAP MODAL
   ============================================================ */
function showNewMapModal() {
  var old = document.getElementById('newMapModal');
  if (old) old.remove();

  // If inside a folder, pre-select it
  var folderOpts = '';
  indexData.folders.forEach(function(f) {
    var sel = (currentFolder && f.name === currentFolder) ? ' selected' : '';
    folderOpts += '<option value="' + esc(f.name) + '"' + sel + '>' + esc(f.label) + '</option>';
  });

  var m = document.createElement('div');
  m.id = 'newMapModal';
  m.className = 'token-modal-overlay';
  m.innerHTML =
    '<div class="newmap-modal">' +
    '<h3>Create New Map</h3>' +
    '<label>Folder</label>' +
    '<div id="nmFolderWrap">' +
    '<select id="nmFolderSelect">' + folderOpts + '</select>' +
    '<span class="newmap-link" id="nmNewFolderLink">+ Create new folder</span>' +
    '</div>' +
    '<div id="nmNewFolderWrap" style="display:none">' +
    '<input type="text" id="nmNewFolderInput" placeholder="New folder name">' +
    '<span class="newmap-link" id="nmBackToList">&larr; Back to list</span>' +
    '</div>' +
    '<label>Map Name</label>' +
    '<input type="text" id="nmMapName" placeholder="e.g. 076_New_Project">' +
    '<div class="newmap-actions">' +
    '<button class="btn-cancel" id="nmCancel">Cancel</button>' +
    '<button class="btn-create" id="nmCreate">Create</button>' +
    '</div></div>';
  document.body.appendChild(m);

  document.getElementById('nmCancel').onclick = function() { m.remove(); };
  document.getElementById('nmNewFolderLink').onclick = function() {
    document.getElementById('nmFolderWrap').style.display = 'none';
    document.getElementById('nmNewFolderWrap').style.display = 'block';
    document.getElementById('nmNewFolderInput').focus();
  };
  document.getElementById('nmBackToList').onclick = function() {
    document.getElementById('nmNewFolderWrap').style.display = 'none';
    document.getElementById('nmFolderWrap').style.display = 'block';
  };
  document.getElementById('nmCreate').onclick = function() { handleCreateMap(m); };
}

async function handleCreateMap(modal) {
  var isNewFolder = document.getElementById('nmNewFolderWrap').style.display !== 'none';
  var folderName, folderLabel;

  if (isNewFolder) {
    folderLabel = document.getElementById('nmNewFolderInput').value.trim();
    if (!folderLabel) { showHomeToast('Enter a folder name', true); return; }
    folderName = folderLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  } else {
    folderName = document.getElementById('nmFolderSelect').value;
    var f = indexData.folders.find(function(fd) { return fd.name === folderName; });
    folderLabel = f ? f.label : folderName;
  }

  var rawMapName = document.getElementById('nmMapName').value.trim();
  if (!rawMapName) { showHomeToast('Enter a map name', true); return; }
  var cleanMapName = rawMapName.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!cleanMapName) { showHomeToast('Invalid map name', true); return; }

  showHomeToast('Creating...');
  try {
    await createMap(folderName, cleanMapName, rawMapName, folderLabel);
    modal.remove();
    showHomeToast('Map created!');
    window.location.href = 'editor.html?folder=' + encodeURIComponent(folderName) + '&map=' + encodeURIComponent(cleanMapName);
  } catch (err) {
    showHomeToast('Failed: ' + err.message, true);
  }
}

/* ============================================================
   TOAST
   ============================================================ */
function showHomeToast(msg, isError) {
  var old = document.getElementById('homeToast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.id = 'homeToast';
  t.className = 'toast' + (isError ? ' toast-error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('visible'); }, 10);
  if (msg !== 'Creating...' && msg !== 'Saving...' && msg !== 'Deleting...' && msg !== 'Moving...') {
    setTimeout(function() { t.classList.remove('visible'); setTimeout(function() { t.remove(); }, 300); }, 3000);
  }
}

/* ============================================================
   HELPERS
   ============================================================ */
function capitalize(str) {
  if (!str) return '';
  if (str === 'on-process') return 'On-Process';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function esc(str) {
  var d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

/* ============================================================
   SHARE LINK HELPERS
   ============================================================ */
function linkSvg() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
}

function getBaseUrl() {
  return window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
}

function getFolderShareUrl(folderName) {
  return getBaseUrl() + 'projects.html?folder=' + encodeURIComponent(folderName);
}

function getMapViewUrl(folderName, mapId) {
  return getBaseUrl() + 'editor.html?folder=' + encodeURIComponent(folderName) +
    '&map=' + encodeURIComponent(mapId) + '&mode=view';
}

function copyShareLink(url) {
  navigator.clipboard.writeText(url).then(function() {
    showHomeToast('Link copied!');
  }).catch(function() {
    // Fallback
    var ta = document.createElement('textarea');
    ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    showHomeToast('Link copied!');
  });
}

/* ============================================================
   RIGHT-CLICK CONTEXT MENU
   ============================================================ */
function showProjectCtxMenu(x, y, shareUrl) {
  var old = document.getElementById('projectCtxMenu');
  if (old) old.remove();

  var menu = document.createElement('div');
  menu.id = 'projectCtxMenu';
  menu.className = 'project-ctx-menu';
  menu.innerHTML =
    '<div class="project-ctx-item" data-action="copy">' + linkSvg() + ' Copy share link</div>' +
    '<div class="project-ctx-item" data-action="newtab">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
      ' Open in new tab</div>';

  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  document.body.appendChild(menu);

  // Adjust if overflows viewport
  var rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';

  menu.querySelector('[data-action="copy"]').addEventListener('click', function(e) {
    e.stopPropagation();
    copyShareLink(shareUrl);
    menu.remove();
  });
  menu.querySelector('[data-action="newtab"]').addEventListener('click', function(e) {
    e.stopPropagation();
    window.open(shareUrl, '_blank');
    menu.remove();
  });
}

/* ============================================================
   URL PARAMS: open folder from share link
   ============================================================ */
function checkUrlParams() {
  var params = new URLSearchParams(window.location.search);
  var folderParam = params.get('folder');
  if (folderParam && indexData.folders.find(function(f) { return f.name === folderParam; })) {
    currentFolder = folderParam;
  }
}
