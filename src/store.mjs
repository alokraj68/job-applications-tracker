// Everything this tool knows, in one SQLite file on your machine.
//
// `node:sqlite` is built into Node, so this package has zero runtime
// dependencies. The obvious alternative, sql.js, is a 1.5MB WebAssembly build of
// SQLite that exists to run in a browser - which this never does.
//
// Nothing here leaves the machine. There is no telemetry in this package, not
// opt-out telemetry, none: the whole point of a job-search tool is that the list
// of who you applied to is nobody else's business.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

/** Stages an application can be in. Order matters: it is the funnel. */
export const STAGES = ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

/** Nothing is chased once it has landed in one of these. */
export const TERMINAL = new Set(['offer', 'rejected', 'withdrawn']);

/** Default days of silence before `followup` starts nagging. */
export const NUDGE_AFTER_DAYS = 7;

export const defaultDbPath = () =>
  process.env.JOB_TRACKER_DB ?? join(homedir(), '.job-applications-tracker', 'applications.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT    NOT NULL,
  company     TEXT,
  role        TEXT,
  source      TEXT,
  cv_file     TEXT,
  answers     TEXT,
  stage       TEXT    NOT NULL DEFAULT 'applied',
  notes       TEXT,
  applied_on  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS stage_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  stage          TEXT    NOT NULL,
  at             TEXT    NOT NULL,
  note           TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_app ON stage_history(application_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_url ON applications(url);
`;

/**
 * Open (and create, first time) the store.
 *
 * `node:sqlite` needed `--experimental-sqlite` until Node 23.4. Rather than let
 * that surface as an opaque ERR_UNKNOWN_BUILTIN_MODULE three frames deep, the
 * failure is caught at the one place it can happen and turned into the sentence
 * that tells you what to do.
 */
export function open(path = defaultDbPath()) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  let db;
  try {
    db = new DatabaseSync(path);
  } catch (err) {
    throw new Error(
      `could not open ${path}: ${err.message}\n` +
      `node:sqlite needs Node 23.4 or newer, or Node 22.5+ run with --experimental-sqlite. ` +
      `You are on ${process.version}.`,
    );
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

/**
 * Record an application.
 *
 * The URL is unique on purpose. Applying to the same posting twice is a mistake
 * worth catching rather than a row worth having, and it happens: the same job is
 * reposted, or reaches you again through a second board.
 */
export function add(db, app) {
  if (!app.url) throw new Error('an application needs a url');
  const existing = db.prepare('SELECT id FROM applications WHERE url = ?').get(app.url);
  if (existing) throw new Error(`already recorded as #${existing.id}: ${app.url}`);

  const stage = app.stage ?? 'applied';
  assertStage(stage);
  const at = app.applied_on ?? today();

  const info = db.prepare(`
    INSERT INTO applications (url, company, role, source, cv_file, answers, stage, notes, applied_on, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    app.url, app.company ?? null, app.role ?? null, app.source ?? null,
    app.cv_file ?? null,
    app.answers ? JSON.stringify(app.answers) : null,
    stage, app.notes ?? null, at, now(),
  );

  const id = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO stage_history (application_id, stage, at, note) VALUES (?, ?, ?, ?)')
    .run(id, stage, now(), app.notes ?? null);
  return get(db, id);
}

export function get(db, id) {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  return row ? hydrate(row) : null;
}

export function list(db, { open: onlyOpen = false } = {}) {
  const rows = db.prepare('SELECT * FROM applications ORDER BY applied_on DESC, id DESC').all();
  const all = rows.map(hydrate);
  return onlyOpen ? all.filter((a) => !TERMINAL.has(a.stage)) : all;
}

/** Move an application along, and keep the history. */
export function setStage(db, id, stage, note = null) {
  assertStage(stage);
  const app = get(db, id);
  if (!app) throw new Error(`no application #${id}`);
  db.prepare('UPDATE applications SET stage = ?, updated_at = ? WHERE id = ?').run(stage, now(), id);
  db.prepare('INSERT INTO stage_history (application_id, stage, at, note) VALUES (?, ?, ?, ?)')
    .run(id, stage, now(), note);
  return get(db, id);
}

export function history(db, id) {
  return db.prepare('SELECT stage, at, note FROM stage_history WHERE application_id = ? ORDER BY id').all(id);
}

/**
 * What has gone quiet.
 *
 * Measured from the last stage CHANGE, not from the application date: something
 * that reached interview two days ago is not stale just because you applied to it
 * a month ago. Terminal stages are never chased.
 */
export function followup(db, { after = NUDGE_AFTER_DAYS, asOf = new Date() } = {}) {
  return list(db, { open: true })
    .map((a) => {
      const last = db.prepare(
        'SELECT at FROM stage_history WHERE application_id = ? ORDER BY id DESC LIMIT 1',
      ).get(a.id);
      const since = last?.at ?? a.updated_at;
      const days = Math.floor((asOf - new Date(since)) / 86_400_000);
      return { ...a, quiet_days: days, last_change: since };
    })
    .filter((a) => a.quiet_days >= after)
    .sort((a, b) => b.quiet_days - a.quiet_days);
}

export function remove(db, id) {
  const info = db.prepare('DELETE FROM applications WHERE id = ?').run(id);
  return info.changes > 0;
}

function assertStage(stage) {
  if (!STAGES.includes(stage)) {
    throw new Error(`unknown stage "${stage}". One of: ${STAGES.join(', ')}`);
  }
}

/** `answers` is stored as JSON text; callers should never see that. */
function hydrate(row) {
  return { ...row, answers: row.answers ? JSON.parse(row.answers) : [] };
}
