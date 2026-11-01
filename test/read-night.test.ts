import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNight } from '../src/digest/read-night.js';

const dirs: string[] = [];
function fixture(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  dirs.push(dir);
  writeFileSync(join(dir, '2026-10-28.jsonl'), text);
  return dir;
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });

describe('readNight', () => {
  it('reads the immutable night fixture without dropping its unowned job', () => {
    const night = readNight('runs', '2026-10-28')!;
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);
    expect(night.rows.map(row => row.job)).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(night.rows[0].owner).toBeNull();
    expect(night.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(night.rows[1].firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
  it('orders events by their instant while preserving original offsets', () => {
    const dir = fixture([
      { at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: null },
      { at: '2026-10-28T22:30:00+02:00', job: 'a', status: 'retry', owner: 'r', error: 'slow' },
    ].map(value => JSON.stringify(value)).join('\n'));
    expect(readNight(dir, '2026-10-28')?.rows[0]).toMatchObject({ firstAt: '2026-10-28T22:30:00+02:00', lastAt: '2026-10-28T23:00:00+01:00', lastStatus: 'ok', lastError: 'slow' });
  });
  it('counts malformed JSON and invalid records without losing valid events', () => {
    const dir = fixture('broken\n{}\n' + JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: null }) + '\n');
    expect(readNight(dir, '2026-10-28')).toMatchObject({ badLines: 2, counts: { ok: 1, retry: 0, fail: 0 } });
  });
  it('distinguishes an empty night from a missing night and rejects traversal', () => {
    const dir = fixture('');
    expect(readNight(dir, '2026-10-28')).toMatchObject({ rows: [], badLines: 0 });
    expect(readNight(dir, '2026-10-29')).toBeNull();
    expect(readNight(dir, '../2026-10-28')).toBeNull();
  });
});
