import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

let runsDir: string;
const night = '2026-10-28';
const at = '2026-10-29T01:30:00+01:00';
const event = (job: string, status = 'ok', owner: string | null = 'reader', error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });
const app = () => createApp({ adapter: 'test', installed: at, beatEverySeconds: 60, runsDir });
const writeNight = (lines: string[]) => writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

describe('digest routes', () => {
  it('serves the same sorted jobs in HTML and JSON, including null owners and original offsets', async () => {
    writeNight([event('zeta/job', 'ok', null), event('alpha/job')]);
    const server = app();
    const htmlResponse = await server.request(`/digest/${night}`);
    const jsonResponse = await server.request(`/api/digest/${night}`);
    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(htmlResponse.headers.get('content-type')).toContain('text/html');
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json() as NightDigest;
    expect(digest.rows.map(row => row.job)).toEqual(['alpha/job', 'zeta/job']);
    expect(html.indexOf('alpha/job')).toBeLessThan(html.indexOf('zeta/job'));
    expect(digest.rows[1].owner).toBeNull();
    expect(html).toContain('—');
    expect(html).toContain(at);
    expect(html).not.toMatch(/<script\b/i);
  });

  it('returns 404 for a missing night in both representations', async () => {
    for (const prefix of ['/digest', '/api/digest']) {
      expect((await app().request(`${prefix}/${night}`)).status).toBe(404);
    }
  });

  it('renders an empty existing night as nothing ran, with empty JSON rows', async () => {
    writeNight([]);
    const htmlResponse = await app().request(`/digest/${night}`);
    const jsonResponse = await app().request(`/api/digest/${night}`);
    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    const digest = await jsonResponse.json() as NightDigest;
    expect(digest.rows).toEqual([]);
    expect(digest.badLines).toBe(0);
  });

  it('counts a malformed line without losing valid jobs or failing either route', async () => {
    writeNight([event('surviving/job'), '{unfinished']);
    const htmlResponse = await app().request(`/digest/${night}`);
    const jsonResponse = await app().request(`/api/digest/${night}`);
    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('surviving/job');
    const digest = await jsonResponse.json() as NightDigest;
    expect(digest.badLines).toBe(1);
    expect(digest.rows.map(row => row.job)).toEqual(['surviving/job']);
  });

  it('marks a recovered job with three retries and a failed job in the HTML', async () => {
    writeNight([
      event('retry/job', 'retry', 'reader', 'upstream unavailable'),
      event('retry/job', 'retry', 'reader', 'upstream unavailable'),
      event('retry/job', 'retry', 'reader', 'upstream unavailable'),
      event('retry/job'),
      event('failed/job', 'fail', null, 'quota exceeded'),
      event('ordinary/job'),
    ]);
    const html = await (await app().request(`/digest/${night}`)).text();
    const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? [];
    for (const job of ['retry/job', 'failed/job']) {
      const row = rows.find(candidate => candidate.includes(job));
      expect(row, `${job} must have a visible row`).toBeDefined();
      expect(row).toMatch(/class="[^"]*\bwarn\b/);
    }
    const digest = await (await app().request(`/api/digest/${night}`)).json() as NightDigest;
    expect(digest.rows.find(row => row.job === 'retry/job')?.retries).toBe(3);
    expect(digest.rows.find(row => row.job === 'failed/job')?.lastStatus).toBe('fail');
    expect(html).toContain('quota exceeded');
  });
});
