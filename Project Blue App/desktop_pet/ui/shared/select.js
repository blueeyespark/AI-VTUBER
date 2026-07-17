(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("Select", {
    mount(target, props = {}) {
      const select = ui.createElement("select", { className: "pb-select", attributes: { "aria-label": props.label || "Select" }, events: { change: event => props.onChange?.(event.target.value, event) } });
      for (const option of props.options || []) select.append(ui.createElement("option", { text: option.label ?? option.value, attributes: { value: option.value, selected: option.value === props.value } }));
      target.replaceChildren(select);
      return select;
    }
  });
})();
