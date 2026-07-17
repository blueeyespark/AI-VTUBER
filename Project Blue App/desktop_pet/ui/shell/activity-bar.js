(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("ActivityBar", {
    mount(target, props = {}) {
      const root = ui.createElement("nav", { className: "pb-activity-bar", attributes: { "aria-label": props.label || "Activities" } });
      for (const activity of props.activities || []) root.append(ui.createElement("button", {
        className: activity.id === props.activeId ? "active" : "",
        html: activity.svgIcon || activity.icon || "",
        attributes: { type: "button", title: activity.tooltip || activity.label || activity.id, "aria-label": activity.label || activity.id, "aria-pressed": activity.id === props.activeId },
        events: { click: () => props.onSelect?.(activity.id) }
      }));
      target.replaceChildren(root); return root;
    }
  });
})();
