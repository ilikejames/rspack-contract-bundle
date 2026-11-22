import { echo } from '@pack-exp/network';
import { getTestEnv } from '@pack-exp/build-contracts';

const DEFAULT_ECHO_URL = 'ws://127.0.0.1:8787';

/**
 * The URL `reportEcho()` targets when no url is given explicitly. Reads
 * from `@pack-exp/build-contracts`'s shared test env rather than a local
 * variable, so a Node run (`ECHO_URL=... node contract.bundle.cjs`) and a
 * browser run (the app's own URL textbox calling `setTestEnv(...)`) both
 * flow through the same single mechanism — see testEnv.ts.
 */
export function getEchoUrl(): string {
  return getTestEnv('ECHO_URL') ?? DEFAULT_ECHO_URL;
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
  url: string = getEchoUrl(),
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
