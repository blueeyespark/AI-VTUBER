(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("TextField", {
    mount(target, props = {}) {
      const input = ui.createElement(props.multiline ? "textarea" : "input", {
        className: "pb-text-field",
        attributes: { type: props.multiline ? null : (props.type || "text"), placeholder: props.placeholder || "", value: props.multiline ? null : (props.value ?? ""), rows: props.rows || null, "aria-label": props.label || props.placeholder || "Text field" },
        events: { input: event => props.onInput?.(event.target.value, event), change: event => props.onChange?.(event.target.value, event) }
      });
      if (props.multiline) input.value = props.value ?? "";
      target.replaceChildren(input);
      return input;
    }
  });
})();
