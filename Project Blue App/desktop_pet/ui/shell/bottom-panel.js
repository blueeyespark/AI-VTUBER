(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("BottomPanel", {
    mount(target, props = {}) {
      const root = ui.createElement("section", { className: "pb-bottom-panel", attributes: { hidden: props.open ? null : true } });
      const tabs = ui.createElement("div", { className: "pb-bottom-tabs" });
      for (const tab of props.tabs || []) tabs.append(ui.createElement("button", { className: tab.id === props.activeId ? "active" : "", text: tab.label || tab.id, attributes: { type: "button" }, events: { click: () => props.onSelect?.(tab.id) } }));
      tabs.append(ui.createElement("button", { text: "×", attributes: { type: "button", title: "Close panel" }, events: { click: props.onClose } }));
      const body = ui.createElement("div", { className: "pb-bottom-body" });
      if (props.content instanceof Node) body.append(props.content); else body.textContent = props.content || "";
      root.append(tabs, body); target.replaceChildren(root); return root;
    }
  });
})();
