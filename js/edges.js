/* ============================================================
   EDGES.JS - Edge rendering, creation, deletion, formatting
   - renderAllEdges(): clears SVG and redraws all edges
   - createEdgePath(): makes a bezier curve SVG path
   - Edge selection, labels, hit areas, temp connection line
   ============================================================ */

/* --- Redraw all edges into the SVG element --- */
/* Called after any change to nodes or edges. Clears and rebuilds. */
function renderAllEdges(svg, edges, nodes, nodeEls, defaultThick, defaultColor) {
  /* Wipe all existing SVG children */
  svg.innerHTML = '';

  edges.forEach(function(edge) {
    /* Look up the source and target node data objects */
    var fromNode = null, toNode = null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === edge.from) fromNode = nodes[i];
      if (nodes[i].id === edge.to) toNode = nodes[i];
    }
    if (!fromNode || !toNode) return; /* skip broken edges */

    /* Look up the DOM elements for each node */
    var fromEl = nodeEls[edge.from];
    var toEl = nodeEls[edge.to];
    if (!fromEl || !toEl) return; /* skip if elements don't exist */

    /* Skip edges to/from hidden (collapsed) nodes */
    if (fromEl.style.display === 'none') return;
    if (toEl.style.display === 'none') return;

    /* Calculate center points of both nodes */
    var from = getNodeCenter(fromNode, fromEl);
    var to = getNodeCenter(toNode, toEl);

    /* Determine line thickness and color (per-edge overrides global) */
    var thick = edge.thickness || defaultThick || 2;
    var color = edge.color || defaultColor || '#b8b0a6';

    /* Draw the visible bezier curve path */
    var path = makeBezierPath(from, to, thick, color, edge.id);
    svg.appendChild(path);

    /* Draw a wider invisible hit area for easier click selection */
    var hit = makeHitArea(from, to, edge.id);
    svg.appendChild(hit);

    /* Draw edge label text at midpoint if present */
    if (edge.label) {
      var label = makeEdgeLabel(from, to, edge.label);
      svg.appendChild(label);
    }
  });
}

/* --- Build a cubic bezier SVG path between two points --- */
/* Control points are offset horizontally for a smooth S-curve */
function makeBezierPath(from, to, thickness, color, edgeId) {
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', bezierD(from, to));
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', thickness);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('class', 'edge-path');
  path.dataset.edgeId = edgeId;
  return path;
}

/* --- Build the "d" attribute string for a cubic bezier --- */
function bezierD(from, to) {
  var dx = Math.abs(to.x - from.x);
  /* Control point offset: at least 40px, proportional to distance */
  var off = Math.max(40, dx * 0.4);
  return 'M ' + from.x + ' ' + from.y +
    ' C ' + (from.x + off) + ' ' + from.y +
    ', ' + (to.x - off) + ' ' + to.y +
    ', ' + to.x + ' ' + to.y;
}

/* --- Invisible wider path for click detection on edges --- */
function makeHitArea(from, to, edgeId) {
  var hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hit.setAttribute('d', bezierD(from, to));
  hit.setAttribute('stroke', 'transparent');
  hit.setAttribute('stroke-width', '14');
  hit.setAttribute('fill', 'none');
  hit.setAttribute('class', 'edge-hit');
  hit.style.cursor = 'pointer';
  hit.style.pointerEvents = 'stroke';
  hit.dataset.edgeId = edgeId;
  return hit;
}

/* --- Text label at the midpoint of an edge --- */
function makeEdgeLabel(from, to, text) {
  var mx = (from.x + to.x) / 2;
  var my = (from.y + to.y) / 2 - 8;
  var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', mx);
  label.setAttribute('y', my);
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('class', 'edge-label');
  label.textContent = text;
  return label;
}

/* --- Create new edge data object --- */
function createEdgeData(id, fromId, toId) {
  return { id: id, from: fromId, to: toId };
}

/* --- Highlight selected edge (CSS class) --- */
function selectEdge(svg, edgeId) {
  deselectAllEdges(svg);
  svg.querySelectorAll('.edge-path[data-edge-id="' + edgeId + '"]')
    .forEach(function(p) { p.classList.add('selected'); });
}

/* --- Remove selection highlight from all edges --- */
function deselectAllEdges(svg) {
  svg.querySelectorAll('.edge-path.selected')
    .forEach(function(p) { p.classList.remove('selected'); });
}

/* --- Delete edge by id from the edges array --- */
function deleteEdgeById(edges, edgeId) {
  return edges.filter(function(e) { return e.id !== edgeId; });
}

/* --- Delete ALL edges connected to a node (for node deletion) --- */
function deleteEdgesForNode(edges, nodeId) {
  return edges.filter(function(e) { return e.from !== nodeId && e.to !== nodeId; });
}

/* --- Draw temporary dashed line during connect-drag --- */
function drawTempLine(svg, from, to) {
  removeTempLine(svg);
  var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', from.x);
  line.setAttribute('y1', from.y);
  line.setAttribute('x2', to.x);
  line.setAttribute('y2', to.y);
  line.setAttribute('stroke', '#e07b3a');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '6,4');
  line.setAttribute('class', 'temp-line');
  line.style.pointerEvents = 'none';
  svg.appendChild(line);
}

/* --- Remove the temporary connection line --- */
function removeTempLine(svg) {
  var el = svg.querySelector('.temp-line');
  if (el) el.remove();
}

/* --- Check if an edge already exists between two nodes --- */
function edgeExists(edges, a, b) {
  return edges.some(function(e) {
    return (e.from === a && e.to === b) || (e.from === b && e.to === a);
  });
}
