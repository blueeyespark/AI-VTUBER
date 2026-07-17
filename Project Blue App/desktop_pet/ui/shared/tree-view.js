(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  function renderNode(node, props, depth = 0) {
    const hasChildren = Array.isArray(node.children) && node.children.length;
    const row = ui.createElement("button", {
      className: `pb-tree-row ${node.id === props.activeId ? "active" : ""}`,
      text: `${hasChildren ? (node.expanded ? "▾ " : "▸ ") : ""}${node.label || node.name || node.id}`,
      attributes: { type: "button", style: `padding-left:${8 + depth * 14}px`, title: node.path || node.label || node.id },
      events: { click: () => props.onSelect?.(node) }
    });
    const fragment = document.createDocumentFragment();
    fragment.append(row);
    if (hasChildren && node.expanded) for (const child of node.children) fragment.append(renderNode(child, props, depth + 1));
    return fragment;
  }
  ui.register("TreeView", {
    mount(target, props = {}) {
      const root = ui.createElement("div", { className: "pb-tree-view", attributes: { role: "tree" } });
      for (const node of props.nodes || []) root.append(renderNode(node, props));
      target.replaceChildren(root);
      return root;
    }
  });
})();
