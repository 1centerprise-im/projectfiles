/* ============================================================
   EDGES.JS - Edge rendering, creation, deletion, formatting
   Draws SVG paths between nodes, handles selection, labels,
   and custom per-edge thickness/color.
   ============================================================ */

/* --- Render all edges into the SVG layer --- */
/* Clears existing paths and redraws from edge data array */
function renderAllEdges(svg, edges, nodes, nodeElements, globalThickness, globalColor) {
  /* Clear previous edge elements */
  svg.innerHTML = '';

  edges.forEach(edge => {
    /* Find the source and target node data */
    const fromNode = nodes.find(n => n.id === edge.from);
    const toNode = nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) return;

    /* Skip edges to/from hidden (collapsed) nodes */
    const fromEl = nodeElements[edge.from];
    const toEl = nodeElements[edge.to];
    if (!fromEl || !toEl) return;
    if (fromEl.style.display === 'none' || toEl.style.display === 'none') return;

    /* Get center points of both nodes */
    const from = getNodeCenter(fromNode, fromEl);
    const to = getNodeCenter(toNode, toEl);

    /* Determine edge style (per-edge or global fallback) */
    const thickness = edge.thickness || globalThickness || 2;
    const color = edge.color || globalColor || '#b8b0a6';

    /* Create the visible edge path */
    const path = createEdgePath(from, to, thickness, color, edge.id);
    svg.appendChild(path);

    /* Create a wider invisible hit area for easier clicking */
    const hitPath = createEdgeHitArea(from, to, edge.id);
    svg.appendChild(hitPath);

    /* Add edge label if present */
    if (edge.label) {
      const labelEl = createEdgeLabel(from, to, edge.label);
      svg.appendChild(labelEl);
    }
  });
}

/* --- Create a curved SVG path between two points --- */
/* Uses a cubic bezier with horizontal control points for a nice curve */
function createEdgePath(from, to, thickness, color, edgeId) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = calcBezierPath(from, to);
  path.setAttribute('d', d);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', thickness);
  path.setAttribute('fill', 'none');
  path.setAttribute('class', 'edge-path');
  path.dataset.edgeId = edgeId;
  return path;
}

/* --- Create invisible wider hit area for click detection --- */
function createEdgeHitArea(from, to, edgeId) {
  const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = calcBezierPath(from, to);
  hit.setAttribute('d', d);
  hit.setAttribute('class', 'edge-hit');
  hit.dataset.edgeId = edgeId;
  return hit;
}

/* --- Calculate a cubic bezier path string --- */
/* Control points are offset horizontally for a smooth S-curve */
function calcBezierPath(from, to) {
  const dx = Math.abs(to.x - from.x);
  /* Control point offset: at least 40px, scaled by distance */
  const offset = Math.max(40, dx * 0.4);
  const c1x = from.x + offset;
  const c1y = from.y;
  const c2x = to.x - offset;
  const c2y = to.y;
  return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
}

/* --- Create an edge label at the midpoint --- */
function createEdgeLabel(from, to, text) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2 - 8;
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', midX);
  label.setAttribute('y', midY);
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('class', 'edge-label');
  label.textContent = text;
  return label;
}

/* --- Create a new edge data object --- */
function createEdgeData(id, fromId, toId) {
  return {
    id: id,
    from: fromId,
    to: toId
    /* thickness and color are optional; fallback to global */
  };
}

/* --- Highlight a selected edge (add CSS class) --- */
function selectEdge(svg, edgeId) {
  /* Remove previous selection */
  deselectAllEdges(svg);
  /* Highlight the selected one */
  const paths = svg.querySelectorAll(`.edge-path[data-edge-id="${edgeId}"]`);
  paths.forEach(p => p.classList.add('selected'));
}

/* --- Remove selection highlight from all edges --- */
function deselectAllEdges(svg) {
  svg.querySelectorAll('.edge-path.selected').forEach(p => p.classList.remove('selected'));
}

/* --- Delete an edge by ID from the data array --- */
/* Returns the updated array without the deleted edge */
function deleteEdge(edges, edgeId) {
  return edges.filter(e => e.id !== edgeId);
}

/* --- Delete all edges connected to a node --- */
/* Used when deleting a node to clean up its edges */
function deleteEdgesForNode(edges, nodeId) {
  return edges.filter(e => e.from !== nodeId && e.to !== nodeId);
}

/* --- Draw a temporary connection line (while dragging) --- */
/* Used during the connect-drag operation */
function drawTempConnectLine(svg, from, to) {
  /* Remove any existing temp line */
  removeTempConnectLine(svg);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', from.x);
  line.setAttribute('y1', from.y);
  line.setAttribute('x2', to.x);
  line.setAttribute('y2', to.y);
  line.setAttribute('stroke', '#e07b3a');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '6,4');
  line.setAttribute('class', 'temp-connect-line');
  line.style.pointerEvents = 'none';
  svg.appendChild(line);
}

/* --- Remove the temporary connection line --- */
function removeTempConnectLine(svg) {
  const existing = svg.querySelector('.temp-connect-line');
  if (existing) existing.remove();
}

/* --- Check if an edge already exists between two nodes --- */
function edgeExists(edges, fromId, toId) {
  return edges.some(e =>
    (e.from === fromId && e.to === toId) ||
    (e.from === toId && e.to === fromId)
  );
}
