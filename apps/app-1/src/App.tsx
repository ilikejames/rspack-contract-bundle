import { useState } from 'react';
import { ContractResults, type CaseResult, type ResultsSummary } from '@pack-exp/build-contracts/components';
import { runContractTests } from './entry.browser';

const DEFAULT_URL = 'ws://127.0.0.1:8787';

type Status = 'idle' | 'running' | 'done';

export function App() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [status, setStatus] = useState<Status>('idle');
  const [results, setResults] = useState<CaseResult[]>([]);
  const [summary, setSummary] = useState<ResultsSummary | undefined>(undefined);

  async function handleRun() {
    setStatus('running');
    setResults([]);
    setSummary(undefined);
    // Appends as each test settles, not once the whole run is done — a
    // ~2s test (test3's genuine timeout) shows up as a pause before ITS
    // row, not a pause before every row appears at once. `summary` is
    // only set once the whole run has settled, so it doesn't appear
    // alongside a still-partial `results` array.
    const outcome = await runContractTests(url, (result) => {
      setResults((prev) => [...prev, result]);
    });
    setSummary(outcome);
    setStatus('done');
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Contract Test Runner</h1>
      <p style={{ color: '#555' }}>
        Runs this app's own contract tests (src/contracts), bundled for the browser, against
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

      <ContractResults results={results} summary={summary} />
    </main>
  );
}
