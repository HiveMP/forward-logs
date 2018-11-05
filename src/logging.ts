const forwardLogsIsDebug = process.env.FORWARD_LOGS_DEBUG === "true";

export function debugLog(message) {
  if (forwardLogsIsDebug) {
    console.log("> " + message);
  }
}

export function debugError(message) {
  if (forwardLogsIsDebug) {
    console.error("> " + message);
  }
}

export function createErrorFunction(context) {
  return err => {
    debugError(context + ":");
    debugError(err);
    console.error(err);
  };
}
