import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, ReadNight } from './types.js';

type Event = { at: string; job: string; status: JobStatus; owner: string | null; error?: string };

function isEvent(value: unknown): value is Event {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return typeof event.at === 'string' && Number.isFinite(Date.parse(event.at)) &&
    typeof event.job === 'string' && event.job.trim().length > 0 &&
    (event.status === 'ok' || event.status === 'retry' || event.status === 'fail') &&
    (event.owner === null || typeof event.owner === 'string') &&
    (event.error === undefined || typeof event.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  const counts = { ok: 0, retry: 0, fail: 0 };
  const events: Event[] = [];
  let badLines = 0;
  const lines = text === '' ? [] : text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    try {
      const event: unknown = JSON.parse(line);
      if (!isEvent(event)) { badLines++; continue; }
      events.push(event);
      counts[event.status]++;
    } catch { badLines++; }
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const jobs = new Map<string, DigestRow>();
  for (const event of events) {
    let row = jobs.get(event.job);
    if (!row) {
      row = { job: event.job, owner: event.owner, runs: 0, retries: 0,
        lastStatus: event.status, lastError: null, firstAt: event.at, lastAt: event.at };
      jobs.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== undefined) row.lastError = event.error;
  }
  return { night, rows: [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0), badLines, counts };
};
