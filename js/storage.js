/* ============================================================
   STORAGE.JS - Clean GitHub API storage system
   All GitHub operations go through githubGet/githubPut.
   CRITICAL: Always fetch fresh SHA before every PUT.
   ============================================================ */

/* --- Config --- */
var GH_OWNER = '1centerprise-im';
var GH_REPO = 'projectfiles';
var GH_API = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/';

/* --- Get or prompt for GitHub token --- */
function getToken() {
  var token = localStorage.getItem('gh_token');
  if (!token) {
    token = prompt('Enter your GitHub Personal Access Token:');
    if (token) localStorage.setItem('gh_token', token.trim());
  }
  return token || '';
}

/* --- GitHub GET: fetch file metadata + content from API --- */
/* Returns { sha, content, ... } or null on 404 */
async function githubGet(path) {
  var token = getToken();
  if (!token) throw new Error('NO_TOKEN');
  var resp = await fetch(GH_API + path, {
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' },
    cache: 'no-store'
  });
  /* Bad token: clear and alert */
  if (resp.status === 401 || resp.status === 403) {
    localStorage.removeItem('gh_token');
    alert('Invalid token - please reload and try again');
    throw new Error('INVALID_TOKEN');
  }
  /* File not found = new file */
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('GitHub GET failed: HTTP ' + resp.status);
  return await resp.json();
}

/* --- GitHub PUT: create or update a file --- */
/* Always fetches fresh SHA first. Handles new files (no sha). */
async function githubPut(path, content, message) {
  var token = getToken();
  if (!token) throw new Error('NO_TOKEN');

  /* Step 1: GET fresh SHA */
  var existing = await githubGet(path);
  var sha = existing ? existing.sha : null;

  /* Step 2: Encode content as base64 */
  var b64 = btoa(unescape(encodeURIComponent(content)));

  /* Step 3: PUT with fresh SHA */
  var body = { message: message, content: b64 };
  if (sha) body.sha = sha;

  var resp = await fetch(GH_API + path, {
    method: 'PUT',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (resp.status === 401 || resp.status === 403) {
    localStorage.removeItem('gh_token');
    alert('Invalid token - please reload and try again');
    throw new Error('INVALID_TOKEN');
  }
  if (!resp.ok) {
    var err = await resp.json().catch(function() { return {}; });
    throw new Error(err.message || 'HTTP ' + resp.status);
  }
  return await resp.json();
}

/* --- Decode base64 content from GitHub API response --- */
function decodeGHContent(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

/* --- Load map JSON from public server (not API) --- */
async function loadMap(folder, mapName) {
  var url = 'maps/' + folder + '/' + mapName + '.json';
  try {
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    if (!data.nodes) data.nodes = [];
    if (!data.edges) data.edges = [];
    if (!data.nid) data.nid = data.nodes.length + 1;
    if (!data.edgeThickness) data.edgeThickness = 2;
    if (!data.edgeColor) data.edgeColor = '#c8c0b8';
    console.log('[storage] Loaded ' + folder + '/' + mapName + ': ' + data.nodes.length + ' nodes, ' + data.edges.length + ' edges');
    return data;
  } catch (err) {
    console.error('[storage] Failed to load ' + url, err);
    return null;
  }
}

/* --- Save map to GitHub --- */
async function saveMap(folder, mapName, mapData) {
  var json = JSON.stringify(mapData, null, 2);
  await githubPut('maps/' + folder + '/' + mapName + '.json', json, 'Update ' + mapName + ' via Mind Map Editor');
  return true;
}

/* --- Save index.json to GitHub --- */
async function saveIndex(indexData) {
  var json = JSON.stringify(indexData, null, 2);
  await githubPut('maps/index.json', json, 'Update index via Mind Map Editor');
  return true;
}

/* --- Create a new map: saves map file + updates index.json --- */
async function createNewMapOnGitHub(folderName, mapName, displayName, folderLabel) {
  /* Step 1: Create empty map file */
  var emptyMap = {
    title: displayName,
    nodes: [{ id: 'n1', x: 400, y: 300, w: 0, h: 0, text: displayName, ci: 0, link: '',
      collapsed: false, isNote: false, fontSize: 16, fontFamily: 'Nunito',
      textColor: '#2a2520', bold: true, italic: false, textAlign: 'center',
      shape: 'rounded', borderColor: '', borderWidth: 0 }],
    edges: [], nid: 2, edgeThickness: 1.5, edgeColor: '#c8c0b8'
  };
  await githubPut('maps/' + folderName + '/' + mapName + '.json', JSON.stringify(emptyMap, null, 2), 'Create map ' + mapName);

  /* Step 2: Fetch fresh index.json from GitHub, modify, save back */
  var idxFile = await githubGet('maps/index.json');
  var idxData;
  if (idxFile) {
    idxData = JSON.parse(decodeGHContent(idxFile.content));
  } else {
    idxData = { folders: [] };
  }

  /* Find or create folder */
  var folder = idxData.folders.find(function(f) { return f.name === folderName; });
  if (!folder) {
    folder = { name: folderName, label: folderLabel || folderName, maps: [] };
    idxData.folders.push(folder);
  }

  /* Add map entry */
  folder.maps.push({ id: mapName, name: displayName, number: '', status: 'active' });

  /* Save updated index */
  await saveIndex(idxData);
  return true;
}

/* --- Default blank map (for editor when no file exists) --- */
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

/* --- localStorage auto-backup --- */
function saveToLocal(folder, mapName, mapData) {
  try {
    localStorage.setItem('mindmap_backup_' + folder + '_' + mapName,
      JSON.stringify({ data: mapData, savedAt: Date.now() }));
  } catch (e) { /* ignore */ }
}
