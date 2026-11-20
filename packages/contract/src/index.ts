import { echo } from '@pack-exp/network';

export const DEFAULT_ECHO_URL = process.env.ECHO_URL ?? 'ws://127.0.0.1:8787';

export interface EchoReport {
  url: string;
  payload: string;
  /** True when the server echoed our payload back verbatim. */
  ok: boolean;
  /** What came back, or undefined if the attempt never got a reply. */
  received?: string;
  elapsedMs?: number;
  /** Set when the socket errored, timed out, or closed early. */
  error?: string;
}

/**
 * The subject under test: drive the network lib and report what happened.
 *
 * Never throws — a failed round trip is a report with `ok: false` so the
 * contract tests can assert on it.
 */
export async function reportEcho(
  payload: string,
  url: string = DEFAULT_ECHO_URL,
): Promise<EchoReport> {
  try {
    const result = await echo(url, payload);
    return {
      url,
      payload,
      ok: result.received === payload,
      received: result.received,
      elapsedMs: result.elapsedMs,
    };
  } catch (cause) {
    return {
      url,
      payload,
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
