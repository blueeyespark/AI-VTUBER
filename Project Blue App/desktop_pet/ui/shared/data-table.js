(() => {
  const ui = window.ProjectBlueUI;
  if (!ui) return;
  ui.register("DataTable", {
    mount(target, props = {}) {
      const table = ui.createElement("table", { className: "pb-data-table" });
      const head = ui.createElement("thead");
      const headRow = ui.createElement("tr");
      for (const column of props.columns || []) headRow.append(ui.createElement("th", { text: column.label || column.key }));
      head.append(headRow); table.append(head);
      const body = ui.createElement("tbody");
      for (const row of props.rows || []) {
        const tr = ui.createElement("tr", { events: { click: () => props.onRowClick?.(row) } });
        for (const column of props.columns || []) tr.append(ui.createElement("td", { text: row[column.key] ?? "" }));
        body.append(tr);
      }
      table.append(body); target.replaceChildren(table); return table;
    }
  });
})();
