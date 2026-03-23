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
  var token = localStorage.getItem('gh_pat') || '';
  if (!token) {
    showHomeTokenModal(function() { saveIndexViaAPI(); });
    return;
  }
  showHomeToast('Saving...');
  await saveIndexViaAPI();
}

async function saveIndexViaAPI() {
  var token = localStorage.getItem('gh_pat') || '';
  if (!token) { showHomeToast('Set GitHub token first', true); return; }

  try {
    var path = 'maps/index.json';
    var apiUrl = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + path;
    var authHeaders = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

    /* Step 1: GET fresh SHA - never use cached */
    var sha = '';
    var getResp = await fetch(apiUrl, { headers: authHeaders, cache: 'no-store' });
    if (getResp.status === 401 || getResp.status === 403) {
      localStorage.removeItem('gh_pat');
      showHomeToast('Invalid token - please re-enter', true);
      showHomeTokenModal(function() { saveIndexViaAPI(); });
      return;
    }
    if (getResp.ok) { sha = (await getResp.json()).sha; }

    /* Step 2: PUT with fresh SHA */
    var content = btoa(unescape(encodeURIComponent(JSON.stringify(indexData, null, 2) + '\n')));
    var body = { message: 'Update project status', content: content };
    if (sha) body.sha = sha;

    var putResp = await fetch(apiUrl, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders),
      body: JSON.stringify(body)
    });

    if (putResp.status === 401 || putResp.status === 403) {
      localStorage.removeItem('gh_pat');
      showHomeToast('Invalid token - please re-enter', true);
      showHomeTokenModal(function() { saveIndexViaAPI(); });
      return;
    }
    if (!putResp.ok) {
      var err = await putResp.json().catch(function() { return {}; });
      throw new Error(err.message || 'HTTP ' + putResp.status);
    }
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

function showHomeTokenModal(onDone) {
  var old = document.getElementById('homeTokenModal');
  if (old) old.remove();
  var m = document.createElement('div');
  m.id = 'homeTokenModal';
  m.className = 'token-modal-overlay';
  m.innerHTML =
    '<div class="token-modal" style="background:#1f2937;color:#e5e7eb">' +
    '<h3 style="color:#fff">GitHub Access Token</h3>' +
    '<p>Enter your Personal Access Token to save changes to GitHub.</p>' +
    '<input type="password" id="homeTokenInput" placeholder="ghp_..." class="token-input" style="background:#111827;color:#fff;border-color:#374151">' +
    '<div class="token-actions">' +
    '<button class="tb-btn" style="color:#9ca3af" onclick="this.closest(\'.token-modal-overlay\').remove()">Cancel</button>' +
    '<button class="tb-btn primary" id="homeTokenSave">Save Token</button>' +
    '</div></div>';
  document.body.appendChild(m);
  document.getElementById('homeTokenSave').onclick = function() {
    var val = document.getElementById('homeTokenInput').value.trim();
    if (val) { localStorage.setItem('gh_pat', val); m.remove(); if (onDone) onDone(); }
  };
  document.getElementById('homeTokenInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('homeTokenSave').click();
  });
  setTimeout(function() { document.getElementById('homeTokenInput').focus(); }, 50);
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

  var token = localStorage.getItem('gh_pat') || '';
  if (!token) {
    showHomeTokenModal(function() { createNewMap(modal); });
    return;
  }

  showHomeToast('Creating...');
  var authHeaders = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

  try {
    /* Step 1: Fetch FRESH index.json from GitHub API (not cached page version) */
    var indexPath = 'maps/index.json';
    var indexUrl = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + indexPath;
    var indexSha = '';
    var getIdx = await fetch(indexUrl, { headers: authHeaders, cache: 'no-store' });
    if (getIdx.status === 401 || getIdx.status === 403) {
      localStorage.removeItem('gh_pat');
      showHomeToast('Invalid token', true);
      return;
    }
    if (getIdx.ok) {
      var idxData = await getIdx.json();
      indexSha = idxData.sha;
      /* Decode the fresh content from GitHub */
      var freshContent = decodeURIComponent(escape(atob(idxData.content.replace(/\n/g, ''))));
      indexData = JSON.parse(freshContent);
    }

    /* Step 2: Add new map entry to the fresh data */
    var newMapEntry = { id: cleanMapName, name: rawMapName, number: '', organization: '', status: 'active' };

    if (isNewFolder) {
      indexData.folders.push({ name: folderName, label: folderLabel, maps: [newMapEntry] });
    } else {
      var folder = indexData.folders.find(function(fd) { return fd.name === folderName; });
      if (folder) folder.maps.push(newMapEntry);
    }

    /* Step 3: PUT updated index.json with fresh SHA */
    var indexContent = btoa(unescape(encodeURIComponent(JSON.stringify(indexData, null, 2) + '\n')));
    var idxBody = { message: 'Add new map ' + cleanMapName, content: indexContent };
    if (indexSha) idxBody.sha = indexSha;

    var putIdx = await fetch(indexUrl, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders),
      body: JSON.stringify(idxBody)
    });
    if (!putIdx.ok) {
      var idxErr = await putIdx.json().catch(function() { return {}; });
      throw new Error('Index: ' + (idxErr.message || 'HTTP ' + putIdx.status));
    }

    /* Create the empty map JSON file - GET SHA first (likely 404 for new file) */
    var mapPath = 'maps/' + folderName + '/' + cleanMapName + '.json';
    var mapUrl = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + mapPath;
    var mapSha = '';
    var getMap = await fetch(mapUrl, { headers: authHeaders, cache: 'no-store' });
    if (getMap.ok) { mapSha = (await getMap.json()).sha; }

    var emptyMap = {
      title: rawMapName,
      nodes: [{ id: 'n1', x: 400, y: 300, w: 0, h: 0, text: rawMapName, ci: 0, link: '',
        collapsed: false, isNote: false, fontSize: 16, fontFamily: 'Nunito',
        textColor: '#2a2520', bold: true, italic: false, textAlign: 'center',
        shape: 'rounded', borderColor: '', borderWidth: 0 }],
      edges: [], nid: 2, edgeThickness: 1.5, edgeColor: '#c8c0b8'
    };
    var mapContent = btoa(unescape(encodeURIComponent(JSON.stringify(emptyMap, null, 2))));
    var mapBody = { message: 'Create map ' + cleanMapName, content: mapContent };
    if (mapSha) mapBody.sha = mapSha;

    var putMap = await fetch(mapUrl, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders),
      body: JSON.stringify(mapBody)
    });
    if (!putMap.ok) {
      var mapErr = await putMap.json().catch(function() { return {}; });
      throw new Error('Map: ' + (mapErr.message || 'HTTP ' + putMap.status));
    }

    modal.remove();
    showHomeToast('Map created!');
    /* Redirect to editor */
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
