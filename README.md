# forward-logs

Forwards the stdout and stderr of a command to a websocket server, as defined by environment variables.

## Download

You can download forward-logs for either Linux or Windows from the [GitHub releases page](https://github.com/HiveMP/forward-logs/releases).

## Usage

First set the environment variable `FORWARD_LOGS_URL` to the WebSocket server you want to forward stdout and stderr to, then prepend `forward-logs` to any command on the command line:

```
forward-logs COMMAND ARGS
```

### Options

The following environment variables are recognised:

- `FORWARD_LOGS_URL`: **Required**. Specifies the WebSocket to send stdout/stderr to.
- `FORWARD_LOGS_DEBUG`: If set to `true`, additional debugging information is sent to the host's stdlog and stderr (not the WebSocket), which can help diagnose issues.
- `FORWARD_LOGS_USE_PTY`: If set to either `true` or `false`, forces or prevents the use of a PTY for the child program. By default, the use of a PTY for the child program is based on whether `forward-logs` is attached to a TTY itself.

## License

```
MIT License

Copyright (c) 2018 Redpoint Games Pty Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
