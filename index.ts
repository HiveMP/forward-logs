import * as websocket from "websocket-stream";
import { spawn } from "child_process";

if (process.argv.length < 3) {
  console.error("forward-logs expects a command to be passed");
  process.exit(1);
}

const command = process.argv[2];
const args = process.argv.slice(3);

const forwardLogsIsDebug = process.env.FORWARD_LOGS_DEBUG === "true";
const forwardLogsUrl = process.env.FORWARD_LOGS_URL;

if (forwardLogsUrl === undefined) {
  console.error(
    "forward-logs expects the FORWARD_LOGS_URL environment variable to be set"
  );
  process.exit(1);
}

let isStdOutOpen = true;
let isStdErrOpen = true;
let processExited = false;

function handlePotentialExit() {
  if (!isStdOutOpen && !isStdErrOpen && processExited) {
    debugLog("process and all streams have shutdown");
    process.exit();
  }
}

function debugLog(message) {
  if (forwardLogsIsDebug) {
    console.log("> " + message);
  }
}

function debugError(message) {
  if (forwardLogsIsDebug) {
    console.error("> " + message);
  }
}

function createErrorFunction(context) {
  return err => {
    debugError(context + ":");
    debugError(err);
  };
}

debugLog("connecting to " + forwardLogsUrl);
const ws = websocket(forwardLogsUrl);
ws.on("close", () => {
  debugLog("websocket closed");
});
ws.on("error", createErrorFunction("websocket error"));
debugLog("connecting websocket to stdout");
debugLog("spawning process");
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
debugLog("waiting for execution to complete");
