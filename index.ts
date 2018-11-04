import * as websocket from "websocket-stream";
import { spawn } from "child_process";
import * as which from "which";
import { join, isAbsolute, resolve } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

// Patch for native build at runtime when trying to load
// the pty.node file.
module.constructor.prototype.require = function(path) {
  var self = this;
  try {
    return self.constructor._load(path, self);
  } catch (err) {
    if (path.indexOf("pty.node") !== -1) {
      // This is the pty.node file, extract assets then try again.
      if (!existsSync("pty.node")) {
        writeFileSync(
          join(__dirname, "pty.node"),
          readFileSync("./node_modules/node-pty/build/Release/pty.node")
        );
      }
      if (!existsSync("winpty-agent.exe")) {
        writeFileSync(
          join(__dirname, "winpty-agent.exe"),
          readFileSync("./node_modules/node-pty/build/Release/winpty-agent.exe")
        );
      }
      if (!existsSync("winpty.dll")) {
        writeFileSync(
          join(__dirname, "winpty.dll"),
          readFileSync("./node_modules/node-pty/build/Release/winpty.dll")
        );
      }
      return self.constructor._load(join(__dirname, "pty.node"), self);
    } else {
      throw err;
    }
  }
};

import * as pty from "node-pty";

if (process.argv.length < 3) {
  console.error("forward-logs expects a command to be passed");
  process.exit(1);
}

const command = process.argv[2];
const args = process.argv.slice(3);

const forwardLogsIsDebug = process.env.FORWARD_LOGS_DEBUG === "true";
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

debugLog("starting command: " + command);
debugLog("with arguments: " + JSON.stringify(args));

debugLog("connecting to " + forwardLogsUrl);
const ws = websocket(forwardLogsUrl, {
  binary: true,
  objectMode: true
});
ws.on("close", () => {
  debugLog("websocket closed");
});
ws.on("error", createErrorFunction("websocket error"));

function handlePotentialExit() {
  if (!isStdOutOpen && !isStdErrOpen && processExited) {
    debugLog("process and all streams have shutdown");
    /*console.error(ws);
    ws._writable._flush(err => {
      if (err) {
        debugError("error while closing websocket on process exit:");
        debugError(err);
      }

      // Data should all be flushed at this point...?
      process.exit();
    });*/
    ws.socket.close(1000, "process exited");
    process.exit();
    /*
    );*/
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
    ws.write(chunk);
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
