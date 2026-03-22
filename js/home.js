/* ============================================================
   HOME.JS - Logic for projects.html
   Fetches maps/index.json, renders the project table,
   handles search/filter, navigates to editor.
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);

var allProjects = [];

async function init() {
  var body = document.getElementById('projectsBody');
  if (!body) return; // not on projects.html

  try {
    var resp = await fetch('maps/index.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();

    // Flatten all maps into a single list with folder info
    data.folders.forEach(function(folder) {
      if (folder.maps.length === 0) {
        allProjects.push({
          folder: folder.name,
          folderLabel: folder.label,
          id: null,
          name: folder.label,
          number: '',
          organization: '',
          status: '',
          empty: true
        });
      } else {
        folder.maps.forEach(function(m) {
          allProjects.push({
            folder: folder.name,
            folderLabel: folder.label,
            id: m.id,
            name: m.name,
            number: m.number || '',
            organization: m.organization || '',
            status: (m.status || '').toLowerCase(),
            empty: false
          });
        });
      }
    });

    // Populate organization filter
    var orgs = [];
    allProjects.forEach(function(p) {
      if (p.organization && orgs.indexOf(p.organization) === -1) orgs.push(p.organization);
    });
    orgs.sort();
    var orgFilter = document.getElementById('orgFilter');
    orgs.forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      orgFilter.appendChild(opt);
    });

    // Bind events
    document.getElementById('searchInput').addEventListener('input', renderTable);
    document.getElementById('orgFilter').addEventListener('change', renderTable);
    document.getElementById('statusFilter').addEventListener('change', renderTable);

    renderTable();
  } catch (err) {
    body.innerHTML = '<tr><td colspan="5" style="color:#ef4444;padding:20px;">Failed to load project data</td></tr>';
    console.error(err);
  }
}

function renderTable() {
  var body = document.getElementById('projectsBody');
  var search = (document.getElementById('searchInput').value || '').toLowerCase();
  var orgVal = document.getElementById('orgFilter').value;
  var statusVal = document.getElementById('statusFilter').value;

  var filtered = allProjects.filter(function(p) {
    if (p.empty) return true; // always show empty folders
    var matchSearch = !search ||
      p.name.toLowerCase().indexOf(search) !== -1 ||
      p.organization.toLowerCase().indexOf(search) !== -1 ||
      p.number.toLowerCase().indexOf(search) !== -1;
    var matchOrg = !orgVal || p.organization === orgVal;
    var matchStatus = !statusVal || p.status === statusVal;
    return matchSearch && matchOrg && matchStatus;
  });

  // Sort: non-empty first (active first), then empty folders at bottom
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
        '<td class="col-org" colspan="2"><span class="muted-text">No maps yet</span></td>' +
        '<td class="col-action"></td>';
    } else {
      count++;
      tr.className = 'project-row';
      tr.innerHTML =
        '<td class="col-num">' + esc(p.number) + '</td>' +
        '<td class="col-name"><span class="project-name-text">' + esc(p.name) + '</span></td>' +
        '<td class="col-org">' + esc(p.organization) + '</td>' +
        '<td class="col-status"><span class="status-badge status-' + esc(p.status) + '">' + capitalize(p.status) + '</span></td>' +
        '<td class="col-action"><a href="editor.html?folder=' + encodeURIComponent(p.folder) + '&map=' + encodeURIComponent(p.id) + '" class="open-link">OPEN</a></td>';

      tr.style.cursor = 'pointer';
      tr.addEventListener('click', function(e) {
        if (e.target.tagName === 'A') return;
        window.location.href = 'editor.html?folder=' + encodeURIComponent(p.folder) + '&map=' + encodeURIComponent(p.id);
      });
    }

    body.appendChild(tr);
  });

  document.getElementById('projectCount').textContent = count + ' project' + (count !== 1 ? 's' : '');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
