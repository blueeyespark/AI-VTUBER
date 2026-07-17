(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("ResizeHandle", {
    mount(target, props = {}) {
      const axis = props.axis === "y" ? "y" : "x";
      const handle = ui.createElement("div", { className: `pb-resize-handle ${axis}`, attributes: { role: "separator", tabindex: "0", "aria-orientation": axis === "x" ? "vertical" : "horizontal", "aria-label": props.label || "Resize panel" } });
      let start = 0; let initial = 0;
      const move = event => props.onResize?.(Math.max(props.min || 0, Math.min(props.max || Infinity, initial + ((axis === "x" ? event.clientX : event.clientY) - start))));
      const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); props.onCommit?.(); };
      handle.addEventListener("pointerdown", event => { start = axis === "x" ? event.clientX : event.clientY; initial = Number(props.value || 0); handle.setPointerCapture?.(event.pointerId); window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop, { once: true }); });
      target.replaceChildren(handle); return handle;
    }
  });
})();
