// The written answers, and which posting they already cover.
//
// Application forms ask for 200 to 500 words on a specific question, and those
// answers are expensive: an hour each, and they are the thing that decides
// whether anyone calls. They then sit in a scratch file and are rewritten from
// nothing for the next posting that asks something adjacent.
//
// This stores them, tags them by the requirement they answer, and for a new
// posting reports which requirements are covered - and, more usefully, which
// ones have no answer yet. That gap list is the work.

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

/**
 * Words too common to be a requirement.
 *
 * Deliberately long. A gap list that opens with "experience", "team" and
 * "role" is a gap list nobody reads twice, and the whole value here is that the
 * list is short enough to act on.
 */
export const STOPWORDS = new Set(`a an the and or but if then than that this these those of in on at to for with from by as is are was were be been being have has had do does did will would shall should can could may might must not no yes you your we our they their it its he she his her them us me my i who whom whose which what when where why how all any both each few more most other some such only own same so too very just about into over under again further once here there
you will your role about us we are looking join team company work position candidate ideal responsibilities requirements qualifications experience years strong good great excellent ability skills knowledge understanding working plus bonus nice preferred required must apply benefits salary equity remote hybrid onsite office full time part contract senior junior lead level deep across within including etc via using also new every their its
build building built create creating developing deliver delivering drive driving ensure ensuring support supporting help helping make making take taking work working lead leading manage managing`
  .split(/\s+/).filter(Boolean));

const now = () => new Date().toISOString();

/** Slug from a filename, so `talabat-fit.txt` becomes `talabat-fit`. */
export const slugify = (s) =>
  basename(String(s), extname(String(s)))
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const countWords = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

export function add(db, { name, body, tags = [], source = null }) {
  if (!body?.trim()) throw new Error('an answer needs a body');
  const key = slugify(name ?? source ?? '');
  if (!key) throw new Error('an answer needs a name');
  if (db.prepare('SELECT id FROM answers WHERE name = ?').get(key)) {
    throw new Error(`"${key}" already exists. Remove it first, or use another name.`);
  }
  db.prepare(`
    INSERT INTO answers (name, body, tags, chars, words, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(key, body, JSON.stringify(tags), body.length, countWords(body), source, now());
  return get(db, key);
}

export function addFile(db, path, { name, tags } = {}) {
  const body = readFileSync(path, 'utf8').trim();
  return add(db, { name: name ?? slugify(path), body, tags, source: path });
}

export function get(db, name) {
  const row = db.prepare('SELECT * FROM answers WHERE name = ?').get(slugify(name));
  return row ? hydrate(row) : null;
}

/** `fits` is the character cap a form imposes, which is the first thing you check. */
export function list(db, { fits = null } = {}) {
  const all = db.prepare('SELECT * FROM answers ORDER BY created_at DESC').all().map(hydrate);
  return fits == null ? all : all.filter((a) => a.chars <= fits);
}

export function remove(db, name) {
  return db.prepare('DELETE FROM answers WHERE name = ?').run(slugify(name)).changes > 0;
}

/**
 * Terms a posting is actually screening on.
 *
 * Two signals, both cheap and both honest:
 *   - a phrase the posting REPEATS is one it cares about
 *   - a capitalised word mid-sentence is nearly always a technology or a company
 *
 * Neither is clever. The alternative is a model call, which would make a local
 * zero-dependency tool into neither of those things.
 */
export function requirements(text, { min = 2 } = {}) {
  const counts = new Map();
  const bump = (term) => counts.set(term, (counts.get(term) ?? 0) + 1);

  for (const w of String(text).toLowerCase().match(/[a-z][a-z0-9+#./-]{2,}/g) ?? []) {
    const clean = singular(w.replace(/[.\-/]+$/, ''));
    if (clean.length > 2 && !STOPWORDS.has(clean)) bump(clean);
  }

  // Capitalised mid-sentence: Kubernetes, Apigee, MLOps, Playwright.
  const named = new Set();
  for (const m of String(text).matchAll(/(\S)\s+([A-Z][A-Za-z0-9+#./-]{2,})/g)) {
    if (!/[.!?:;]/.test(m[1])) named.add(singular(m[2].toLowerCase().replace(/[.,]+$/, '')));
  }

  return [...counts.entries()]
    .filter(([term, n]) => n >= min || named.has(term))
    .sort((a, b) => b[1] - a[1])
    .map(([term, n]) => ({ term, mentions: n, named: named.has(term) }));
}

/**
 * Which stored answers cover a posting, and what has nothing.
 *
 * A tag hit is strong: you said this answer is about that. A body hit is weak:
 * the word appears somewhere in the prose. Both are reported, labelled, because
 * conflating them would let one passing mention read as coverage.
 */
export function match(db, jdText, { top = 25, fits = null } = {}) {
  const answers = list(db, { fits });
  const reqs = requirements(jdText).slice(0, top);

  const covered = [];
  const gaps = [];

  for (const r of reqs) {
    const byTag = answers.filter((a) => a.tags.some((t) => overlap(t, r.term)));
    const byBody = answers.filter((a) => !byTag.includes(a) && a.body.toLowerCase().includes(r.term));
    if (byTag.length) covered.push({ ...r, how: 'tag', answers: byTag.map((a) => a.name) });
    else if (byBody.length) covered.push({ ...r, how: 'text', answers: byBody.map((a) => a.name) });
    else gaps.push(r);
  }

  return { covered, gaps, considered: reqs.length, answers: answers.length };
}

/**
 * Collapse the plural only, and only where it is safe.
 *
 * "platform" and "platforms" were being reported as two separate requirements,
 * which pads the list with the same word twice. Full stemming would be wrong
 * here: it turns "api" into "api" but also mangles product names, and this list
 * is read by a person deciding what to write next. So: trailing -s, and an
 * explicit refusal on the endings where dropping it changes the word.
 */
function singular(w) {
  if (w.length < 5 || !w.endsWith('s')) return w;
  if (/(ss|us|is|as|os)$/.test(w)) return w;   // business, status, analysis, aws
  // -ops is a whole family of product names, not a plural: MLOps, LLMOps,
  // DevOps, AIOps, SecOps, FinOps. The first version of this turned the two
  // requirements that mattered most on a real posting into "mlop" and "llmop",
  // which is worse than the duplicate plural it was written to remove.
  if (w.endsWith('ops')) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  return w.slice(0, -1);
}

/** "agentic-ai" should match "agentic", and "mlops" should match "mlops". */
function overlap(tag, term) {
  const parts = String(tag).toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
  return parts.includes(term) || parts.some((p) => p.length > 3 && term.includes(p));
}

function hydrate(row) {
  return { ...row, tags: row.tags ? JSON.parse(row.tags) : [] };
}
