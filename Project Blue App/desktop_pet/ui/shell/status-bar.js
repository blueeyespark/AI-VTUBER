(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("StatusBar", {
    mount(target, props = {}) {
      const root = ui.createElement("footer", { className: "pb-status-bar", attributes: { "aria-live": "polite" } });
      const left = ui.createElement("div", { className: "left" });
      const right = ui.createElement("div", { className: "right" });
      for (const status of props.left || []) { const slot = ui.createElement("span"); left.append(slot); ui.mount("StatusItem", slot, status); }
      for (const status of props.right || []) { const slot = ui.createElement("span"); right.append(slot); ui.mount("StatusItem", slot, status); }
      root.append(left, right); target.replaceChildren(root); return root;
    }
  });
})();
