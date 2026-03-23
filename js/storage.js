/* ============================================================
   STORAGE.JS - Load/save mind map JSON files
   - fetchMap(): loads JSON from maps/ folder via HTTP fetch
   - downloadMap(): triggers browser download of JSON
   - localStorage helpers: backup/restore between sessions
   ============================================================ */

/* --- Default blank map (used when creating new maps) --- */
function createEmptyMap(title) {
  return {
    title: title || 'Untitled Map',
    nodes: [{
      id: 'n1', x: 400, y: 300, w: 0, h: 0,
      text: title || 'Central Topic', ci: 1, link: '',
      collapsed: false, isNote: false, fontSize: 16,
      fontFamily: 'Nunito', textColor: '#2a2520',
      bold: true, italic: false, textAlign: 'center',
      shape: 'rounded', borderColor: '', borderWidth: 0
    }],
    edges: [],
    nid: 2,
    edgeThickness: 2,
    edgeColor: '#b8b0a6'
  };
}

/* --- Fetch a map JSON file from the server --- */
/* Path: maps/{folder}/{mapName}.json */
/* Returns parsed JS object on success, null on failure */
async function fetchMap(folder, mapName) {
  const url = 'maps/' + folder + '/' + mapName + '.json';
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    /* Ensure required top-level fields exist with defaults */
    if (!data.nodes) data.nodes = [];
    if (!data.edges) data.edges = [];
    if (!data.nid) data.nid = data.nodes.length + 1;
    if (!data.edgeThickness) data.edgeThickness = 2;
    if (!data.edgeColor) data.edgeColor = '#b8b0a6';
    console.log('[storage] Loaded', url, ':', data.nodes.length, 'nodes,', data.edges.length, 'edges');
    return data;
  } catch (err) {
    console.error('[storage] Failed to load', url, err);
    return null;
  }
}

/* --- Download map as a .json file (browser save dialog) --- */
function downloadMap(mapData, filename) {
  /* Stringify with pretty formatting */
  var json = JSON.stringify(mapData, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  /* Create invisible link and click it to trigger download */
  var a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : filename + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* --- GitHub API: save JSON file to repo --- */
var GH_OWNER = '1centerprise-im';
var GH_REPO = 'projectfiles';

function getGitHubToken() {
  return localStorage.getItem('gh_pat') || '';
}

function setGitHubToken(token) {
  localStorage.setItem('gh_pat', token);
}

/* Save map JSON to GitHub via PUT contents API.
   CRITICAL: Always GET fresh SHA immediately before PUT. Never cache SHA. */
async function saveToGitHub(folder, mapName, mapData) {
  var token = getGitHubToken();
  if (!token) throw new Error('NO_TOKEN');

  var path = 'maps/' + folder + '/' + mapName + '.json';
  var apiUrl = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + path;
  var authHeaders = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

  /* Step 1: GET the current file to get its fresh SHA */
  var sha = '';
  var getResp = await fetch(apiUrl, { headers: authHeaders, cache: 'no-store' });
  if (getResp.status === 401 || getResp.status === 403) {
    localStorage.removeItem('gh_pat');
    throw new Error('INVALID_TOKEN');
  }
  if (getResp.ok) {
    var fileData = await getResp.json();
    sha = fileData.sha;
  }
  /* If 404, file doesn't exist yet - sha stays empty (new file) */

  /* Step 2: Encode content as base64 */
  var jsonStr = JSON.stringify(mapData, null, 2);
  var content = btoa(unescape(encodeURIComponent(jsonStr)));

  /* Step 3: PUT with fresh SHA */
  var putBody = {
    message: 'Update ' + mapName + ' via Mind Map Editor',
    content: content
  };
  if (sha) putBody.sha = sha;

  var putResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders),
    body: JSON.stringify(putBody)
  });

  if (putResp.status === 401 || putResp.status === 403) {
    localStorage.removeItem('gh_pat');
    throw new Error('INVALID_TOKEN');
  }
  if (!putResp.ok) {
    var errData = await putResp.json().catch(function() { return {}; });
    throw new Error(errData.message || 'HTTP ' + putResp.status);
  }
  return true;
}

/* Save index.json to GitHub */
async function saveIndexToGitHub(indexData) {
  var token = getGitHubToken();
  if (!token) throw new Error('NO_TOKEN');

  var path = 'maps/index.json';
  var url = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + path;
  var content = btoa(unescape(encodeURIComponent(JSON.stringify(indexData, null, 2) + '\n')));

  var sha = '';
  try {
    var getResp = await fetch(url + '?t=' + Date.now(), {
      headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'If-None-Match': '' },
      cache: 'no-store'
    });
    if (getResp.ok) { sha = (await getResp.json()).sha; }
  } catch (e) {}

  var body = { message: 'Update project index', content: content };
  if (sha) body.sha = sha;

  var putResp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!putResp.ok) {
    var err = await putResp.json().catch(function() { return {}; });
    throw new Error(err.message || 'HTTP ' + putResp.status);
  }
  return true;
}

/* --- localStorage helpers for auto-backup --- */

/* Key format: mindmap_backup_{folder}_{mapName} */
function _storageKey(folder, mapName) {
  return 'mindmap_backup_' + folder + '_' + mapName;
}

/* Save map data to localStorage */
function saveToLocal(folder, mapName, mapData) {
  try {
    localStorage.setItem(_storageKey(folder, mapName),
      JSON.stringify({ data: mapData, savedAt: Date.now() }));
  } catch (e) { console.warn('[storage] localStorage save failed', e); }
}

/* Load backup from localStorage. Returns {data, savedAt} or null */
function loadFromLocal(folder, mapName) {
  try {
    var raw = localStorage.getItem(_storageKey(folder, mapName));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
