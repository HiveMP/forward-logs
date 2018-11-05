"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forwardLogsIsDebug = process.env.FORWARD_LOGS_DEBUG === "true";
function debugLog(message) {
    if (forwardLogsIsDebug) {
        console.log("> " + message);
    }
}
exports.debugLog = debugLog;
function debugError(message) {
    if (forwardLogsIsDebug) {
        console.error("> " + message);
    }
}
exports.debugError = debugError;
function createErrorFunction(context) {
    return err => {
        debugError(context + ":");
        debugError(err);
        console.error(err);
    };
}
exports.createErrorFunction = createErrorFunction;
//# sourceMappingURL=logging.js.map