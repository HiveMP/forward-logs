const gulp = require("gulp");
const mkdirp = require("mkdirp");
const { compile } = require("nexe");
const { spawn } = require("child_process");
const http = require("http");
const websocket = require("websocket-stream");
const path = require("path");
const join = path.join;
const { existsSync } = require("fs");
const stripAnsi = require("strip-ansi");
const rimraf = require("rimraf");

process.env.PROJECT_ROOT = __dirname;

async function execAsync(command, args, cwd) {
  return new Promise((resolve, reject) => {
    console.log([command, ...args]);
    const cp = spawn(command, args, {
      cwd: cwd,
      stdio: ["ignore", process.stdout, process.stderr]
    });
    cp.on("exit", code => {
      if (code !== 0) {
        reject(new Error("Got exit code: " + code));
      } else {
        resolve();
      }
    });
  });
}

async function captureAsync(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    console.log([command, ...args]);
    let data = "";
    const cp = spawn(command, args, {
      cwd: cwd,
      stdio: ["ignore", "pipe", process.stderr],
      env: env
    });
    cp.stdout.on("data", chunk => {
      data += chunk.toString();
    });
    cp.on("exit", code => {
      if (code !== 0) {
        reject(new Error("Got exit code: " + code));
      } else {
        resolve(data);
      }
    });
  });
}

async function captureAsyncPty(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    console.log([command, ...args]);
    let data = "";
    const cp = spawn(command, args, {
      cwd: cwd,
      stdio: ["ignore", "pipe", process.stderr],
      env: {
        ...env,
        FORWARD_LOGS_USE_PTY: "true"
      }
    });
    cp.stdout.on("data", chunk => {
      data += chunk.toString();
    });
    cp.on("exit", code => {
      if (code !== 0) {
        reject(new Error("Got exit code: " + code));
      } else {
        resolve(data);
      }
    });
  });
}

function cleanupPtyAssets() {
  if (existsSync(join(__dirname, "dist", "pty.node"))) {
    try {
      rimraf.sync(join(__dirname, "dist", "pty.node"), { disableGlob: true });
    } catch {}
  }
  if (existsSync(join(__dirname, "dist", "winpty-agent.exe"))) {
    try {
      rimraf.sync(join(__dirname, "dist", "winpty-agent.exe"), {
        disableGlob: true
      });
    } catch {}
  }
  if (existsSync(join(__dirname, "dist", "winpty.dll"))) {
    try {
      rimraf.sync(join(__dirname, "dist", "winpty.dll"), { disableGlob: true });
    } catch {}
  }
}

gulp.task("build-forward-logs", async () => {
  mkdirp.sync("dist");

  let tsc = join(__dirname, "node_modules", ".bin", "tsc");
  if (process.platform === "win32" && existsSync(tsc + ".cmd")) {
    tsc = tsc + ".cmd";
  }

  await execAsync(tsc, [], __dirname);

  cleanupPtyAssets();

  await compile({
    input: path.resolve("./startup.js"),
    output: "dist/forward-logs",
    enableStdIn: false,
    resources: [
      "./node_modules/node-pty/build/Release/pty.node",
      "./node_modules/node-pty/build/Release/winpty-agent.exe",
      "./node_modules/node-pty/build/Release/winpty.dll"
    ]
  });
});

gulp.task("build-test", async () => {
  await compile({
    input: path.resolve("./echo.js"),
    output: "echo",
    enableStdIn: false
  });
});

function createErrorFunction(context) {
  return err => {
    console.error(context + ":");
    console.error(err);
  };
}

async function runTest(captureFunc, getExpectedOutputs) {
  let chunks = [];
  let result = null;
  function handle(stream, request) {
    stream.on("data", chunk => {
      chunks.push(chunk);
    });
    stream.on("end", () => {
      result = Buffer.concat(chunks)
        .toString()
        .trim();
    });
    stream.on("error", err => {
      if (err.target.readyState === 3) {
        // WebSocket has already closed, this is OK. The Node.js ws
        // module emits ECONNRESET when WebSockets close normally.
      } else {
        result = Buffer.concat(chunks)
          .toString()
          .trim();
        createErrorFunction("error while processing WebSocket stream")(err);
      }
    });
  }
  const httpServer = http.createServer(req => {
    // nothing to do here.
  });
  httpServer.on("error", createErrorFunction("error during http server"));
  const port = await new Promise(resolve => {
    httpServer.on("listening", function() {
      resolve(httpServer.address().port);
    });
    httpServer.listen(0);
  });

  const websocketOutput = `0
1
2
3
4
5
6
7
8
9`.trim();
  const processOutputs = getExpectedOutputs(port).map(value => value.trim());

  const wss = websocket.createServer(
    { perMessageDeflate: false, server: httpServer },
    handle
  );

  try {
    const output = await captureFunc(
      join(__dirname, "dist", "forward-logs"),
      ["../echo"],
      join(__dirname, "dist"),
      {
        FORWARD_LOGS_URL: "ws://localhost:" + port,
        FORWARD_LOGS_DEBUG: true
      }
    );
    let anyMatch = false;
    for (let i = 0; i < processOutputs.length; i++) {
      if (
        stripAnsi(output)
          .replace(/\r\n/g, "\n")
          .trim() !== processOutputs[i].replace(/\r\n/g, "\n")
      ) {
        continue;
      } else {
        anyMatch = true;
        break;
      }
    }
    if (!anyMatch) {
      console.error(
        "test fail: didn't get expected output direct from executable, got output: "
      );
      console.error(stripAnsi(output).trim());
      process.exitCode = 1;
      return;
    } else {
      console.log("test pass: process output matched expected values!");
    }

    if (
      result === null ||
      stripAnsi(result)
        .replace(/\r\n/g, "\n")
        .trim() !== websocketOutput.replace(/\r\n/g, "\n")
    ) {
      console.error(
        "tests failed, didn't get expected output from WebSocket, got output: "
      );
      console.error(result);
      process.exitCode = 1;
      return;
    } else {
      console.log("test pass: WebSocket output matched expected values!");
    }
  } finally {
    await new Promise((resolve, reject) =>
      httpServer.close(err => {
        if (err) {
          createErrorFunction("error during http server shutdown")(err);
          reject(err);
        } else {
          resolve();
        }
      })
    );
  }
}

async function runDisconnectionTest(captureFunc, getExpectedOutputs) {
  let chunks = [];
  let result = null;
  function handle(stream, request) {
    stream.on("data", chunk => {
      if (chunk.toString().indexOf("disconnect server") !== -1) {
        stream.socket.close();
      }
      chunks.push(chunk);
    });
    stream.on("end", () => {
      result = Buffer.concat(chunks)
        .toString()
        .trim();
    });
    stream.on("error", err => {
      if (err.target.readyState === 3) {
        // WebSocket has already closed, this is OK. The Node.js ws
        // module emits ECONNRESET when WebSockets close normally.
      } else {
        result = Buffer.concat(chunks)
          .toString()
          .trim();
        createErrorFunction("error while processing WebSocket stream")(err);
      }
    });
  }
  const httpServer = http.createServer(req => {
    // nothing to do here.
  });
  httpServer.on("error", createErrorFunction("error during http server"));
  const port = await new Promise(resolve => {
    httpServer.on("listening", function() {
      resolve(httpServer.address().port);
    });
    httpServer.listen(0);
  });

  const websocketOutput = `0
1
2
3
4
disconnect server
5
6
7
8
9`.trim();
  const processOutputs = getExpectedOutputs(port).map(value => value.trim());

  const wss = websocket.createServer(
    { perMessageDeflate: false, server: httpServer },
    handle
  );

  try {
    const output = await captureFunc(
      join(__dirname, "dist", "forward-logs"),
      ["../echo", "1"],
      join(__dirname, "dist"),
      {
        FORWARD_LOGS_URL: "ws://localhost:" + port,
        FORWARD_LOGS_DEBUG: true
      }
    );
    let anyMatch = false;
    for (let i = 0; i < processOutputs.length; i++) {
      if (
        stripAnsi(output)
          .replace(/\r\n/g, "\n")
          .trim() !== processOutputs[i].replace(/\r\n/g, "\n")
      ) {
        continue;
      } else {
        anyMatch = true;
        break;
      }
    }
    if (!anyMatch) {
      console.error(
        "test fail: didn't get expected output direct from executable, got output: "
      );
      console.error(stripAnsi(output).trim());
      process.exitCode = 1;
      return;
    } else {
      console.log("test pass: process output matched expected values!");
    }

    if (
      result === null ||
      stripAnsi(result)
        .replace(/\r\n/g, "\n")
        .trim() !== websocketOutput.replace(/\r\n/g, "\n")
    ) {
      console.error(
        "tests failed, didn't get expected output from WebSocket, got output: "
      );
      console.error(result);
      process.exitCode = 1;
      return;
    } else {
      console.log("test pass: WebSocket output matched expected values!");
    }
  } finally {
    await new Promise((resolve, reject) =>
      httpServer.close(err => {
        if (err) {
          createErrorFunction("error during http server shutdown")(err);
          reject(err);
        } else {
          resolve();
        }
      })
    );
  }
}

gulp.task("run-test-child-process", async () => {
  try {
    await runTest(captureAsync, port => [
      `
> starting command: ../echo
> with arguments: []
> connecting to ws://localhost:${port}
> spawning process with child_process
> connecting child process stdout to websocket
> connecting child process stderr to websocket
> listening for child process exit
> waiting for execution to complete
> websocket connected
> flushing buffers
0
1
2
3
4
5
6
7
8
9
> stdout closed
> stderr closed
> process exited with exit code: 0
> process and all streams have shutdown`,
      `
> starting command: ../echo
> with arguments: []
> connecting to ws://localhost:${port}
> spawning process with child_process
> connecting child process stdout to websocket
> connecting child process stderr to websocket
> listening for child process exit
> waiting for execution to complete
> websocket connected
> flushing buffers
0
1
2
3
4
5
6
7
8
9
> stderr closed
> stdout closed
> process exited with exit code: 0
> process and all streams have shutdown`
    ]);
    await runDisconnectionTest(captureAsync, port => [
      `
> starting command: ../echo
> with arguments: ["1"]
> connecting to ws://localhost:${port}
> spawning process with child_process
> connecting child process stdout to websocket
> connecting child process stderr to websocket
> listening for child process exit
> waiting for execution to complete
> websocket connected
> flushing buffers
0
1
2
3
4
disconnect server
> websocket connected
> flushing buffers
5
6
7
8
9
> stdout closed
> stderr closed
> process exited with exit code: 0
> process and all streams have shutdown`,
      `
> starting command: ../echo
> with arguments: ["1"]
> connecting to ws://localhost:${port}
> spawning process with child_process
> connecting child process stdout to websocket
> connecting child process stderr to websocket
> listening for child process exit
> waiting for execution to complete
> websocket connected
> flushing buffers
0
1
2
3
4
disconnect server
> websocket connected
> flushing buffers
5
6
7
8
9
> stderr closed
> stdout closed
> process exited with exit code: 0
> process and all streams have shutdown`
    ]);
  } finally {
    // Make sure the PTY assets don't exist in dist/ for deployment.
    cleanupPtyAssets();
  }
});

gulp.task("run-test-pty", async () => {
  try {
    await runTest(captureAsyncPty, port => [
      `
> starting command: ../echo
> with arguments: []
> connecting to ws://localhost:${port}
> spawning process with pty
> wiring up terminal resize propagation
> connecting child process stdout to websocket
> listening for child process exit
> waiting for execution to complete
> websocket connected
> flushing buffers
0
1
2
3
4
5
6
7
8
9
> stdout closed
> process exited with exit code: 0
> process and all streams have shutdown`
    ]);
    await runDisconnectionTest(captureAsyncPty, port => [
      `
> starting command: ../echo
> with arguments: ["1"]
> connecting to ws://localhost:${port}
> spawning process with pty
> wiring up terminal resize propagation
> connecting child process stdout to websocket
> listening for child process exit
> waiting for execution to complete
> websocket connected
> flushing buffers
0
1
2
3
4
disconnect server
> websocket connected
> flushing buffers
5
6
7
8
9
> stdout closed
> process exited with exit code: 0
> process and all streams have shutdown`
    ]);
  } finally {
    // Make sure the PTY assets don't exist in dist/ for deployment.
    cleanupPtyAssets();
  }
});

gulp.task("run-test", gulp.series("run-test-pty", "run-test-child-process"));

gulp.task(
  "test",
  gulp.series(gulp.parallel("build-forward-logs", "build-test"), "run-test")
);

gulp.task("release", gulp.series("test"));

gulp.task("default", gulp.series("release"));
