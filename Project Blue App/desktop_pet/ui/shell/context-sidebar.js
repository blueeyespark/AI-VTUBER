(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("ContextSidebar", {
    mount(target, props = {}) {
      const root = ui.createElement("aside", { className: "pb-context-sidebar" });
      root.append(ui.createElement("header", { children: [ui.createElement("h2", { text: props.title || "Explorer" })] }));
      const body = ui.createElement("div", { className: "pb-context-sidebar-body" });
      for (const group of props.groups || []) {
        const section = ui.createElement("section", { className: "pb-sidebar-group" });
        section.append(ui.createElement("h3", { text: group.title || "Group" }));
        for (const item of group.items || []) section.append(ui.createElement("button", { className: item.id === props.activeId ? "active" : "", text: item.label || item.title || item.id || item, attributes: { type: "button" }, events: { click: () => props.onSelect?.(item.id || item) } }));
        body.append(section);
      }
      root.append(body); target.replaceChildren(root); return root;
    }
  });
})();
