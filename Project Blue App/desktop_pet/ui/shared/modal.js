(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("Modal", {
    mount(target, props = {}) {
      const dialog = ui.createElement("dialog", { className: "pb-modal" });
      dialog.append(ui.createElement("header", { children: [ui.createElement("h3", { text: props.title || "Project Blue" })] }));
      const body = ui.createElement("div", { className: "pb-modal-body" });
      if (props.content instanceof Node) body.append(props.content); else body.textContent = props.content || "";
      dialog.append(body);
      const footer = ui.createElement("footer");
      for (const action of props.actions || [{ label: "Close", value: "close" }]) footer.append(ui.createElement("button", { text: action.label, attributes: { type: "button" }, events: { click: () => { props.onAction?.(action.value); dialog.close(action.value); } } }));
      dialog.append(footer);
      target.replaceChildren(dialog);
      if (props.open !== false && dialog.showModal) dialog.showModal();
      return dialog;
    }
  });
})();
