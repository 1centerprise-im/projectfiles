/* ============================================================
   HOME.JS - Home screen logic
   Fetches maps/index.json, renders folder cards and map lists,
   and handles navigation to the editor.
   ============================================================ */

/* --- Main entry: runs when DOM is ready --- */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const grid = document.getElementById('foldersGrid');
  try {
    /* Fetch the folder/map index file */
    const resp = await fetch('maps/index.json');
    if (!resp.ok) throw new Error('Could not load maps/index.json');
    const data = await resp.json();
    /* Render one card per folder */
    data.folders.forEach(folder => {
      grid.appendChild(createFolderCard(folder));
    });
  } catch (err) {
    grid.innerHTML = '<p style="color:var(--red)">Failed to load maps index. Make sure maps/index.json exists.</p>';
    console.error(err);
  }
}

/* --- Create a folder card element --- */
/* Each card has a clickable header and an expandable map list */
function createFolderCard(folder) {
  const card = document.createElement('div');
  card.className = 'folder-card';

  /* Header: folder name + map count + chevron */
  const header = document.createElement('div');
  header.className = 'folder-header';
  header.innerHTML = `
    <div>
      <span class="folder-title">${escapeHtml(folder.label)}</span>
      <span class="folder-count">&nbsp;&mdash; ${folder.maps.length} map${folder.maps.length !== 1 ? 's' : ''}</span>
    </div>
    <span class="folder-chevron">&#9654;</span>
  `;
  /* Toggle open/close on click */
  header.addEventListener('click', () => card.classList.toggle('open'));

  /* Map list container (hidden until card is open) */
  const mapList = document.createElement('div');
  mapList.className = 'folder-maps';

  /* Render each map as a clickable row */
  folder.maps.forEach(mapName => {
    const item = document.createElement('div');
    item.className = 'map-item';
    item.innerHTML = `
      <span class="map-name">${escapeHtml(formatMapName(mapName))}</span>
      <svg class="map-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    `;
    /* Navigate to editor with folder + map as URL params */
    item.addEventListener('click', () => {
      window.location.href = `editor.html?folder=${encodeURIComponent(folder.name)}&map=${encodeURIComponent(mapName)}`;
    });
    mapList.appendChild(item);
  });

  /* "+ New Map" button at bottom of map list */
  const newBtn = document.createElement('button');
  newBtn.className = 'new-map-btn';
  newBtn.innerHTML = '<span>+</span> New Map';
  newBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleNewMap(folder.name);
  });
  mapList.appendChild(newBtn);

  card.appendChild(header);
  card.appendChild(mapList);
  return card;
}

/* --- Handle creating a new map --- */
/* Opens the editor with a "new" flag so it starts with a blank canvas */
function handleNewMap(folderName) {
  const name = prompt('Enter a name for the new mind map:');
  if (!name || !name.trim()) return;
  /* Sanitize: replace spaces with underscores, remove special chars */
  const safeName = name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeName) return;
  window.location.href = `editor.html?folder=${encodeURIComponent(folderName)}&map=${encodeURIComponent(safeName)}&new=1`;
}

/* --- Format map name for display --- */
/* Replaces underscores with spaces for a nicer look */
function formatMapName(name) {
  return name.replace(/_/g, ' ');
}

/* --- Escape HTML to prevent XSS --- */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
