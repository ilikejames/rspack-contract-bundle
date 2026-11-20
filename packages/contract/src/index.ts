import { echo } from '@pack-exp/network';

const INITIAL_ECHO_URL =
  (typeof process !== 'undefined' ? process.env?.ECHO_URL : undefined) ?? 'ws://127.0.0.1:8787';

// Mutable, not frozen at module-load: a long-lived caller (a browser page
// with a URL textbox, say) can change the target between runs without
// reloading the module. `typeof process` is guarded because this file
// gets bundled for the browser too (see tools/contract-test-bundler's
// browser entry), where there is no `process` global at all.
let echoUrl = INITIAL_ECHO_URL;

/** The URL `reportEcho()` targets when no url is given explicitly. */
export function getEchoUrl(): string {
  return echoUrl;
}

/** Overrides the target URL for subsequent reportEcho()/echo() calls. */
export function setEchoUrl(url: string): void {
  echoUrl = url;
}

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
  url: string = echoUrl,
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
