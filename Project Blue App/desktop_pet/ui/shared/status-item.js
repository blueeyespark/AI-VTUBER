(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("StatusItem", {
    mount(target, props = {}) {
      const root = ui.createElement(props.button ? "button" : "span", {
        className: `pb-status-item ${props.state || "neutral"}`,
        text: `${props.label || "Status"}: ${props.value ?? "unknown"}`,
        attributes: { type: props.button ? "button" : null, title: props.title || null },
        events: { click: props.onClick }
      });
      target.replaceChildren(root);
      return root;
    }
  });
})();
