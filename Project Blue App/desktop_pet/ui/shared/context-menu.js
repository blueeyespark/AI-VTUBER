(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("ContextMenu", {
    mount(target, props = {}) {
      const menu = ui.createElement("div", { className: "pb-context-menu", attributes: { role: "menu" } });
      for (const item of props.items || []) menu.append(ui.createElement("button", { text: item.label, attributes: { type: "button", role: "menuitem", disabled: Boolean(item.disabled) }, events: { click: event => { item.onSelect?.(event); props.onClose?.(); } } }));
      target.replaceChildren(menu); return menu;
    }
  });
})();
