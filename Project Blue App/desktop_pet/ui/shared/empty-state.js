(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("EmptyState", {
    mount(target, props = {}) {
      const actions = ui.createElement("div", { className: "pb-empty-actions" });
      for (const action of props.actions || []) {
        const slot = ui.createElement("span");
        actions.append(slot);
        ui.mount("Button", slot, { label: action.label, variant: action.variant || "secondary", onClick: action.onClick });
      }
      const root = ui.createElement("div", { className: "pb-empty-state", children: [
        ui.createElement("h3", { text: props.title || "Nothing open" }),
        ui.createElement("p", { text: props.message || "Choose an item to begin." }),
        actions
      ] });
      target.replaceChildren(root);
      return root;
    }
  });
})();
