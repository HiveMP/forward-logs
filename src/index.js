"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const which = require("which");
const path_1 = require("path");
const pty = require("node-pty");
const logging_1 = require("./logging");
const ReliableWebSocket_1 = require("./ReliableWebSocket");
function run() {
    if (process.argv.length < 3) {
        console.error("forward-logs expects a command to be passed");
        process.exit(1);
    }
    const command = process.argv[2];
    const args = process.argv.slice(3);
    const forwardLogsUrl = process.env.FORWARD_LOGS_URL;
    const forwardLogsUsePty = process.env.FORWARD_LOGS_USE_PTY === undefined
        ? process.stdin.isTTY && process.stdout.isTTY
        : process.env.FORWARD_LOGS_USE_PTY === "true";
    if (forwardLogsUrl === undefined) {
        console.error("forward-logs expects the FORWARD_LOGS_URL environment variable to be set");
        process.exit(1);
    }
    let isStdOutOpen = true;
    let isStdErrOpen = true;
    let processExited = false;
    let processExitCode = null;
    let isShuttingDown = false;
    logging_1.debugLog("starting command: " + command);
    logging_1.debugLog("with arguments: " + JSON.stringify(args));
    logging_1.debugLog("connecting to " + forwardLogsUrl);
    const ws = new ReliableWebSocket_1.ReliableWebSocket(forwardLogsUrl);
    function handlePotentialExit() {
        if (!isStdOutOpen && !isStdErrOpen && processExited) {
            if (isShuttingDown) {
                return;
            }
            isShuttingDown = true;
            logging_1.debugLog("process and all streams have shutdown");
            let content = null;
            if (processExitCode === null) {
                content = JSON.stringify({
                    processShutdown: true,
                    processHasExitCode: false,
                    processExitCode: null
                });
            }
            else {
                content = JSON.stringify({
                    processShutdown: true,
                    processHasExitCode: true,
                    processExitCode: processExitCode.toString()
                });
            }
            setImmediate(() => __awaiter(this, void 0, void 0, function* () {
                yield ws.shutdown(content);
                process.exit();
            }));
        }
    }
    if (forwardLogsUsePty) {
        logging_1.debugLog("spawning process with pty");
        let resolvedCommand = which.sync(command);
        if (!path_1.isAbsolute(resolvedCommand)) {
            resolvedCommand = path_1.join(process.cwd(), resolvedCommand);
        }
        const cp = pty.spawn(resolvedCommand, args, {
            name: "xterm",
            cols: process.stdout.columns,
            rows: process.stdout.rows,
            cwd: process.cwd(),
            env: process.env
        });
        logging_1.debugLog("wiring up terminal resize propagation");
        process.stdout.on("resize", () => {
            cp.resize(process.stdout.columns, process.stdout.rows);
        });
        logging_1.debugLog("connecting child process stdout to websocket");
        cp.on("data", chunk => {
            ws.writeString(chunk);
            process.stdout.write(chunk);
        });
        logging_1.debugLog("listening for child process exit");
        cp.on("exit", code => {
            logging_1.debugLog("stdout closed");
            isStdOutOpen = false;
            logging_1.debugLog("process exited with exit code: " + code);
            process.exitCode = code;
            processExited = true;
            handlePotentialExit();
        });
        cp.on("exit", () => {
            handlePotentialExit();
        });
        isStdErrOpen = false; /* terminals do not support stderr */
    }
    else {
        logging_1.debugLog("spawning process with child_process");
        const cp = child_process_1.spawn(command, args, {
            stdio: ["inherit", "pipe", "pipe"]
        });
        cp.on("error", logging_1.createErrorFunction("child process error"));
        if (cp.stdout !== null) {
            logging_1.debugLog("connecting child process stdout to websocket");
            cp.stdout.on("data", chunk => {
                ws.write(chunk);
                process.stdout.write(chunk);
            });
            cp.stdout.on("error", logging_1.createErrorFunction("piped stdout error"));
            cp.stdout.on("end", () => {
                logging_1.debugLog("stdout closed");
                isStdOutOpen = false;
                handlePotentialExit();
            });
        }
        else {
            isStdOutOpen = false;
        }
        if (cp.stderr !== null) {
            logging_1.debugLog("connecting child process stderr to websocket");
            cp.stderr.on("data", chunk => {
                ws.write(chunk);
                process.stderr.write(chunk);
            });
            cp.stderr.on("error", logging_1.createErrorFunction("piped stderr error"));
            cp.stderr.on("end", () => {
                logging_1.debugLog("stderr closed");
                isStdErrOpen = false;
                handlePotentialExit();
            });
        }
        else {
            isStdErrOpen = false;
        }
        logging_1.debugLog("listening for child process exit");
        cp.on("exit", code => {
            logging_1.debugLog("process exited with exit code: " + code);
            process.exitCode = code;
            processExited = true;
            handlePotentialExit();
        });
    }
    logging_1.debugLog("waiting for execution to complete");
}
exports.run = run;
//# sourceMappingURL=index.js.map