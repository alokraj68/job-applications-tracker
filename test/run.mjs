// Both halves asserted, as in every repo here: the checks must fire on input
// built to break them, and stay silent on input that is simply correct. The
// second half is the one that keeps a tool usable.
import assert from 'node:assert/strict';
import { open, add, get, list, setStage, history, followup, remove, STAGES, TERMINAL } from '../src/store.mjs';
import { run as answerTests } from './answers.mjs';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok    ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

/** A fresh in-memory store per test, so no test can depend on another's rows. */
const fresh = () => open(':memory:');

const SAMPLE = {
  url: 'https://careers.deliveryhero.com/job/sr-engineering-manager-in-dubai-uae-jid-10056',
  company: 'talabat',
  role: 'Sr. Engineering Manager',
  source: 'careers.deliveryhero.com',
  cv_file: 'Alok-Rajasukumaran-Resume.pdf',
  answers: ['talabat-fit-1440'],
};

console.log('\nrecords an application');
test('add returns the stored row', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  assert.equal(a.company, 'talabat');
  assert.equal(a.stage, 'applied');
  assert.ok(a.id > 0, 'expected an id');
});
test('remembers which CV variant was sent', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  assert.equal(a.cv_file, 'Alok-Rajasukumaran-Resume.pdf');
});
test('answers come back as an array, not JSON text', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  assert.deepEqual(a.answers, ['talabat-fit-1440']);
});
test('an application with no answers yet has an empty array', () => {
  const db = fresh();
  const a = add(db, { url: 'https://example.com/x' });
  assert.deepEqual(a.answers, [], JSON.stringify(a.answers));
});
test('writes the opening stage into the history', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  const h = history(db, a.id);
  assert.equal(h.length, 1);
  assert.equal(h[0].stage, 'applied');
});

console.log('\nrefuses input that would corrupt the record');
test('an application with no url is rejected', () => {
  const db = fresh();
  assert.throws(() => add(db, { company: 'x' }), /needs a url/);
});
test('the same posting cannot be recorded twice', () => {
  const db = fresh();
  add(db, SAMPLE);
  assert.throws(() => add(db, SAMPLE), /already recorded as #1/);
});
test('an invented stage is rejected, and names the valid ones', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  assert.throws(() => setStage(db, a.id, 'ghosted'), /unknown stage "ghosted"/);
  assert.throws(() => setStage(db, a.id, 'ghosted'), /applied, screening/);
});
test('moving an application that does not exist is an error', () => {
  const db = fresh();
  assert.throws(() => setStage(db, 99, 'interview'), /no application #99/);
});

console.log('\nfollows the funnel');
test('setStage moves it and keeps the history', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  setStage(db, a.id, 'screening', 'recruiter call booked');
  const moved = setStage(db, a.id, 'interview');
  assert.equal(moved.stage, 'interview');
  assert.deepEqual(history(db, a.id).map((h) => h.stage), ['applied', 'screening', 'interview']);
});
test('a stage note is kept', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  setStage(db, a.id, 'screening', 'recruiter call booked');
  assert.equal(history(db, a.id)[1].note, 'recruiter call booked');
});
test('--open hides the ones that are finished', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  add(db, { url: 'https://example.com/other', company: 'Other' });
  setStage(db, a.id, 'rejected');
  assert.equal(list(db).length, 2);
  assert.equal(list(db, { open: true }).length, 1);
});
test('every terminal stage is a real stage', () => {
  for (const s of TERMINAL) assert.ok(STAGES.includes(s), `${s} is not in STAGES`);
});

console.log('\nchases what has gone quiet');
test('something applied to today is not chased', () => {
  const db = fresh();
  add(db, SAMPLE);
  assert.equal(followup(db).length, 0);
});
test('silence past the threshold surfaces, with the day count', () => {
  const db = fresh();
  add(db, SAMPLE);
  const inTenDays = new Date(Date.now() + 10 * 86_400_000);
  const due = followup(db, { asOf: inTenDays });
  assert.equal(due.length, 1, JSON.stringify(due));
  assert.equal(due[0].quiet_days, 10);
});
test('a rejection is never chased, however old', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  setStage(db, a.id, 'rejected');
  const inAYear = new Date(Date.now() + 365 * 86_400_000);
  assert.equal(followup(db, { asOf: inAYear }).length, 0);
});
test('the clock runs from the last stage change, not from the application date', () => {
  // Something that reached interview yesterday is not stale because you applied
  // to it a month ago. This is the bug the `last stage change` rule prevents.
  const db = fresh();
  const a = add(db, SAMPLE);
  const inThirtyDays = new Date(Date.now() + 30 * 86_400_000);
  setStage(db, a.id, 'interview');            // the change happens "now"
  const due = followup(db, { asOf: inThirtyDays });
  assert.equal(due.length, 1);
  assert.ok(due[0].quiet_days <= 30, `counted from the wrong date: ${due[0].quiet_days}`);
});
test('an application backdated with --on is chased from THAT date', () => {
  // Importing three real applications from eighteen days earlier reported
  // nothing overdue, because the opening stage_history row was stamped with
  // the time of the import rather than the date applied.
  const db = fresh();
  const eighteenDaysAgo = new Date(Date.now() - 18 * 86_400_000).toISOString().slice(0, 10);
  add(db, { url: 'https://example.com/old-application', applied_on: eighteenDaysAgo });
  const due = followup(db);
  assert.equal(due.length, 1, 'a backdated application was not chased at all');
  assert.ok(due[0].quiet_days >= 17, `counted ${due[0].quiet_days} days, expected about 18`);
});
test('the quietest is listed first', () => {
  const db = fresh();
  add(db, { url: 'https://example.com/a', applied_on: '2026-01-01' });
  add(db, { url: 'https://example.com/b', applied_on: '2026-01-01' });
  const due = followup(db, { asOf: new Date(Date.now() + 40 * 86_400_000) });
  assert.ok(due[0].quiet_days >= due[1].quiet_days);
});

console.log('\nhousekeeping');
test('remove deletes it, and says whether it did', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  assert.equal(remove(db, a.id), true);
  assert.equal(get(db, a.id), null);
  assert.equal(remove(db, a.id), false);
});
test('deleting an application takes its history with it', () => {
  const db = fresh();
  const a = add(db, SAMPLE);
  setStage(db, a.id, 'screening');
  remove(db, a.id);
  assert.equal(history(db, a.id).length, 0, 'orphaned history rows survived the delete');
});
test('newest application is listed first', () => {
  const db = fresh();
  add(db, { url: 'https://example.com/old', applied_on: '2026-01-01' });
  add(db, { url: 'https://example.com/new', applied_on: '2026-09-27' });
  assert.match(list(db)[0].url, /new/);
});

answerTests(test);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
