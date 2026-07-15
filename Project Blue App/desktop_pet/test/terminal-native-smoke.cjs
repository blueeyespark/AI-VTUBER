"use strict";
const { BlueTerminalService } = require("../terminal-service.cjs");
const service = new BlueTerminalService(process.cwd());
const timeout = setTimeout(() => { service.closeAll(); console.error("Native PTY smoke test timed out."); process.exit(1); }, 8000);
service.onEvent(event => {
  if (event.type === "data" && event.data.includes("BLUE_NATIVE_PTY_OK")) {
    clearTimeout(timeout); console.log("Native PTY smoke test passed."); service.write(session.id, "exit\r\n"); setTimeout(() => process.exit(0), 750);
  }
});
const session = service.create({ profile: "cmd", cwd: "." });
service.write(session.id, "echo BLUE_NATIVE_PTY_OK\r\n");
