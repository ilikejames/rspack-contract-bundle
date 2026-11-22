import type { CaseResult } from '../../shared/src/harness';

export type { CaseResult };

export interface ResultsSummary {
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  total: number;
}

/**
 * Display-only: renders whatever it's handed, nothing else. No run
 * button, no URL input, no fetching/polling of its own — the consuming
 * app (e.g. apps/app-1's `<App>`) owns triggering a run, grows `results`
 * across it if it wants the progressive-render effect `runAndCollect`'s
 * `onResult` callback enables, and decides for itself when (if ever) to
 * pass `summary` — e.g. only once the run has fully settled, so a
 * summary line doesn't appear mid-run alongside a partial `results`
 * array. This component never infers that timing on its own.
 */
export interface ContractResultsProps {
  results: CaseResult[];
  summary?: ResultsSummary;
}

const statusMarks: Record<CaseResult['status'], string> = {
  pass: '✓',
  fail: '✗',
  skip: '-',
  todo: '~',
};

const statusColors: Record<CaseResult['status'], string> = {
  pass: '#1a7f37',
  fail: '#cf222e',
  skip: '#777',
  todo: '#777',
};

export function ContractResults({ results, summary }: ContractResultsProps) {
  return (
    <div>
      {summary && (
        <p data-testid="summary" style={{ fontWeight: 600 }}>
          {summary.passed} passed, {summary.failed} failed, {summary.skipped} skipped, {summary.todo} todo,{' '}
          {summary.total} total
        </p>
      )}

      <ul data-testid="results" style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
        {results.map((result, i) => (
          <li
            key={i}
            data-testid="result-row"
            data-status={result.status}
            style={{ padding: '0.4rem 0', borderBottom: '1px solid #eee' }}
          >
            <span style={{ color: statusColors[result.status], fontWeight: 700, marginRight: '0.5rem' }}>
              {statusMarks[result.status]}
            </span>
            {result.suite} &gt; {result.name} <span style={{ color: '#888' }}>({result.durationMs}ms)</span>
            {result.error && (
              <div style={{ color: '#cf222e', marginLeft: '1.5rem', fontSize: '0.9rem' }}>{result.error}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
