/* ============================================================
   EDGES.JS - Simple curved connector lines between nodes
   - renderAllEdges(): clears SVG and redraws all edges
   - Smooth bezier curves, no styling/selection/arrows
   ============================================================ */

/* --- Redraw all edges into the SVG element --- */
/* hiddenIds: object keyed by node IDs that should not be drawn */
function renderAllEdges(svg, edges, nodes, nodeEls, defaultThick, defaultColor, hiddenIds) {
  svg.innerHTML = '';
  hiddenIds = hiddenIds || {};

  edges.forEach(function(edge) {
    var fromNode = null, toNode = null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === edge.from) fromNode = nodes[i];
      if (nodes[i].id === edge.to) toNode = nodes[i];
    }
    if (!fromNode || !toNode) return;

    var fromEl = nodeEls[edge.from];
    var toEl = nodeEls[edge.to];
    if (!fromEl || !toEl) return;

    /* Skip edges to/from hidden nodes */
    if (hiddenIds[fromNode.id]) return;
    if (hiddenIds[toNode.id]) return;

    var from = getNodeCenter(fromNode, fromEl);
    var to = getNodeCenter(toNode, toEl);

    /* Simple bezier curve - fixed gray color and 1.5px width */
    svg.appendChild(makeBezierPath(from, to, 1.5, '#b0a89e', edge.id));

    /* Wider invisible hit area for click selection */
    svg.appendChild(makeHitArea(from, to, edge.id));
  });
}

/* --- Draw a collapse badge below a node (called from editor.js) --- */
/* Shows hidden child count below the node, positioned with a gap.     */
function drawCollapseBadge(svg, node, nodeEl, edges, onClick) {
  var count = getDescendants(node.id, edges).length;
  if (count < 1) return;

  var w = nodeEl ? nodeEl.offsetWidth : 140;
  var h = nodeEl ? nodeEl.offsetHeight : 40;
  var cx = node.x + w / 2;
  var cy = node.y + h + 14; /* 14px below node bottom */

  var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'collapse-badge');
  g.style.cursor = 'pointer';
  g.style.pointerEvents = 'all';

  var badgeW = count > 9 ? 26 : 20;
  var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', cx - badgeW / 2);
  rect.setAttribute('y', cy - 8);
  rect.setAttribute('width', badgeW);
  rect.setAttribute('height', 16);
  rect.setAttribute('rx', 8);
  rect.setAttribute('ry', 8);
  rect.setAttribute('fill', '#2a2520');
  rect.setAttribute('stroke', '#c8c0b8');
  rect.setAttribute('stroke-width', '1');
  g.appendChild(rect);

  var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', cx);
  text.setAttribute('y', cy + 4);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', '#ffffff');
  text.setAttribute('font-size', '10');
  text.setAttribute('font-family', 'Nunito Sans, sans-serif');
  text.setAttribute('font-weight', '700');
  text.textContent = '+' + count;
  g.appendChild(text);

  if (onClick) {
    g.addEventListener('click', function(e) {
      e.stopPropagation();
      onClick();
    });
  }

  svg.appendChild(g);
}

/* --- Smooth cubic bezier path between two points --- */
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

/* --- Cubic bezier "d" attribute --- */
function bezierD(from, to) {
  var dx = to.x - from.x;
  var dy = to.y - from.y;
  var ax = Math.abs(dx);
  var ay = Math.abs(dy);
  var cp1x, cp1y, cp2x, cp2y;

  if (ax >= ay) {
    var off = Math.max(ax * 0.5, 40);
    cp1x = from.x + (dx > 0 ? off : -off);
    cp1y = from.y;
    cp2x = to.x - (dx > 0 ? off : -off);
    cp2y = to.y;
  } else {
    var off = Math.max(ay * 0.5, 40);
    cp1x = from.x;
    cp1y = from.y + (dy > 0 ? off : -off);
    cp2x = to.x;
    cp2y = to.y - (dy > 0 ? off : -off);
  }

  return 'M ' + from.x + ',' + from.y +
    ' C ' + cp1x + ',' + cp1y +
    ' ' + cp2x + ',' + cp2y +
    ' ' + to.x + ',' + to.y;
}

/* --- Invisible wider hit area for click detection --- */
function makeHitArea(from, to, edgeId) {
  var hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hit.setAttribute('d', bezierD(from, to));
  hit.setAttribute('stroke', 'transparent');
  hit.setAttribute('stroke-width', '10');
  hit.setAttribute('fill', 'none');
  hit.setAttribute('class', 'edge-hit');
  hit.style.cursor = 'pointer';
  hit.style.pointerEvents = 'stroke';
  hit.dataset.edgeId = edgeId;
  return hit;
}

/* --- Highlight selected edge --- */
function selectEdge(svg, edgeId) {
  deselectAllEdges(svg);
  svg.querySelectorAll('.edge-path[data-edge-id="' + edgeId + '"]')
    .forEach(function(p) { p.classList.add('selected'); });
}

/* --- Remove selection from all edges --- */
function deselectAllEdges(svg) {
  svg.querySelectorAll('.edge-path.selected')
    .forEach(function(p) { p.classList.remove('selected'); });
}

/* --- Create new edge data object --- */
function createEdgeData(id, fromId, toId) {
  return { id: id, from: fromId, to: toId };
}

/* --- Delete edge by id --- */
function deleteEdgeById(edges, edgeId) {
  return edges.filter(function(e) { return e.id !== edgeId; });
}

/* --- Delete ALL edges connected to a node --- */
function deleteEdgesForNode(edges, nodeId) {
  return edges.filter(function(e) { return e.from !== nodeId && e.to !== nodeId; });
}

/* --- Temporary dashed line during connect-drag --- */
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

function removeTempLine(svg) {
  var el = svg.querySelector('.temp-line');
  if (el) el.remove();
}

/* --- Check if edge exists between two nodes --- */
function edgeExists(edges, a, b) {
  return edges.some(function(e) {
    return (e.from === a && e.to === b) || (e.from === b && e.to === a);
  });
}
