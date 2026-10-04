// Every question an application form has asked, and the answer you gave it.
//
// Portals ask the same twenty things in two hundred wordings: "Notice period",
// "What is your notice period (in days)?", "Notice Period *". Each one is
// logged the first time it is met. Next time, the same wording reuses its
// answer; a near wording borrows the closest answered one and is marked
// `borrowed` so it shows up for review; anything else waits for you.
//
// The short, form-field sibling of answers.mjs, which holds the long prose.
//
// An answer can depend on where the job is and what it is. Expected salary is
// 45,000 AED a month in Dubai, 55,000 SAR in Riyadh, 90 LPA in Bangalore, and
// higher again for a CTO seat. So a question has a default answer, plus answers
// scoped to a region, a role, or both; the most specific one that fits wins.

const now = () => new Date().toISOString();

/** Words that carry no meaning in a form label. Short on purpose: "salary" must survive. */
const FILLER = new Set(`a an the of in on at to for with from by as is are was were be been do does did
you your yours what which how many much please kindly enter select provide mention specify state indicate
have has any if per optional required can could would will i my me`.split(/\s+/).filter(Boolean));

/**
 * Words that make two questions different even when everything else matches.
 * "Current monthly salary" and "Expected monthly salary" share two of three
 * words; borrowing one's answer for the other is the expensive mistake this
 * whole table exists to avoid. If either side has one of these, both must.
 */
const DISTINCT = new Set(['current', 'expected', 'previous', 'last', 'minimum', 'maximum',
  'monthly', 'annual', 'yearly', 'basic', 'total', 'notice', 'nationality', 'visa', 'licence', 'license']);

/** Related means at least this share of the meaningful words in common. */
export const RELATED = 0.5;

export const STATUSES = ['open', 'answered', 'borrowed'];

export function tokens(question) {
  return String(question).toLowerCase()
    .replace(/\(optional\)|\*/g, ' ')
    .match(/[a-z0-9]+/g)
    ?.map((w) => (w.length > 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w))
    .filter((w) => !FILLER.has(w)) ?? [];
}

/** Same meaningful words in the same order = the same question. */
export const keyOf = (question) => tokens(question).join(' ');

/** 0..1, or 0 outright when the distinguishing words disagree. */
export function similarity(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  for (const w of DISTINCT) if (A.has(w) !== B.has(w)) return 0;
  const shared = [...A].filter((w) => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return union ? shared / union : 0;
}

/**
 * A select box only accepts its own options. Exact first, then containment
 * either way ("30 days" picks "30 Days", "Immediately" picks "Immediate
 * joiner"). No match is null, never the nearest-looking option.
 */
export function pickOption(answer, options) {
  if (!options?.length || answer == null) return answer;
  const a = String(answer).toLowerCase().trim();
  const lower = options.map((o) => String(o).toLowerCase().trim());
  const exact = lower.indexOf(a);
  if (exact >= 0) return options[exact];
  const stem = (s) => s.replace(/(ly|ed|s)$/, '');
  const hit = lower.findIndex((o) => o.includes(a) || a.includes(o) || (stem(a).length > 3 && o.includes(stem(a))));
  return hit >= 0 ? options[hit] : null;
}

/**
 * Place names to the region an answer is scoped to. Checked in order, whole
 * words only, so "Dubai - United Arab Emirates (UAE)" is uae and "Oman" is not
 * found inside "Romania".
 */
export const REGIONS = {
  uae: ['uae', 'united arab emirates', 'dubai', 'abu dhabi', 'sharjah', 'ajman', 'ras al khaimah', 'fujairah', 'umm al quwain', 'al ain'],
  ksa: ['ksa', 'saudi', 'saudi arabia', 'riyadh', 'jeddah', 'dammam', 'khobar', 'al khobar', 'neom', 'mecca', 'medina'],
  qatar: ['qatar', 'doha'],
  oman: ['oman', 'muscat'],
  bahrain: ['bahrain', 'manama'],
  kuwait: ['kuwait'],
  india: ['india', 'bangalore', 'bengaluru', 'kochi', 'cochin', 'trivandrum', 'thiruvananthapuram', 'mumbai', 'delhi',
    'new delhi', 'noida', 'gurgaon', 'gurugram', 'hyderabad', 'chennai', 'pune', 'kolkata', 'ahmedabad'],
};

export function regionOf(location) {
  const text = ` ${String(location ?? '').toLowerCase().replace(/[^a-z]+/g, ' ')} `;
  for (const [region, names] of Object.entries(REGIONS)) {
    if (names.some((n) => text.includes(` ${n} `))) return region;
  }
  return null;
}

/**
 * Answer one question for one context. `region` must equal the job's region;
 * `role` must appear in the job title. Region outranks role: a CTO salary in
 * Riyadh is a Riyadh salary first.
 */
function scopedAnswer(db, questionId, { region, title }) {
  const t = String(title ?? '').toLowerCase();
  return db.prepare('SELECT * FROM question_answers WHERE question_id = ?').all(questionId)
    .filter((s) => (!s.region || s.region === region) && (!s.role || t.includes(s.role.toLowerCase())))
    .sort((a, b) => (!!b.region * 2 + !!b.role) - (!!a.region * 2 + !!a.role))[0] ?? null;
}

/** Set (or, with a blank answer, remove) the answer for one region and/or role. */
export function setScoped(db, id, { region = '', role = '' }, answer) {
  if (!get(db, id)) throw new Error(`no question #${id}`);
  region = String(region ?? '').toLowerCase().trim();
  role = String(role ?? '').toLowerCase().trim();
  if (!region && !role) return setAnswer(db, id, answer);
  if (region && !REGIONS[region]) throw new Error(`unknown region "${region}". One of: ${Object.keys(REGIONS).join(', ')}`);
  if (answer == null || !String(answer).trim()) {
    db.prepare('DELETE FROM question_answers WHERE question_id = ? AND region = ? AND role = ?').run(id, region, role);
  } else {
    db.prepare(`INSERT INTO question_answers (question_id, region, role, answer, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (question_id, region, role) DO UPDATE SET answer = excluded.answer, updated_at = excluded.updated_at`)
      .run(id, region, role, String(answer).trim(), now());
  }
  return get(db, id);
}

/** Log a question as met. Same wording again bumps the count and adds the portal. */
export function record(db, { question, portal = null, options = null }) {
  const key = keyOf(question);
  if (!key) throw new Error(`"${question}" has no words to key on`);
  const at = now();
  const row = db.prepare('SELECT * FROM questions WHERE key = ?').get(key);
  if (!row) {
    db.prepare(`INSERT INTO questions (question, key, options, portals, first_seen, last_seen, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(question.trim(), key, options ? JSON.stringify(options) : null,
        JSON.stringify(portal ? [portal] : []), at, at, at);
  } else {
    const portals = new Set(JSON.parse(row.portals ?? '[]'));
    if (portal) portals.add(portal);
    db.prepare('UPDATE questions SET seen = seen + 1, portals = ?, options = COALESCE(?, options), last_seen = ? WHERE id = ?')
      .run(JSON.stringify([...portals]), options ? JSON.stringify(options) : null, at, row.id);
  }
  return byKey(db, key);
}

/**
 * The answer to use for a question, and how it was reached:
 *   scoped    your answer for this job's region and/or role
 *   exact     answered before in this wording
 *   related   borrowed from a near question, now stored and marked for review
 *   open      nothing to go on; it is in `settings` waiting for you
 *   no-option there is an answer, but none of this form's options fits it
 *
 * `job` is `{ location, title }` of the posting being applied to.
 */
export function resolve(db, { question, portal = null, options = null, job = {} }) {
  let q = record(db, { question, portal, options });

  const scoped = scopedAnswer(db, q.id, { region: regionOf(job.location), title: job.title });
  if (scoped) return pick(q, scoped.answer, 'scoped', options);

  if (q.answer == null) {
    const best = answered(db)
      .filter((o) => o.id !== q.id)
      .map((o) => ({ o, score: similarity(q.question, o.question) }))
      .sort((x, y) => y.score - x.score)[0];
    if (!best || best.score < RELATED) return { question: q, answer: null, via: 'open' };
    db.prepare("UPDATE questions SET answer = ?, status = 'borrowed', borrowed_from = ?, updated_at = ? WHERE id = ?")
      .run(best.o.answer, best.o.id, now(), q.id);
    q = get(db, q.id);
  }

  return pick(q, q.answer, q.status === 'borrowed' ? 'related' : 'exact', options);
}

function pick(q, answer, via, options) {
  if (!options?.length) return { question: q, answer, via };
  const picked = pickOption(answer, options);
  return picked == null
    ? { question: q, answer: null, via: 'no-option', wanted: answer }
    : { question: q, answer: picked, via };
}

/** Your answer. Setting it by hand is what clears `borrowed`. */
export function setAnswer(db, id, answer) {
  if (!get(db, id)) throw new Error(`no question #${id}`);
  const blank = answer == null || !String(answer).trim();
  db.prepare('UPDATE questions SET answer = ?, status = ?, borrowed_from = NULL, updated_at = ? WHERE id = ?')
    .run(blank ? null : String(answer).trim(), blank ? 'open' : 'answered', now(), id);
  return get(db, id);
}

export function list(db, { status = null } = {}) {
  if (status && !STATUSES.includes(status)) throw new Error(`unknown status "${status}". One of: ${STATUSES.join(', ')}`);
  const sql = 'SELECT * FROM questions' + (status ? ' WHERE status = ?' : '') + ' ORDER BY seen DESC, id';
  const scopes = db.prepare('SELECT * FROM question_answers ORDER BY region, role').all();
  return (status ? db.prepare(sql).all(status) : db.prepare(sql).all()).map(hydrate)
    .map((q) => ({ ...q, scoped: scopes.filter((s) => s.question_id === q.id) }));
}

export function get(db, id) {
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  return row ? hydrate(row) : null;
}

export function remove(db, id) {
  return db.prepare('DELETE FROM questions WHERE id = ?').run(id).changes > 0;
}

const byKey = (db, key) => hydrate(db.prepare('SELECT * FROM questions WHERE key = ?').get(key));

/** Borrowed answers are never lent on: a guess of a guess drifts. */
const answered = (db) => db.prepare("SELECT * FROM questions WHERE status = 'answered'").all();

function hydrate(row) {
  return {
    ...row,
    options: row.options ? JSON.parse(row.options) : null,
    portals: row.portals ? JSON.parse(row.portals) : [],
  };
}
