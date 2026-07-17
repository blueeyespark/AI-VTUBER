(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("EditorArea", {
    mount(target, props = {}) {
      const root = ui.createElement("main", { className: "pb-editor-area" });
      const tabs = ui.createElement("div");
      ui.mount("EditorTabs", tabs, { editors: props.editors || [], activeId: props.activeId, onSelect: props.onSelect, onClose: props.onClose });
      const content = ui.createElement("div", { className: "pb-editor-content" });
      if (props.content instanceof Node) content.append(props.content); else content.textContent = props.content || "";
      root.append(tabs, content); target.replaceChildren(root); return root;
    }
  });
})();
