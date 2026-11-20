import { useState } from 'react';
import { runContractTests, type CaseResult } from '@pack-exp/contract-test-bundler/browser';

const DEFAULT_URL = 'ws://127.0.0.1:8787';

type Status = 'idle' | 'running' | 'done';

const statusMarks: Record<CaseResult['status'], string> = {
  pass: '✓',
  fail: '✗',
  skip: '-',
  todo: '~',
};

export function App() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [status, setStatus] = useState<Status>('idle');
  const [results, setResults] = useState<CaseResult[]>([]);
  const [summary, setSummary] = useState<{
    passed: number;
    failed: number;
    skipped: number;
    todo: number;
    total: number;
  } | null>(null);

  async function handleRun() {
    setStatus('running');
    setResults([]);
    setSummary(null);
    // Appends as each test settles, not once the whole run is done — a
    // ~2s test (test3's genuine timeout) shows up as a pause before ITS
    // row, not a pause before every row appears at once.
    const outcome = await runContractTests(url, (result) => {
      setResults((prev) => [...prev, result]);
    });
    setSummary({
      passed: outcome.passed,
      failed: outcome.failed,
      skipped: outcome.skipped,
      todo: outcome.todo,
      total: outcome.total,
    });
    setStatus('done');
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Contract Test Runner</h1>
      <p style={{ color: '#555' }}>
        Runs the real <code>packages/contract</code> tests, bundled for the browser, against
        whatever WebSocket endpoint you point it at.
      </p>

      <label htmlFor="echo-url" style={{ display: 'block', marginTop: '1.5rem', fontWeight: 600 }}>
        Echo endpoint
      </label>
      <input
        id="echo-url"
        data-testid="echo-url-input"
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', boxSizing: 'border-box' }}
      />

      <button
        data-testid="run-button"
        onClick={handleRun}
        disabled={status === 'running'}
        style={{ marginTop: '1rem', padding: '0.5rem 1.25rem', fontSize: '1rem', cursor: 'pointer' }}
      >
        {status === 'running' ? 'Running…' : 'Run contract tests'}
      </button>

      {summary && (
        <p data-testid="summary" style={{ marginTop: '1.5rem', fontWeight: 600 }}>
          {summary.passed} passed, {summary.failed} failed, {summary.skipped} skipped,{' '}
          {summary.todo} todo, {summary.total} total
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
            <span
              style={{
                color: result.status === 'pass' ? '#1a7f37' : result.status === 'fail' ? '#cf222e' : '#777',
                fontWeight: 700,
                marginRight: '0.5rem',
              }}
            >
              {statusMarks[result.status]}
            </span>
            {result.suite} &gt; {result.name}{' '}
            <span style={{ color: '#888' }}>({result.durationMs}ms)</span>
            {result.error && (
              <div style={{ color: '#cf222e', marginLeft: '1.5rem', fontSize: '0.9rem' }}>{result.error}</div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
