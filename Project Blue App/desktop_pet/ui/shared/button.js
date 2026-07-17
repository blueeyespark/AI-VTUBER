(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("Button", {
    mount(target, props = {}) {
      const button = ui.createElement("button", {
        className: ["pb-button", props.variant || "primary", props.className || ""].filter(Boolean).join(" "),
        text: props.label || props.text || "Button",
        attributes: { type: props.type || "button", disabled: Boolean(props.disabled), title: props.title || null },
        events: { click: props.onClick }
      });
      target.replaceChildren(button);
      return button;
    }
  });
})();
