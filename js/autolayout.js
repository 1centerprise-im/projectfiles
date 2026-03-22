/* ============================================================
   AUTOLAYOUT.JS - Automatic tree layout algorithm
   Arranges nodes left-to-right based on edge connections.
   Simple recursive algorithm, no external libraries.
   ============================================================ */

/* --- Main auto-layout function --- */
/* Modifies node x/y positions in place. Returns the nodes array. */
function autoLayout(nodes, edges) {
  if (!nodes.length) return nodes;

  /* Step 1: Build parent->children adjacency map */
  var childMap = {};  /* nodeId -> [childId, ...] */
  var hasParent = {}; /* nodeId -> true if has incoming edge */
  edges.forEach(function(e) {
    if (!childMap[e.from]) childMap[e.from] = [];
    childMap[e.from].push(e.to);
    hasParent[e.to] = true;
  });

  /* Step 2: Find root nodes (no incoming edges) */
  var roots = nodes.filter(function(n) { return !hasParent[n.id]; }).map(function(n) { return n.id; });
  if (!roots.length) roots = [nodes[0].id]; /* fallback: pick first node */

  /* Step 3: Layout config */
  var H_GAP = 220;  /* horizontal gap between tree levels */
  var V_GAP = 60;   /* vertical gap between sibling nodes */
  var START_X = 100;
  var START_Y = 80;

  /* Build lookup map: id -> node */
  var nodeMap = {};
  nodes.forEach(function(n) { nodeMap[n.id] = n; });

  /* Step 4: Calculate subtree heights (for vertical centering) */
  var heights = {};
  var visited = {};

  function calcHeight(id) {
    if (heights[id] !== undefined) return heights[id];
    if (visited[id]) return V_GAP;
    visited[id] = true;
    var children = childMap[id] || [];
    if (!children.length) { heights[id] = V_GAP; return V_GAP; }
    var total = 0;
    children.forEach(function(cid) { total += calcHeight(cid); });
    heights[id] = total;
    return total;
  }
  roots.forEach(function(r) { visited = {}; calcHeight(r); });

  /* Step 5: Position nodes recursively */
  var positioned = {};

  function layoutNode(id, depth, yStart) {
    if (positioned[id]) return;
    positioned[id] = true;
    var node = nodeMap[id];
    if (!node) return;
    var x = START_X + depth * H_GAP;
    var children = childMap[id] || [];
    if (!children.length) {
      /* Leaf: place at center of allocated space */
      node.x = x;
      node.y = yStart + V_GAP / 2 - 20;
    } else {
      /* Branch: layout children first, then center parent */
      var curY = yStart;
      children.forEach(function(cid) {
        layoutNode(cid, depth + 1, curY);
        curY += (heights[cid] || V_GAP);
      });
      var first = nodeMap[children[0]];
      var last = nodeMap[children[children.length - 1]];
      node.x = x;
      node.y = (first && last) ? (first.y + last.y) / 2 : yStart;
    }
  }

  /* Step 6: Layout each root tree, stacking vertically */
  var rootY = START_Y;
  roots.forEach(function(rid) {
    layoutNode(rid, 0, rootY);
    rootY += (heights[rid] || V_GAP) + V_GAP;
  });

  /* Step 7: Place orphan nodes (not in any tree) on the far right */
  var orphanY = START_Y;
  nodes.forEach(function(n) {
    if (!positioned[n.id]) {
      n.x = START_X + 4 * H_GAP;
      n.y = orphanY;
      orphanY += V_GAP;
    }
  });

  return nodes;
}
