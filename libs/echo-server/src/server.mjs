// Dev-only echo server for the contract tests. Not part of the test bundle.
import { WebSocketServer } from 'ws';

const port = Number(process.env.ECHO_PORT ?? process.env.PORT ?? 8787);
const host = process.env.ECHO_HOST ?? '127.0.0.1';

const wss = new WebSocketServer({ host, port });

wss.on('connection', (socket, request) => {
  const peer = request.socket.remoteAddress ?? 'unknown';
  console.log(`[echo] connection from ${peer}`);

  socket.on('message', (data, isBinary) => {
    const text = isBinary ? '<binary>' : data.toString();
    console.log(`[echo] <- ${text}`);

    // Routed by `dest`: only "echo" is a handled endpoint. Anything else
    // (unknown dest, missing dest, unparseable body) is left unanswered —
    // deliberately, to model hitting a real but unimplemented endpoint and
    // exercise the client's own timeout, rather than a crash or an error
    // reply.
    let dest;
    try {
      dest = JSON.parse(text)?.dest;
    } catch {
      dest = undefined;
    }

    if (dest === 'echo') {
      socket.send(data, { binary: isBinary });
    } else {
      console.log(`[echo] unhandled dest "${dest}" — not responding`);
    }
  });

  socket.on('close', (code) => {
    console.log(`[echo] closed (${code})`);
  });
});

wss.on('listening', () => {
  console.log(`[echo] listening on ws://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n[echo] shutting down');
    wss.close(() => process.exit(0));
  });
}
