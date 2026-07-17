(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("EditorTabs", {
    mount(target, props = {}) {
      const root = ui.createElement("div", { className: "pb-editor-tabs", attributes: { role: "tablist" } });
      for (const editor of props.editors || []) {
        const tab = ui.createElement("button", { className: editor.id === props.activeId ? "active" : "", attributes: { type: "button", role: "tab", "aria-selected": editor.id === props.activeId }, events: { click: () => props.onSelect?.(editor.id), auxclick: event => { if (event.button === 1 && editor.closable) props.onClose?.(editor.id); } } });
        tab.append(ui.createElement("span", { text: editor.title || editor.id }));
        if (editor.dirty) tab.append(ui.createElement("span", { className: "dirty", text: "●", attributes: { title: "Unsaved changes" } }));
        if (editor.closable) tab.append(ui.createElement("span", { className: "close", text: "×", attributes: { title: "Close" }, events: { click: event => { event.stopPropagation(); props.onClose?.(editor.id); } } }));
        root.append(tab);
      }
      target.replaceChildren(root); return root;
    }
  });
})();
