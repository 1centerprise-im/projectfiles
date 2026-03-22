/* ============================================================
   STORAGE.JS - Load and save mind map JSON files
   Handles: fetching JSON from maps/ folder, exporting JSON as
   download, and localStorage backup/restore.
   ============================================================ */

/* --- Default empty map structure --- */
/* Used when creating a brand-new map */
function createEmptyMap(title) {
  return {
    title: title || 'Untitled Map',
    nodes: [
      {
        id: 'n1', x: 400, y: 300, w: 0, h: 0,
        text: title || 'Central Topic',
        ci: 1, link: '', collapsed: false, isNote: false,
        fontSize: 16, fontFamily: 'Nunito', textColor: '#2a2520',
        bold: true, italic: false, textAlign: 'center',
        shape: 'rounded', borderColor: '', borderWidth: 0
      }
    ],
    edges: [],
    nid: 2,
    edgeThickness: 2,
    edgeColor: '#b8b0a6'
  };
}

/* --- Load a map from the maps/ folder --- */
/* Returns the parsed JSON object, or null on failure */
async function loadMap(folder, mapName) {
  const url = `maps/${folder}/${mapName}.json`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    /* Ensure all required top-level properties exist */
    data.nodes = data.nodes || [];
    data.edges = data.edges || [];
    data.nid = data.nid || data.nodes.length + 1;
    data.edgeThickness = data.edgeThickness || 2;
    data.edgeColor = data.edgeColor || '#b8b0a6';
    return data;
  } catch (err) {
    console.error('Failed to load map:', err);
    return null;
  }
}

/* --- Save map as a JSON file download --- */
/* Triggers the browser's download dialog with the JSON content */
function downloadMap(mapData, filename) {
  /* Create a clean copy to avoid saving any internal state */
  const clean = JSON.parse(JSON.stringify(mapData));
  const json = JSON.stringify(clean, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  /* Create a temporary link and click it to start the download */
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : filename + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* --- localStorage key for a given map --- */
function storageKey(folder, mapName) {
  return `mindmap_backup_${folder}_${mapName}`;
}

/* --- Save current map state to localStorage as backup --- */
function saveToLocalStorage(folder, mapName, mapData) {
  try {
    const payload = {
      data: mapData,
      savedAt: Date.now()
    };
    localStorage.setItem(storageKey(folder, mapName), JSON.stringify(payload));
  } catch (err) {
    console.warn('localStorage save failed:', err);
  }
}

/* --- Load backup from localStorage --- */
/* Returns { data, savedAt } or null if no backup exists */
function loadFromLocalStorage(folder, mapName) {
  try {
    const raw = localStorage.getItem(storageKey(folder, mapName));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

/* --- Clear localStorage backup for a map --- */
function clearLocalStorage(folder, mapName) {
  localStorage.removeItem(storageKey(folder, mapName));
}
