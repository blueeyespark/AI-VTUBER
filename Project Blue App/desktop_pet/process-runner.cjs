"use strict";

const { spawn } = require("node:child_process");

function runBoundedProcess(command, args, options = {}, limits = {}) {
  const timeoutMs = Number(limits.timeoutMs) || 45000;
  const maxOutputBytes = Number(limits.maxOutputBytes) || 2097152;
  const signal = limits.signal;
  if (signal?.aborted) {
    return Promise.reject(new Error("Blue's local helper was cancelled by the user."));
  }
  return new Promise((resolve, reject) => {
    const { input, ...spawnOptions } = options;
    const child = spawn(command, args, spawnOptions);
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let settled = false;
    let timer;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () => {
      child.kill();
      finish(reject, new Error("Blue's local helper was cancelled by the user."));
    };
    const capture = (target, data) => {
      if (settled) return target;
      outputBytes += data.length;
      if (outputBytes > maxOutputBytes) {
        child.kill();
        finish(reject, new Error("Blue stopped a helper that produced excessive output."));
        return target;
      }
      return target + data.toString("utf8");
    };

    timer = setTimeout(() => {
      child.kill();
      finish(
        reject,
        new Error(`Blue's local helper timed out after ${timeoutMs / 1000} seconds.`)
      );
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", data => { stdout = capture(stdout, data); });
    child.stderr?.on("data", data => { stderr = capture(stderr, data); });
    child.on("error", error => finish(reject, error));
    if (input !== undefined) {
      const content = String(input);
      if (Buffer.byteLength(content, "utf8") > 131072) {
        child.kill();
        finish(reject, new Error("Blue refused excessive helper input."));
      } else {
        child.stdin?.end(content, "utf8");
      }
    } else {
      child.stdin?.end();
    }
    child.on("close", code => {
      if (settled) return;
      if (code === 0) {
        finish(resolve, stdout.trim());
      } else {
        finish(
          reject,
          new Error(stderr.trim() || stdout.trim() || `Blue exited with ${code}`)
        );
      }
    });
  });
}

module.exports = { runBoundedProcess };
