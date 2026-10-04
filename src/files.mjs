// One folder per application: the posting as it was, the CV that was sent,
// every answer the form was given, and the match report.
//
// Postings vanish the day they close, often before the first interview. The
// night before that interview you need the exact JD, the exact CV, and what
// you told them your expected salary was. A tracker that kept only the URL
// would hand you a 404.
//
// Closed applications are archived, never deleted: recruiters come back, and
// roles get reposted. `prune` deletes archived folders past an age you choose.

import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { defaultDbPath, TERMINAL } from './store.mjs';

export const rootDir = () => join(dirname(defaultDbPath()), 'applications');

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export const folderName = (app) =>
  [app.id, slug(app.company), slug(app.role)].filter(Boolean).join('-');

/** Where this application's files are, open or archived. Null when it has none. */
export function find(app, root = rootDir()) {
  for (const p of [join(root, folderName(app)), join(root, 'archive', folderName(app))]) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** The live folder, created on first use. Archived folders are reopened if written to. */
export function dirFor(app, root = rootDir()) {
  const live = join(root, folderName(app));
  const archived = join(root, 'archive', folderName(app));
  if (!existsSync(live) && existsSync(archived)) renameSync(archived, live);
  mkdirSync(live, { recursive: true });
  return live;
}

/**
 * Copy files in under fixed names, so `prep` always knows where to look.
 * `jd` and `cv` keep their extension: jd.txt or jd.html, cv.pdf or cv.txt.
 */
export function attach(app, { jd, cv, cvText, match, letter } = {}, root = rootDir()) {
  const dir = dirFor(app, root);
  const put = (src, name) => {
    if (!src) return;
    if (!existsSync(src)) throw new Error(`no such file: ${src}`);
    copyFileSync(src, join(dir, name + extname(src).toLowerCase()));
  };
  put(jd, 'jd');
  put(cv, 'cv');
  put(cvText, 'cv');
  put(match, 'match');
  put(letter, 'cover-letter');
  return dir;
}

export function writeJson(app, name, data, root = rootDir()) {
  const path = join(dirFor(app, root), name);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  return path;
}

export function writeText(app, name, text, root = rootDir()) {
  const path = join(dirFor(app, root), name);
  writeFileSync(path, text);
  return path;
}

/** Everything in the folder, text files read, binaries listed by path. */
export function read(app, root = rootDir()) {
  const dir = find(app, root);
  if (!dir) return null;
  const out = { dir, archived: basename(dirname(dir)) === 'archive', files: {} };
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    out.files[f] = /\.(txt|json|md|html)$/.test(f) ? readFileSync(p, 'utf8') : p;
  }
  return out;
}

/** Move a closed application's folder into archive/. Returns the new path, or null. */
export function archiveIfClosed(app, root = rootDir()) {
  if (!TERMINAL.has(app.stage) || app.stage === 'offer') return null;
  const live = join(root, folderName(app));
  if (!existsSync(live)) return null;
  const to = join(root, 'archive', folderName(app));
  mkdirSync(dirname(to), { recursive: true });
  renameSync(live, to);
  // A move does not reliably touch the folder's own mtime, and prune counts from it.
  const t = new Date();
  utimesSync(to, t, t);
  return to;
}

/** Delete archived folders not touched in `days`. Returns what went. */
export function prune(days, root = rootDir(), asOf = Date.now()) {
  const dir = join(root, 'archive');
  if (!existsSync(dir)) return [];
  const gone = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if ((asOf - statSync(p).mtimeMs) / 86_400_000 >= days) {
      rmSync(p, { recursive: true, force: true });
      gone.push(f);
    }
  }
  return gone;
}
