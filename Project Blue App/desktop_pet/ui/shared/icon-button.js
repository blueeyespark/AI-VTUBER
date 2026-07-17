(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("IconButton", {
    mount(target, props = {}) {
      const button = ui.createElement("button", {
        className: ["pb-icon-button", props.className || ""].filter(Boolean).join(" "),
        html: props.icon || "",
        attributes: { type: "button", "aria-label": props.label || "Action", title: props.title || props.label || "Action", disabled: Boolean(props.disabled) },
        events: { click: props.onClick }
      });
      target.replaceChildren(button);
      return button;
    }
  });
})();
