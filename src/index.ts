import { spawn } from "child_process";
import * as which from "which";
import { join, isAbsolute } from "path";
import * as pty from "node-pty";
import { debugLog, createErrorFunction } from "./logging";
import { ReliableWebSocket } from "./ReliableWebSocket";

export function run() {
  if (process.argv.length < 3) {
    console.error("forward-logs expects a command to be passed");
    process.exit(1);
  }

  const command = process.argv[2];
  const args = process.argv.slice(3);

  const forwardLogsUrl = process.env.FORWARD_LOGS_URL;
  const forwardLogsUsePty =
    process.env.FORWARD_LOGS_USE_PTY === undefined
      ? process.stdin.isTTY && process.stdout.isTTY
      : process.env.FORWARD_LOGS_USE_PTY === "true";

  if (forwardLogsUrl === undefined) {
    console.error(
      "forward-logs expects the FORWARD_LOGS_URL environment variable to be set"
    );
    process.exit(1);
  }

  let isStdOutOpen = true;
  let isStdErrOpen = true;
  let processExited = false;
  let processExitCode: number | null = null;
  let isShuttingDown = false;

  debugLog("starting command: " + command);
  debugLog("with arguments: " + JSON.stringify(args));

  debugLog("connecting to " + forwardLogsUrl);
  const ws = new ReliableWebSocket(forwardLogsUrl);

  function handlePotentialExit() {
    if (!isStdOutOpen && !isStdErrOpen && processExited) {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      debugLog("process and all streams have shutdown");
      let content = null;
      if (processExitCode === null) {
        content = JSON.stringify({
          processShutdown: true,
          processHasExitCode: false,
          processExitCode: null
        });
      } else {
        content = JSON.stringify({
          processShutdown: true,
          processHasExitCode: true,
          processExitCode: processExitCode.toString()
        });
      }
      setImmediate(async () => {
        await ws.shutdown(content);
        process.exit();
      });
    }
  }

  if (forwardLogsUsePty) {
    debugLog("spawning process with pty");
    let resolvedCommand = which.sync(command);
    if (!isAbsolute(resolvedCommand)) {
      resolvedCommand = join(process.cwd(), resolvedCommand);
    }
    const cp = pty.spawn(resolvedCommand, args, {
      name: "xterm",
      cols: process.stdout.columns,
      rows: process.stdout.rows,
      cwd: process.cwd(),
      env: process.env
    });
    debugLog("wiring up terminal resize propagation");
    process.stdout.on("resize", () => {
      cp.resize(process.stdout.columns, process.stdout.rows);
    });
    debugLog("connecting child process stdout to websocket");
    cp.on("data", chunk => {
      ws.writeString(chunk);
      process.stdout.write(chunk);
    });
    debugLog("listening for child process exit");
    cp.on("exit", code => {
      debugLog("stdout closed");
      isStdOutOpen = false;

      debugLog("process exited with exit code: " + code);
      process.exitCode = code;
      processExited = true;
      handlePotentialExit();
    });
    cp.on("exit", () => {
      handlePotentialExit();
    });
    isStdErrOpen = false; /* terminals do not support stderr */
  } else {
    debugLog("spawning process with child_process");
    const cp = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"]
    });
    cp.on("error", createErrorFunction("child process error"));
    if (cp.stdout !== null) {
      debugLog("connecting child process stdout to websocket");
      cp.stdout.on("data", chunk => {
        ws.write(chunk);
        process.stdout.write(chunk);
      });
      cp.stdout.on("error", createErrorFunction("piped stdout error"));
      cp.stdout.on("end", () => {
        debugLog("stdout closed");
        isStdOutOpen = false;
        handlePotentialExit();
      });
    } else {
      isStdOutOpen = false;
    }
    if (cp.stderr !== null) {
      debugLog("connecting child process stderr to websocket");
      cp.stderr.on("data", chunk => {
        ws.write(chunk);
        process.stderr.write(chunk);
      });
      cp.stderr.on("error", createErrorFunction("piped stderr error"));
      cp.stderr.on("end", () => {
        debugLog("stderr closed");
        isStdErrOpen = false;
        handlePotentialExit();
      });
    } else {
      isStdErrOpen = false;
    }
    debugLog("listening for child process exit");
    cp.on("exit", code => {
      debugLog("process exited with exit code: " + code);
      process.exitCode = code;
      processExited = true;
      handlePotentialExit();
    });
  }
  debugLog("waiting for execution to complete");
}
