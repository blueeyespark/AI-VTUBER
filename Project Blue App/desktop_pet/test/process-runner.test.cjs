"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { runBoundedProcess } = require("../process-runner.cjs");

test("bounded process returns normal output", async () => {
  const output = await runBoundedProcess(
    process.execPath,
    ["-e", "process.stdout.write('blue')"],
    { windowsHide: true, shell: false },
    { timeoutMs: 2000, maxOutputBytes: 1024 }
  );
  assert.equal(output, "blue");
});

test("bounded process stops excessive output", async () => {
  await assert.rejects(
    runBoundedProcess(
      process.execPath,
      ["-e", "process.stdout.write('x'.repeat(4096))"],
      { windowsHide: true, shell: false },
      { timeoutMs: 2000, maxOutputBytes: 64 }
    ),
    /excessive output/
  );
});

test("bounded process times out", async () => {
  await assert.rejects(
    runBoundedProcess(
      process.execPath,
      ["-e", "setTimeout(() => {}, 5000)"],
      { windowsHide: true, shell: false },
      { timeoutMs: 75, maxOutputBytes: 1024 }
    ),
    /timed out/
  );
});

test("bounded process supports user cancellation", async () => {
  const controller = new AbortController();
  const running = runBoundedProcess(
    process.execPath,
    ["-e", "setTimeout(() => {}, 5000)"],
    { windowsHide: true, shell: false },
    { timeoutMs: 2000, maxOutputBytes: 1024, signal: controller.signal }
  );
  setTimeout(() => controller.abort(), 40);
  await assert.rejects(running, /cancelled by the user/);
});

test("bounded process can send private input over stdin", async () => {
  const output = await runBoundedProcess(
    process.execPath,
    ["-e", "process.stdin.on('data', d => process.stdout.write(d))"],
    { input: "Blue stdin" },
    { timeoutMs: 2000, maxOutputBytes: 1024 }
  );
  assert.equal(output, "Blue stdin");
});
