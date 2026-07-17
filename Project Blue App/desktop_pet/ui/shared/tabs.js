(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("Tabs", {
    mount(target, props = {}) {
      const root = ui.createElement("div", { className: "pb-tabs", attributes: { role: "tablist" } });
      for (const tab of props.tabs || []) root.append(ui.createElement("button", {
        className: tab.id === props.activeId ? "active" : "",
        text: tab.label || tab.title || tab.id,
        attributes: { type: "button", role: "tab", "aria-selected": tab.id === props.activeId, title: tab.title || tab.label || tab.id },
        events: { click: () => props.onSelect?.(tab.id) }
      }));
      target.replaceChildren(root);
      return root;
    }
  });
})();
