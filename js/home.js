/* ============================================================
   HOME.JS - Logic for projects.html
   Fetches maps/index.json, renders the project table,
   handles search/filter, status change via GitHub API.
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);

var allProjects = [];
var indexData = null; /* raw index.json for GitHub save */

/* GitHub config (matches storage.js) */
var GH_OWNER = '1centerprise-im';
var GH_REPO = 'projectfiles';

async function init() {
  var body = document.getElementById('projectsBody');
  if (!body) return;

  try {
    var resp = await fetch('maps/index.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    indexData = await resp.json();

    indexData.folders.forEach(function(folder) {
      if (folder.maps.length === 0) {
        allProjects.push({
          folder: folder.name, folderLabel: folder.label,
          id: null, name: folder.label, number: '',
          organization: '', status: '', empty: true
        });
      } else {
        folder.maps.forEach(function(m) {
          allProjects.push({
            folder: folder.name, folderLabel: folder.label,
            id: m.id, name: m.name, number: m.number || '',
            organization: m.organization || '',
            status: (m.status || '').toLowerCase(),
            empty: false
          });
        });
      }
    });

    document.getElementById('searchInput').addEventListener('input', renderTable);
    document.getElementById('statusFilter').addEventListener('change', renderTable);
    document.getElementById('btnNewMap').addEventListener('click', showNewMapModal);
    renderTable();
  } catch (err) {
    body.innerHTML = '<tr><td colspan="4" style="color:#ef4444;padding:20px;">Failed to load project data</td></tr>';
    console.error(err);
  }
}

function renderTable() {
  var body = document.getElementById('projectsBody');
  var search = (document.getElementById('searchInput').value || '').toLowerCase();
  var statusVal = document.getElementById('statusFilter').value;

  var filtered = allProjects.filter(function(p) {
    if (p.empty) return true;
    var matchSearch = !search ||
      p.name.toLowerCase().indexOf(search) !== -1 ||
      p.number.toLowerCase().indexOf(search) !== -1;
    var matchStatus = !statusVal || p.status === statusVal;
    return matchSearch && matchStatus;
  });

  filtered.sort(function(a, b) {
    if (a.empty !== b.empty) return a.empty ? 1 : -1;
    return 0;
  });

  body.innerHTML = '';
  var count = 0;

  filtered.forEach(function(p) {
    var tr = document.createElement('tr');

    if (p.empty) {
      tr.className = 'project-row empty-row';
      tr.innerHTML =
        '<td class="col-num"></td>' +
        '<td class="col-name"><span class="project-name-text">' + esc(p.folderLabel) + '</span></td>' +
        '<td class="col-status"><span class="muted-text">No maps yet</span></td>' +
        '<td class="col-action"></td>';
    } else {
      count++;
      tr.className = 'project-row';
      var statusHtml = '<span class="status-badge status-' + esc(p.status) +
        '" data-project-id="' + esc(p.id) + '" data-folder="' + esc(p.folder) +
        '" style="cursor:pointer" title="Click to change status">' +
        capitalize(p.status) + '</span>';
      tr.innerHTML =
        '<td class="col-num">' + esc(p.number) + '</td>' +
        '<td class="col-name"><span class="project-name-text">' + esc(p.name) + '</span></td>' +
        '<td class="col-status">' + statusHtml + '</td>' +
        '<td class="col-action"><a href="editor.html?folder=' + encodeURIComponent(p.folder) + '&map=' + encodeURIComponent(p.id) + '" class="open-link">OPEN</a></td>';

      tr.style.cursor = 'pointer';
      tr.addEventListener('click', function(e) {
        if (e.target.tagName === 'A' || e.target.closest('.status-badge') || e.target.closest('.status-dropdown')) return;
        window.location.href = 'editor.html?folder=' + encodeURIComponent(p.folder) + '&map=' + encodeURIComponent(p.id);
      });
    }

    body.appendChild(tr);
  });

  /* Wire up status badge clicks */
  body.querySelectorAll('.status-badge').forEach(function(badge) {
    badge.addEventListener('click', function(e) {
      e.stopPropagation();
      showStatusDropdown(badge);
    });
  });

  document.getElementById('projectCount').textContent = count + ' project' + (count !== 1 ? 's' : '');
}

function showStatusDropdown(badge) {
  /* Remove any existing dropdown */
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

  /* Position dropdown below the badge */
  var rect = badge.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';
  document.body.appendChild(dd);

  /* Close on click outside */
  setTimeout(function() {
    document.addEventListener('click', function closeDD() {
      dd.remove();
      document.removeEventListener('click', closeDD);
    }, { once: true });
  }, 10);
}

async function changeStatus(folderName, projectId, newStatus) {
  /* Update local data */
  var project = allProjects.find(function(p) { return p.id === projectId && p.folder === folderName; });
  if (project) project.status = newStatus;

  /* Update indexData */
  indexData.folders.forEach(function(f) {
    if (f.name === folderName) {
      f.maps.forEach(function(m) {
        if (m.id === projectId) m.status = newStatus;
      });
    }
  });

  renderTable();

  /* Save to GitHub immediately */
  showHomeToast('Saving...');
  await saveIndexViaAPI();
}

async function saveIndexViaAPI() {
  try {
    await saveIndex(indexData);
    showHomeToast('Status updated');
  } catch (err) {
    showHomeToast('Failed: ' + err.message, true);
  }
}

function showHomeToast(msg, isError) {
  var old = document.getElementById('homeToast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.id = 'homeToast';
  t.className = 'toast' + (isError ? ' toast-error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('visible'); }, 10);
  setTimeout(function() { t.classList.remove('visible'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

/* ============================================================
   NEW MAP MODAL
   ============================================================ */
function showNewMapModal() {
  var old = document.getElementById('newMapModal');
  if (old) old.remove();

  var folderOpts = '';
  indexData.folders.forEach(function(f) {
    folderOpts += '<option value="' + esc(f.name) + '">' + esc(f.label) + '</option>';
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
  document.getElementById('nmCreate').onclick = function() { createNewMap(m); };
}

async function createNewMap(modal) {
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
    /* Use storage.js createNewMapOnGitHub - handles index + map file */
    await createNewMapOnGitHub(folderName, cleanMapName, rawMapName, folderLabel);
    modal.remove();
    showHomeToast('Map created!');
    window.location.href = 'editor.html?folder=' + encodeURIComponent(folderName) + '&map=' + encodeURIComponent(cleanMapName);
  } catch (err) {
    showHomeToast('Failed: ' + err.message, true);
  }
}

function capitalize(str) {
  if (!str) return '';
  if (str === 'on-process') return 'On-Process';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
