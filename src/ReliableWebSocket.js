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
const websocket = require("websocket-stream");
const logging_1 = require("./logging");
class ReliableWebSocket {
    constructor(url) {
        this.handleConnect = () => {
            if (!this.wsIsOpen) {
                logging_1.debugLog("websocket connected");
                this.wsIsOpen = true;
                this.flushBuffers();
            }
        };
        this.handleClose = () => {
            this.wsIsOpen = false;
            if (this.ws !== null) {
                this.ws = null;
                if (!this.naturalShutdown) {
                    logging_1.debugError("websocket unexpectedly shutdown, reconnecting and buffering content until connection success");
                    this.createWebSocket();
                }
                else {
                    logging_1.debugLog("websocket naturally shutdown");
                }
            }
        };
        this.buffers = [];
        this.url = url;
        this.ws = null;
        this.wsIsOpen = false;
        this.naturalShutdown = false;
        this.createWebSocket();
    }
    createWebSocket() {
        this.ws = websocket(this.url, {
            binary: true,
            objectMode: true,
            origin: "https://websocket.org"
        });
        this.ws.on("connect", this.handleConnect);
        this.ws.on("close", this.handleClose);
        this.ws.on("error", logging_1.createErrorFunction("websocket error"));
    }
    shutdown(reason) {
        return __awaiter(this, void 0, void 0, function* () {
            // If we are trying to shutdown, and we haven't connected or aren't
            // connected yet, try to connect and flush buffers.
            if (!this.wsIsOpen && this.buffers.length > 0) {
                logging_1.debugLog("attempted to shutdown websocket, but not currently connected and there are buffers to write to the endpoint");
                logging_1.debugLog("connecting to the websocket and waiting until we can flush the remaining buffers");
                if (this.ws != null) {
                    this.createWebSocket();
                }
                yield new Promise(resolve => {
                    this.ws.on("connect", resolve);
                });
                // The normal "handleConnect" event will flush the buffers at this point.
            }
            this.naturalShutdown = true;
            this.ws.socket.close(1000, reason);
        });
    }
    writeString(data) {
        this.write(Buffer.from(data, "utf8"));
    }
    write(chunk) {
        if (!this.wsIsOpen) {
            this.buffers.push(chunk);
        }
        else {
            if (this.buffers.length > 0) {
                this.flushBuffers();
            }
            this.ws.write(chunk, err => {
                if (err !== undefined) {
                    logging_1.debugError(err);
                    this.buffers.push(chunk);
                }
            });
        }
    }
    flushBuffers() {
        logging_1.debugLog("flushing buffers");
        const bufferCopy = [...this.buffers];
        this.buffers = [];
        bufferCopy.forEach(element => {
            this.write(element);
        });
    }
}
exports.ReliableWebSocket = ReliableWebSocket;
//# sourceMappingURL=ReliableWebSocket.js.map