import type { NightDigest } from '../digest/types.js';

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>morning digest · {digest.night}</h1>
      <p class={digest.badLines > 0 ? 'warn' : 'mute'}>
        {digest.badLines} bad {digest.badLines === 1 ? 'line' : 'lines'}
      </p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th><th>owner</th><th>runs</th><th>retries</th>
              <th>last status</th><th>last error</th><th>first time</th><th>last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr class={row.lastStatus === 'fail' || row.retries >= 3 ? 'warn' : ''}>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
