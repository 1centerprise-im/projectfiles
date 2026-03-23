/* ============================================================
   AUTOLAYOUT.JS - Top-down tree layout algorithm
   Arranges nodes top-to-bottom based on edge connections.
   Centers children under their parent. No crossing lines.
   ============================================================ */

function autoLayout(nodes, edges) {
  if (!nodes.length) return nodes;

  /* Build adjacency: parent -> children */
  var childMap = {};
  var hasParent = {};
  edges.forEach(function(e) {
    if (!childMap[e.from]) childMap[e.from] = [];
    childMap[e.from].push(e.to);
    hasParent[e.to] = true;
  });

  /* Find roots (no incoming edges) */
  var roots = nodes.filter(function(n) { return !hasParent[n.id]; }).map(function(n) { return n.id; });
  if (!roots.length) roots = [nodes[0].id];

  /* Layout config */
  var V_GAP = 150;   /* vertical spacing between levels */
  var H_GAP = 200;   /* horizontal spacing between siblings */
  var START_X = 100;
  var START_Y = 80;

  var nodeMap = {};
  nodes.forEach(function(n) { nodeMap[n.id] = n; });

  /* Calculate subtree width (horizontal span needed) */
  var widths = {};
  var visited = {};

  function calcWidth(id) {
    if (widths[id] !== undefined) return widths[id];
    if (visited[id]) return H_GAP;
    visited[id] = true;
    var children = childMap[id] || [];
    if (!children.length) {
      widths[id] = H_GAP;
      return H_GAP;
    }
    var total = 0;
    children.forEach(function(cid, i) {
      total += calcWidth(cid);
      if (i > 0) total += 0; /* gaps already in H_GAP */
    });
    widths[id] = total;
    return total;
  }
  roots.forEach(function(r) { visited = {}; calcWidth(r); });

  /* Position nodes: top-down, center children under parent */
  var positioned = {};

  function layoutNode(id, depth, xCenter) {
    if (positioned[id]) return;
    positioned[id] = true;
    var node = nodeMap[id];
    if (!node) return;

    node.x = xCenter - 70; /* center node (approx 140px wide) */
    node.y = START_Y + depth * V_GAP;

    var children = childMap[id] || [];
    if (!children.length) return;

    /* Total width of all children subtrees */
    var totalW = 0;
    children.forEach(function(cid) { totalW += (widths[cid] || H_GAP); });

    /* Start children from left edge, centered under parent */
    var startX = xCenter - totalW / 2;
    var curX = startX;

    children.forEach(function(cid) {
      var w = widths[cid] || H_GAP;
      layoutNode(cid, depth + 1, curX + w / 2);
      curX += w;
    });
  }

  /* Layout each root tree side by side */
  var totalRootWidth = 0;
  roots.forEach(function(rid) { totalRootWidth += (widths[rid] || H_GAP); });

  var curRootX = START_X + totalRootWidth / 2;
  if (roots.length === 1) {
    layoutNode(roots[0], 0, curRootX);
  } else {
    var rx = START_X;
    roots.forEach(function(rid) {
      var w = widths[rid] || H_GAP;
      layoutNode(rid, 0, rx + w / 2);
      rx += w + H_GAP;
    });
  }

  /* Place orphan nodes (not in any tree) below everything */
  var maxY = 0;
  nodes.forEach(function(n) { if (positioned[n.id] && n.y > maxY) maxY = n.y; });
  var orphanX = START_X;
  nodes.forEach(function(n) {
    if (!positioned[n.id]) {
      n.x = orphanX;
      n.y = maxY + V_GAP;
      orphanX += H_GAP;
    }
  });

  return nodes;
}
