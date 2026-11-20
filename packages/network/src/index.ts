import { add } from '@pack-exp/add';

export interface EchoOptions {
  /** How long to wait for the echo reply before giving up. */
  timeoutMs?: number;
  /** Abort early (closes the socket, rejects immediately) when triggered. */
  signal?: AbortSignal;
}

export interface EchoResult {
  /** The payload we sent. */
  sent: string;
  /** Whatever the server sent back. */
  received: string;
  /** Round trip time in milliseconds. */
  elapsedMs: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;

/**
 * Opens a WebSocket to `url`, sends `payload`, and resolves with the first
 * message the server sends back.
 *
 * Uses the global WebSocket (Node >= 22, browsers) so there is nothing
 * platform specific to bundle.
 */
export function echo(
  url: string,
  payload: string,
  options: EchoOptions = {},
): Promise<EchoResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<EchoResult>((resolve, reject) => {
    const startedAt = Date.now();
    const socket = new WebSocket(url);

    // Nothing clever: just proving the add lib is a real dependency edge.
    const deadline = add(startedAt, timeoutMs);

    const timer = setTimeout(() => {
      finish(new Error(`echo timed out after ${timeoutMs}ms (deadline ${deadline})`));
    }, timeoutMs);

    function finish(error: Error | null, result?: EchoResult): void {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // already closed
      }
      if (error) reject(error);
      else resolve(result as EchoResult);
    }

    // Lets a caller cancel immediately (closing the socket right away)
    // rather than leaving this attempt running — e.g. a caller's own
    // timeout firing well before `timeoutMs` would otherwise finish it.
    function onAbort(): void {
      finish(new Error(`echo aborted talking to ${url}`));
    }

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    socket.onopen = () => {
      socket.send(payload);
    };

    socket.onmessage = (event: MessageEvent) => {
      const received =
        typeof event.data === 'string' ? event.data : String(event.data);
      finish(null, {
        sent: payload,
        received,
        elapsedMs: Date.now() - startedAt,
      });
    };

    socket.onerror = () => {
      finish(new Error(`websocket error talking to ${url}`));
    };

    socket.onclose = (event: CloseEvent) => {
      finish(
        new Error(
          `websocket closed before echo reply (code ${event.code}) from ${url}`,
        ),
      );
    };
  });
}
