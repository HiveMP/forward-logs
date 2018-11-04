const gulp = require("gulp");
const mkdirp = require("mkdirp");
const { compile } = require("nexe");
const { spawn } = require("child_process");
const http = require("http");
const websocket = require("websocket-stream");
const { join } = require("path");
const { existsSync } = require("fs");

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

gulp.task("build-forward-logs", async () => {
  mkdirp.sync("dist");

  let tsc = join(__dirname, "node_modules", ".bin", "tsc");
  if (process.platform === "win32" && existsSync(tsc + ".cmd")) {
    tsc = tsc + ".cmd";
  }

  await execAsync(tsc, [], __dirname);

  await compile({
    input: "./index.js",
    output: "dist/forward-logs",
    enableStdIn: false
  });
});

gulp.task("build-test", async () => {
  await compile({
    input: "./echo.js",
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

gulp.task("run-test", async () => {
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
  const processOutput = `
> starting command: echo
> with arguments: []
> connecting to ws://localhost:${port}
> spawning process with child_process
> connecting child process stdout to websocket
> connecting child process stderr to websocket
> listening for child process exit
> waiting for execution to complete
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
> process and all streams have shutdown`.trim();

  const wss = websocket.createServer(
    { perMessageDeflate: false, server: httpServer },
    handle
  );

  try {
    const output = await captureAsync(
      "dist/forward-logs",
      ["echo"],
      __dirname,
      {
        FORWARD_LOGS_URL: "ws://localhost:" + port,
        FORWARD_LOGS_DEBUG: true
      }
    );
    if (output.trim() !== processOutput) {
      console.error(
        "test fail: didn't get expected output direct from executable, got output: "
      );
      console.error(output);
      process.exitCode = 1;
      return;
    } else {
      console.log("test pass: process output matched expected values!");
    }

    if (result !== websocketOutput) {
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
});

gulp.task(
  "test",
  gulp.series(gulp.parallel("build-forward-logs", "build-test"), "run-test")
);

gulp.task("release", gulp.series("test"));

gulp.task("default", gulp.series("release"));
