/* ============================================================
   AUTOLAYOUT.JS - Automatic tree layout algorithm
   Arranges nodes in a left-to-right tree based on edge
   connections. Uses a simple recursive algorithm (no library).
   ============================================================ */

/* --- Main auto-layout function --- */
/* Takes the map data and rearranges node x/y positions.
   Returns the modified nodes array. */
function autoLayout(nodes, edges) {
  if (nodes.length === 0) return nodes;

  /* Step 1: Build adjacency map (parent -> children) */
  const childrenMap = {};  // nodeId -> [childId, ...]
  const hasParent = {};    // nodeId -> true if it's a child of something
  edges.forEach(e => {
    if (!childrenMap[e.from]) childrenMap[e.from] = [];
    childrenMap[e.from].push(e.to);
    hasParent[e.to] = true;
  });

  /* Step 2: Find root nodes (nodes with no incoming edges) */
  let roots = nodes.filter(n => !hasParent[n.id]).map(n => n.id);
  /* If no roots found (cycle), just pick the first node */
  if (roots.length === 0) roots = [nodes[0].id];

  /* Step 3: Layout configuration */
  const H_GAP = 220;   // Horizontal gap between levels (columns)
  const V_GAP = 60;    // Vertical gap between siblings
  const START_X = 100;  // Starting X position for roots
  const START_Y = 80;   // Starting Y position

  /* Step 4: Calculate subtree sizes (needed for vertical centering) */
  /* Returns the total height a subtree needs */
  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  /* Track which nodes have been laid out (avoid infinite loops in cycles) */
  const visited = new Set();

  /* --- Calculate the height of a subtree --- */
  /* Each leaf node takes up V_GAP, branches sum their children */
  function subtreeHeight(nodeId) {
    if (visited.has(nodeId)) return V_GAP;
    visited.add(nodeId);
    const children = childrenMap[nodeId] || [];
    if (children.length === 0) return V_GAP;
    let total = 0;
    children.forEach(childId => {
      total += subtreeHeight(childId);
    });
    return total;
  }

  /* Pre-calculate heights for all roots */
  visited.clear();
  const heights = {};
  function calcHeights(nodeId) {
    if (heights[nodeId] !== undefined) return heights[nodeId];
    visited.add(nodeId);
    const children = childrenMap[nodeId] || [];
    if (children.length === 0) {
      heights[nodeId] = V_GAP;
      return V_GAP;
    }
    let total = 0;
    children.forEach(cid => {
      if (!visited.has(cid)) total += calcHeights(cid);
      else total += V_GAP;
    });
    heights[nodeId] = total;
    return total;
  }
  roots.forEach(r => { visited.clear(); calcHeights(r); });

  /* Step 5: Position nodes recursively */
  const positioned = new Set();

  /* --- Lay out a single node and its subtree --- */
  /* depth = horizontal level, yStart = top of available vertical space */
  function layoutNode(nodeId, depth, yStart) {
    if (positioned.has(nodeId)) return;
    positioned.add(nodeId);

    const node = nodeMap[nodeId];
    if (!node) return;

    const x = START_X + depth * H_GAP;
    const children = childrenMap[nodeId] || [];

    if (children.length === 0) {
      /* Leaf node: place at the center of its allocated space */
      node.x = x;
      node.y = yStart + V_GAP / 2 - 20;
    } else {
      /* Branch node: first layout children, then center this node */
      let currentY = yStart;
      children.forEach(childId => {
        const h = heights[childId] || V_GAP;
        layoutNode(childId, depth + 1, currentY);
        currentY += h;
      });
      /* Center the parent vertically between its first and last child */
      const firstChild = nodeMap[children[0]];
      const lastChild = nodeMap[children[children.length - 1]];
      if (firstChild && lastChild) {
        node.x = x;
        node.y = (firstChild.y + lastChild.y) / 2;
      } else {
        node.x = x;
        node.y = yStart;
      }
    }
  }

  /* Step 6: Layout each root tree, stacking them vertically */
  let currentRootY = START_Y;
  roots.forEach(rootId => {
    visited.clear();
    const h = heights[rootId] || V_GAP;
    layoutNode(rootId, 0, currentRootY);
    currentRootY += h + V_GAP;
  });

  /* Step 7: Handle orphan nodes (not connected to any tree) */
  /* Place them in a column on the right side */
  let orphanY = START_Y;
  nodes.forEach(n => {
    if (!positioned.has(n.id)) {
      n.x = START_X + 4 * H_GAP; // far right column
      n.y = orphanY;
      orphanY += V_GAP;
    }
  });

  return nodes;
}
