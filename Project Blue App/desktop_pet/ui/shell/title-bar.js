(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("TitleBar", {
    mount(target, props = {}) {
      const root = ui.createElement("header", { className: "pb-title-bar" });
      root.append(ui.createElement("div", { className: "brand", text: props.title || "Project Blue" }));
      const command = ui.createElement("div", { className: "command" });
      ui.mount("CommandCenter", command, props.command || {});
      root.append(command);
      const actions = ui.createElement("div", { className: "actions" });
      for (const action of props.actions || []) { const slot = ui.createElement("span"); actions.append(slot); ui.mount("IconButton", slot, action); }
      root.append(actions); target.replaceChildren(root); return root;
    }
  });
})();
