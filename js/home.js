/* ============================================================
   HOME.JS - Home screen logic
   Fetches maps/index.json, renders folder cards with map lists,
   handles navigation to the editor.
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);

/* --- Load folder/map index and render the UI --- */
async function init() {
  var grid = document.getElementById('foldersGrid');
  try {
    var resp = await fetch('maps/index.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    /* Render one card per folder */
    data.folders.forEach(function(folder) {
      grid.appendChild(createFolderCard(folder));
    });
  } catch (err) {
    grid.innerHTML = '<p style="color:var(--red)">Failed to load maps/index.json</p>';
    console.error(err);
  }
}

/* --- Build a folder card element --- */
function createFolderCard(folder) {
  var card = document.createElement('div');
  card.className = 'folder-card';

  /* Header: folder name + map count + chevron arrow */
  var header = document.createElement('div');
  header.className = 'folder-header';
  header.innerHTML =
    '<div><span class="folder-title">' + esc(folder.label) + '</span>' +
    '<span class="folder-count"> &mdash; ' + folder.maps.length + ' map' + (folder.maps.length !== 1 ? 's' : '') + '</span></div>' +
    '<span class="folder-chevron">&#9654;</span>';
  /* Toggle open/close on click */
  header.addEventListener('click', function() { card.classList.toggle('open'); });

  /* Map list (hidden until card is opened) */
  var mapList = document.createElement('div');
  mapList.className = 'folder-maps';
  folder.maps.forEach(function(mapName) {
    var item = document.createElement('div');
    item.className = 'map-item';
    item.innerHTML =
      '<span class="map-name">' + esc(mapName.replace(/_/g, ' ')) + '</span>' +
      '<svg class="map-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
    /* Click navigates to editor with folder+map as URL params */
    item.addEventListener('click', function() {
      window.location.href = 'editor.html?folder=' + encodeURIComponent(folder.name) + '&map=' + encodeURIComponent(mapName);
    });
    mapList.appendChild(item);
  });

  /* "+ New Map" button */
  var newBtn = document.createElement('button');
  newBtn.className = 'new-map-btn';
  newBtn.innerHTML = '<span>+</span> New Map';
  newBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var name = prompt('Enter a name for the new mind map:');
    if (!name || !name.trim()) return;
    var safe = name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    if (safe) window.location.href = 'editor.html?folder=' + encodeURIComponent(folder.name) + '&map=' + encodeURIComponent(safe) + '&new=1';
  });
  mapList.appendChild(newBtn);

  card.appendChild(header);
  card.appendChild(mapList);
  return card;
}

/* --- Escape HTML to prevent XSS --- */
function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
