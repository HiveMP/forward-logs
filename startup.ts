import { join } from "path";
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
      if (process.platform === "win32") {
        if (!existsSync("pty.node")) {
          writeFileSync(
            join(__dirname, "pty.node"),
            readFileSync("./node_modules/node-pty/build/Release/pty.node")
          );
        }
        if (!existsSync("winpty-agent.exe")) {
          writeFileSync(
            join(__dirname, "winpty-agent.exe"),
            readFileSync(
              "./node_modules/node-pty/build/Release/winpty-agent.exe"
            )
          );
        }
        if (!existsSync("winpty.dll")) {
          writeFileSync(
            join(__dirname, "winpty.dll"),
            readFileSync("./node_modules/node-pty/build/Release/winpty.dll")
          );
        }
      } else {
        if (!existsSync("pty.node")) {
          writeFileSync(
            join(__dirname, "pty.node"),
            readFileSync("./node_modules/node-pty/build/Release/pty.node")
          );
        }
      }
      return self.constructor._load(join(__dirname, "pty.node"), self);
    } else {
      throw err;
    }
  }
};

import { run } from "./src";

// Run the main application now that we've done any extraction work for node-pty.
run();
