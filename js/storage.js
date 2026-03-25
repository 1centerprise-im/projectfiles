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

// PUT a file to GitHub - always gets fresh SHA first
async function ghPut(path, content, message) {
  const token = getToken();
  if (!token) throw new Error('No token');

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
      const data = JSON.parse(result.content);
      console.log(`[storage] Loaded ${folder}/${mapName} from API: ${data.nodes?.length || 0} nodes`);
      return data;
    }
  } catch(e) {
    console.warn('[storage] API load failed, falling back to static:', e);
  }
  // Fallback to static fetch (for when no token is set)
  const res = await fetch(`maps/${folder}/${mapName}.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  console.log(`[storage] Loaded ${folder}/${mapName} from static: ${data.nodes?.length || 0} nodes`);
  return data;
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
    edges: [], nid: 2, edgeThickness: 1.5, edgeColor: '#c8c0b8'
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

// Delete a folder from index.json
async function deleteFolder(folderName) {
  const result = await ghGet('maps/index.json');
  if (result) {
    const index = JSON.parse(result.content);
    index.folders = index.folders.filter(f => f.name !== folderName);
    await saveIndex(index);
  }
  return true;
}

// Default blank map (for editor when no file exists)
function createEmptyMap(title) {
  return {
    title: title || 'Untitled Map',
    nodes: [{ id: 'n1', x: 400, y: 300, w: 0, h: 0, text: title || 'Central Topic',
      ci: 0, link: '', collapsed: false, isNote: false, fontSize: 16,
      fontFamily: 'Nunito', textColor: '#2a2520', bold: true, italic: false,
      textAlign: 'center', shape: 'rounded', borderColor: '', borderWidth: 0 }],
    edges: [], nid: 2, edgeThickness: 2, edgeColor: '#c8c0b8'
  };
}

// localStorage auto-backup
function saveToLocal(folder, mapName, mapData) {
  try {
    localStorage.setItem('mindmap_backup_' + folder + '_' + mapName,
      JSON.stringify({ data: mapData, savedAt: Date.now() }));
  } catch (e) { /* ignore */ }
}
