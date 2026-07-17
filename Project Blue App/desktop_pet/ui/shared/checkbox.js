(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("Checkbox", {
    mount(target, props = {}) {
      const input = ui.createElement("input", { attributes: { type: "checkbox", checked: Boolean(props.checked) }, events: { change: event => props.onChange?.(event.target.checked, event) } });
      const root = ui.createElement("label", { className: "pb-checkbox", children: [input, ui.createElement("span", { text: props.label || "Option" })] });
      target.replaceChildren(root);
      return root;
    }
  });
})();
