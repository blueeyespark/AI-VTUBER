(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("CommandCenter", {
    mount(target, props = {}) {
      const input = ui.createElement("input", { className: "pb-command-input", attributes: { type: "search", placeholder: props.placeholder || "Search Project Blue or type > for commands", "aria-label": "Command center" }, events: { input: event => props.onQuery?.(event.target.value), keydown: event => { if (event.key === "Enter") props.onExecute?.(event.target.value); if (event.key === "Escape") props.onDismiss?.(); } } });
      target.replaceChildren(input); return input;
    }
  });
})();
