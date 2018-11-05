import * as websocket from "websocket-stream";
import { debugLog, debugError, createErrorFunction } from "./logging";

export class ReliableWebSocket {
  private buffers: Buffer[];
  private url: string;
  private ws: any;
  private naturalShutdown: boolean;
  private wsIsOpen: boolean;

  constructor(url: string) {
    this.buffers = [];
    this.url = url;
    this.ws = null;
    this.wsIsOpen = false;
    this.naturalShutdown = false;

    this.createWebSocket();
  }

  private createWebSocket() {
    this.ws = websocket(this.url, {
      binary: true,
      objectMode: true,
      origin: "https://websocket.org"
    });
    this.ws.on("connect", this.handleConnect);
    this.ws.on("close", this.handleClose);
    this.ws.on("error", createErrorFunction("websocket error"));
  }

  public async shutdown(reason: string) {
    // If we are trying to shutdown, and we haven't connected or aren't
    // connected yet, try to connect and flush buffers.
    if (!this.wsIsOpen && this.buffers.length > 0) {
      debugLog(
        "attempted to shutdown websocket, but not currently connected and there are buffers to write to the endpoint"
      );
      debugLog(
        "connecting to the websocket and waiting until we can flush the remaining buffers"
      );
      if (this.ws != null) {
        this.createWebSocket();
      }
      await new Promise(resolve => {
        this.ws.on("connect", resolve);
      });
      // The normal "handleConnect" event will flush the buffers at this point.
    }

    this.naturalShutdown = true;
    this.ws.socket.close(1000, reason);
  }

  public writeString(data: string) {
    this.write(Buffer.from(data, "utf8"));
  }

  public write(chunk: Buffer) {
    if (!this.wsIsOpen) {
      this.buffers.push(chunk);
    } else {
      if (this.buffers.length > 0) {
        this.flushBuffers();
      }
      this.ws.write(chunk, err => {
        if (err !== undefined) {
          debugError(err);
          this.buffers.push(chunk);
        }
      });
    }
  }

  private flushBuffers() {
    debugLog("flushing buffers");
    const bufferCopy = [...this.buffers];
    this.buffers = [];
    bufferCopy.forEach(element => {
      this.write(element);
    });
  }

  private handleConnect = () => {
    if (!this.wsIsOpen) {
      debugLog("websocket connected");
      this.wsIsOpen = true;
      this.flushBuffers();
    }
  };

  private handleClose = () => {
    this.wsIsOpen = false;
    if (this.ws !== null) {
      this.ws = null;

      if (!this.naturalShutdown) {
        debugError(
          "websocket unexpectedly shutdown, reconnecting and buffering content until connection success"
        );
        this.createWebSocket();
      } else {
        debugLog("websocket naturally shutdown");
      }
    }
  };
}
