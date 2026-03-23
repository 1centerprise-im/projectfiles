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

  /* Save to GitHub */
  var token = localStorage.getItem('gh_pat') || '';
  if (!token) {
    showHomeTokenModal(function() { saveIndexViaAPI(); });
    return;
  }
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
