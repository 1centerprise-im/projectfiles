/* ============================================================
   EDGES.JS - Edge rendering, creation, deletion, formatting
   - renderAllEdges(): clears SVG and redraws all edges
   - Smooth bezier curves between nodes
   - Per-edge collapse toggles and collapsed stub badges
   - Edge selection, labels, hit areas, temp connection line
   ============================================================ */

/* --- Redraw all edges into the SVG element --- */
/* hiddenIds: set of node IDs that are hidden (collapsed).              */
/* onToggleChild: callback(parentId, childId) for edge toggle clicks.   */
function renderAllEdges(svg, edges, nodes, nodeEls, defaultThick, defaultColor, hiddenIds, onToggleChild) {
  svg.innerHTML = '';
  hiddenIds = hiddenIds || {};

  /* Pre-compute stub counts per parent so we can spread badges */
  var stubCounts = {}; /* parentId -> total collapsed-child stubs */
  var stubIndexes = {}; /* parentId -> next index to assign */
  edges.forEach(function(edge) {
    var fromNode = null, toNode = null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === edge.from) fromNode = nodes[i];
      if (nodes[i].id === edge.to) toNode = nodes[i];
    }
    if (!fromNode || !toNode) return;
    if (hiddenIds[fromNode.id]) return;
    if (hiddenIds[toNode.id] && fromNode.collapsedChildren &&
        fromNode.collapsedChildren.indexOf(toNode.id) !== -1) {
      stubCounts[fromNode.id] = (stubCounts[fromNode.id] || 0) + 1;
    }
  });

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

    /* If source is hidden, skip entirely */
    if (hiddenIds[fromNode.id]) return;

    var thick = edge.thickness || defaultThick || 1.5;
    var color = edge.color || defaultColor || '#c8c0b8';
    var from = getNodeCenter(fromNode, fromEl);

    /* --- CHILD IS HIDDEN: draw stub + badge --- */
    if (hiddenIds[toNode.id]) {
      if (fromNode.collapsedChildren && fromNode.collapsedChildren.indexOf(toNode.id) !== -1) {
        var count = countHiddenInBranch(toNode.id, edges);
        var idx = stubIndexes[fromNode.id] || 0;
        stubIndexes[fromNode.id] = idx + 1;
        var total = stubCounts[fromNode.id] || 1;
        drawCollapsedStub(svg, from, toNode, fromEl, thick, color, count, edge.id, onToggleChild, fromNode.id, idx, total);
      }
      return;
    }

    /* --- BOTH VISIBLE: draw normal bezier + toggle --- */
    var to = getNodeCenter(toNode, toEl);

    var path = makeBezierPath(from, to, thick, color, edge.id);
    svg.appendChild(path);

    var hit = makeHitArea(from, to, edge.id);
    svg.appendChild(hit);

    if (edge.label) {
      svg.appendChild(makeEdgeLabel(from, to, edge.label));
    }

    /* Edge toggle circle at midpoint (only in edit mode) */
    if (onToggleChild) {
      var toggle = makeEdgeToggle(from, to, color, edge.id, function() {
        onToggleChild(fromNode.id, toNode.id);
      });
      svg.appendChild(toggle);
    }
  });
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
  hit.setAttribute('stroke-width', '14');
  hit.setAttribute('fill', 'none');
  hit.setAttribute('class', 'edge-hit');
  hit.style.cursor = 'pointer';
  hit.style.pointerEvents = 'stroke';
  hit.dataset.edgeId = edgeId;
  return hit;
}

/* --- Edge toggle circle at midpoint of a visible edge --- */
/* 8px diameter circle, appears on hover, click collapses the child branch */
function makeEdgeToggle(from, to, color, edgeId, onClick) {
  var mx = (from.x + to.x) / 2;
  var my = (from.y + to.y) / 2;

  var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'edge-toggle');
  g.style.cursor = 'pointer';

  /* Background circle */
  var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', mx);
  circle.setAttribute('cy', my);
  circle.setAttribute('r', '5');
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', '#fff');
  circle.setAttribute('stroke-width', '1');
  g.appendChild(circle);

  /* Minus icon (horizontal line) */
  var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', mx - 3);
  line.setAttribute('y1', my);
  line.setAttribute('x2', mx + 3);
  line.setAttribute('y2', my);
  line.setAttribute('stroke', '#fff');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linecap', 'round');
  g.appendChild(line);

  /* Click handler */
  g.addEventListener('click', function(e) {
    e.stopPropagation();
    onClick();
  });

  return g;
}

/* --- Draw a collapsed stub: short line from parent EDGE + count badge --- */
/* stubIndex/stubTotal used to spread multiple badges horizontally.        */
function drawCollapsedStub(svg, from, toNode, fromEl, thick, color, count, edgeId, onToggleChild, parentId, stubIndex, stubTotal) {
  /* Calculate parent node edge (bottom center by default, spread if multiple) */
  var pw = fromEl ? fromEl.offsetWidth : 140;
  var ph = fromEl ? fromEl.offsetHeight : 40;
  var fromNode = null;
  /* Find the parent node data to get its x/y */
  var parentX = from.x - pw / 2;
  var parentY = from.y - ph / 2;

  /* Spread multiple stubs horizontally along the bottom edge */
  stubIndex = stubIndex || 0;
  stubTotal = stubTotal || 1;
  var spacing = Math.min(40, pw / (stubTotal + 1));
  var startOffset = -(stubTotal - 1) * spacing / 2;
  var xOff = startOffset + stubIndex * spacing;

  /* Start point: bottom edge of parent, spread horizontally */
  var startX = from.x + xOff;
  var startY = parentY + ph + 2; /* just below the node */

  /* End point: below the start with gap */
  var stubLen = 20;
  var endX = startX;
  var endY = startY + stubLen;

  /* Stub line */
  var stub = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  stub.setAttribute('x1', startX);
  stub.setAttribute('y1', startY);
  stub.setAttribute('x2', endX);
  stub.setAttribute('y2', endY);
  stub.setAttribute('stroke', color);
  stub.setAttribute('stroke-width', thick);
  stub.setAttribute('stroke-linecap', 'round');
  stub.setAttribute('stroke-dasharray', '4,3');
  stub.setAttribute('class', 'edge-stub');
  stub.style.pointerEvents = 'none';
  svg.appendChild(stub);

  /* Count badge at end of stub - BELOW the node with clear gap */
  var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'collapse-badge');
  g.style.cursor = 'pointer';

  var badgeW = count > 9 ? 24 : 18;
  var badgeY = endY + 2;
  var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', endX - badgeW / 2);
  rect.setAttribute('y', badgeY - 8);
  rect.setAttribute('width', badgeW);
  rect.setAttribute('height', 16);
  rect.setAttribute('rx', 8);
  rect.setAttribute('ry', 8);
  rect.setAttribute('fill', '#2a2520');
  rect.setAttribute('stroke', color);
  rect.setAttribute('stroke-width', '1');
  g.appendChild(rect);

  var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', endX);
  text.setAttribute('y', badgeY + 4);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', '#ffffff');
  text.setAttribute('font-size', '10');
  text.setAttribute('font-family', 'Nunito Sans, sans-serif');
  text.setAttribute('font-weight', '700');
  text.textContent = count;
  g.appendChild(text);

  /* Click badge to expand */
  if (onToggleChild) {
    g.addEventListener('click', function(e) {
      e.stopPropagation();
      onToggleChild(parentId, toNode.id);
    });
  }

  svg.appendChild(g);
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
