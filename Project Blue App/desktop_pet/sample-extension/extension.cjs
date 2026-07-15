exports.activate = api => {
  api.registerCommand("blue.hello", args => ({ message: `Hello ${args?.name || "Creator"}!`, extensionId: api.extensionId }));
  api.log("Hello Workbench activated.");
  return { dispose() { api.log("Hello Workbench disposed."); } };
};
