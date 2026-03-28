// storage.js - All GitHub operations for Mind Map Editor
// Clean rewrite - single source of truth for all save/load/create/delete

const REPO = '1centerprise-im/projectfiles';
const API = 'https://api.github.com';

// Get or ask for GitHub token
function getToken() {
  let token = localStorage.getItem('gh_token');
  if (!token) {
    token = prompt('Enter your GitHub Personal Access Token (ghp_...):');
    if (token) localStorage.setItem('gh_token', token);
  }
  return token;
}

// GET a file from GitHub API - returns { sha, content (decoded) } or null if 404
async function ghGet(path) {
  const token = getToken();
  if (!token) throw new Error('No token');
  const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    cache: 'no-store'
  });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('gh_token');
    throw new Error('Invalid token - please reload page');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  const data = await res.json();
  const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
  return { sha: data.sha, content: decoded };
}

// Save queue - prevents concurrent writes that cause SHA conflicts
let _saveQueue = [];
let _saveRunning = false;

// PUT a file to GitHub - queued to prevent concurrent writes
async function ghPut(path, content, message) {
  return new Promise((resolve, reject) => {
    _saveQueue.push({ path, content, message, resolve, reject });
    _drainSaveQueue();
  });
}

async function _drainSaveQueue() {
  if (_saveRunning || !_saveQueue.length) return;
  _saveRunning = true;
  const job = _saveQueue.shift();
  try {
    const result = await _ghPutOnce(job.path, job.content, job.message);
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    _saveRunning = false;
    if (_saveQueue.length) _drainSaveQueue();
  }
}

// Single PUT attempt with one retry on 409 conflict
async function _ghPutOnce(path, content, message) {
  const token = getToken();
  if (!token) throw new Error('No token');

  async function attempt() {
    // Get fresh SHA (null if new file)
    let sha = null;
    const existing = await ghGet(path);
    if (existing) sha = existing.sha;

    const b64 = btoa(unescape(encodeURIComponent(content)));
    const body = { message, content: b64 };
    if (sha) body.sha = sha;

    const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res;
  }

  let res = await attempt();

  // Retry once on 409 Conflict (stale SHA)
  if (res.status === 409) {
    console.warn(`[storage] 409 conflict on ${path}, retrying with fresh SHA...`);
    res = await attempt();
  }

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('gh_token');
    throw new Error('Invalid token - please reload page');
  }
  if (!res.ok) {
    const err = await res.json().catch(function() { return {}; });
    throw new Error(err.message || `Save failed: ${res.status}`);
  }
  return await res.json();
}

// DELETE a file from GitHub
async function ghDelete(path, message) {
  const token = getToken();
  if (!token) throw new Error('No token');

  const existing = await ghGet(path);
  if (!existing) throw new Error('File not found');

  const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha: existing.sha })
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return true;
}

// Load a map JSON - try GitHub API first (always fresh), fallback to static
async function loadMap(folder, mapName) {
  // Try GitHub API first (always fresh)
  try {
    const result = await ghGet(`maps/${folder}/${mapName}.json`);
    if (result) {
      return JSON.parse(result.content);
    }
  } catch(e) {
    console.warn('[storage] API load failed, falling back to static:', e);
  }
  // Fallback to static fetch (for when no token is set)
  const res = await fetch(`maps/${folder}/${mapName}.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// Save map to GitHub
async function saveMap(folder, mapName, mapData) {
  const json = JSON.stringify(mapData, null, 2);
  await ghPut(`maps/${folder}/${mapName}.json`, json, `Update ${mapName} via Mind Map Editor`);
}

// Load index.json - try GitHub API first (always fresh), fallback to static
async function loadIndex() {
  try {
    const result = await ghGet('maps/index.json');
    if (result) return JSON.parse(result.content);
  } catch(e) {
    console.warn('[storage] API index load failed, falling back to static:', e);
  }
  const res = await fetch(`maps/index.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load index');
  return await res.json();
}

// Save index.json to GitHub
async function saveIndex(indexData) {
  const json = JSON.stringify(indexData, null, 2);
  await ghPut('maps/index.json', json, 'Update index via Mind Map Editor');
}

// Create a new map: creates the JSON file AND updates index.json
async function createMap(folder, mapId, displayName, folderLabel) {
  const emptyMap = {
    title: displayName,
    nodes: [{ id: 'n1', x: 400, y: 300, w: 0, h: 0, text: displayName, ci: 0, link: '',
      collapsed: false, isNote: false, fontSize: 16, fontFamily: 'Nunito',
      textColor: '#2a2520', bold: true, italic: false, textAlign: 'center',
      shape: 'rounded', borderColor: '', borderWidth: 0 }],
    edges: [], nid: 2
  };

  // 1. Create the map JSON file
  await ghPut(`maps/${folder}/${mapId}.json`, JSON.stringify(emptyMap, null, 2), `Create ${mapId} via Mind Map Editor`);

  // 2. Fetch FRESH index.json from GitHub API, modify, save back
  const result = await ghGet('maps/index.json');
  let index;
  if (result) {
    index = JSON.parse(result.content);
  } else {
    index = { folders: [] };
  }

  // Find or create folder
  let folderEntry = index.folders.find(f => f.name === folder);
  if (!folderEntry) {
    folderEntry = { name: folder, label: folderLabel || folder, maps: [] };
    index.folders.push(folderEntry);
  }

  // Add map entry
  folderEntry.maps.push({ id: mapId, name: displayName, number: '', status: 'active' });

  // Save updated index
  await saveIndex(index);
  return true;
}

// Create a new folder in index.json
async function createFolder(folderName, label) {
  const result = await ghGet('maps/index.json');
  const index = result ? JSON.parse(result.content) : { folders: [] };
  index.folders.push({ name: folderName, label: label, maps: [] });
  await saveIndex(index);
  return true;
}

// Delete a map: deletes the JSON file AND removes from index.json
async function deleteMap(folder, mapId) {
  // 1. Delete the map file
  try {
    await ghDelete(`maps/${folder}/${mapId}.json`, `Delete ${mapId}`);
  } catch(e) {
    console.warn('File delete failed (may not exist):', e);
  }

  // 2. Remove from index.json
  const result = await ghGet('maps/index.json');
  if (result) {
    const index = JSON.parse(result.content);
    const folderEntry = index.folders.find(f => f.name === folder);
    if (folderEntry) {
      folderEntry.maps = folderEntry.maps.filter(m => m.id !== mapId);
    }
    await saveIndex(index);
  }
  return true;
}

// Delete a folder: deletes all map files in it, then removes from index.json
async function deleteFolder(folderName) {
  const result = await ghGet('maps/index.json');
  if (result) {
    const index = JSON.parse(result.content);
    const folder = index.folders.find(f => f.name === folderName);

    // Delete each map file in the folder
    if (folder && folder.maps) {
      for (const map of folder.maps) {
        try {
          await ghDelete(`maps/${folderName}/${map.id}.json`, `Delete ${map.id} (folder deletion)`);
        } catch (e) {
          console.warn(`[storage] Failed to delete map file ${map.id}:`, e);
        }
      }
    }

    // Remove folder entry from index
    index.folders = index.folders.filter(f => f.name !== folderName);
    await saveIndex(index);
  }
  return true;
}

// Move a map file from one folder to another on GitHub, and update index.json
async function moveMapToFolder(mapId, fromFolder, toFolder, toFolderLabel) {
  // 1. Read the map file content from old location
  const fileResult = await ghGet(`maps/${fromFolder}/${mapId}.json`);
  if (!fileResult) throw new Error('Map file not found at old location');

  // 2. Write the file to new location
  await ghPut(`maps/${toFolder}/${mapId}.json`, fileResult.content, `Move ${mapId} from ${fromFolder} to ${toFolder}`);

  // 3. Delete from old location
  await ghDelete(`maps/${fromFolder}/${mapId}.json`, `Move ${mapId} - remove from ${fromFolder}`);

  // 4. Update index.json: move the map entry between folders
  const indexResult = await ghGet('maps/index.json');
  if (!indexResult) throw new Error('index.json not found');
  const index = JSON.parse(indexResult.content);

  // Find and remove from source folder
  let mapEntry = null;
  const srcFolder = index.folders.find(f => f.name === fromFolder);
  if (srcFolder) {
    const idx = srcFolder.maps.findIndex(m => m.id === mapId);
    if (idx !== -1) {
      mapEntry = srcFolder.maps.splice(idx, 1)[0];
    }
  }
  if (!mapEntry) throw new Error('Map entry not found in index');

  // Find or create target folder, add map
  let destFolder = index.folders.find(f => f.name === toFolder);
  if (!destFolder) {
    destFolder = { name: toFolder, label: toFolderLabel || toFolder, maps: [] };
    index.folders.push(destFolder);
  }
  destFolder.maps.push(mapEntry);

  await saveIndex(index);
  return index;
}

// Default blank map (for editor when no file exists)
function createEmptyMap(title) {
  return {
    title: title || 'Untitled Map',
    nodes: [{ id: 'n1', x: 400, y: 300, w: 0, h: 0, text: title || 'Central Topic',
      ci: 0, link: '', collapsed: false, isNote: false, fontSize: 16,
      fontFamily: 'Nunito', textColor: '#2a2520', bold: true, italic: false,
      textAlign: 'center', shape: 'rounded', borderColor: '', borderWidth: 0 }],
    edges: [], nid: 2
  };
}

// localStorage auto-backup
function saveToLocal(folder, mapName, mapData) {
  try {
    localStorage.setItem('mindmap_backup_' + folder + '_' + mapName,
      JSON.stringify({ data: mapData, savedAt: Date.now() }));
  } catch (e) { /* ignore */ }
}
