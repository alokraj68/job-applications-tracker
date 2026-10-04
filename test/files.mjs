// Duplicates across boards, and the files kept per application. Every test
// writes into its own temporary root; none touches the real one.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open, add, setStage, duplicateOf } from '../src/store.mjs';
import * as F from '../src/files.mjs';

export function run(test) {
  const fresh = () => open(':memory:');
  const root = () => mkdtempSync(join(tmpdir(), 'jat-'));

  console.log('\nduplicates across boards');
  test('the same company and role through a second board is caught', () => {
    const db = fresh();
    add(db, { url: 'https://naukrigulf.com/x', company: 'Talabat LLC', role: 'Sr. Engineering Manager' });
    assert.ok(duplicateOf(db, { company: 'talabat', role: 'Senior Engineering Manager' }));
  });
  test('a different role at the same company is not a duplicate', () => {
    const db = fresh();
    add(db, { url: 'https://naukrigulf.com/x', company: 'talabat', role: 'Engineering Manager' });
    assert.equal(duplicateOf(db, { company: 'talabat', role: 'Director of Engineering' }), null);
  });
  test('a role you were rejected from can be applied to again', () => {
    const db = fresh();
    const a = add(db, { url: 'https://naukrigulf.com/x', company: 'talabat', role: 'Engineering Manager' });
    setStage(db, a.id, 'rejected');
    assert.equal(duplicateOf(db, { company: 'talabat', role: 'Engineering Manager' }), null);
  });

  console.log('\nfiles per application');
  const app = { id: 7, company: 'talabat', role: 'Sr. Engineering Manager', stage: 'applied' };
  test('attached files land under fixed names in a folder named for the job', () => {
    const r = root();
    const src = join(r, 'posting.txt');
    writeFileSync(src, 'We need an engineering manager.');
    const dir = F.attach(app, { jd: src }, r);
    assert.match(dir, /7-talabat-sr-engineering-manager$/);
    assert.equal(F.read(app, r).files['jd.txt'], 'We need an engineering manager.');
  });
  test('attaching a file that does not exist is an error, not an empty file', () => {
    assert.throws(() => F.attach(app, { cv: '/nope/cv.pdf' }, root()), /no such file/);
  });
  test('what the form was told is kept', () => {
    const r = root();
    F.writeJson(app, 'submitted.json', { answers: [{ question: 'Expected salary', answer: '45,000 AED' }] }, r);
    assert.match(F.read(app, r).files['submitted.json'], /45,000 AED/);
  });
  test('a rejection archives the files, it does not delete them', () => {
    const r = root();
    F.writeText(app, 'jd.txt', 'x', r);
    const to = F.archiveIfClosed({ ...app, stage: 'rejected' }, r);
    assert.match(to, /archive/);
    assert.equal(F.read(app, r).archived, true);
  });
  test('an open application and an offer are never archived', () => {
    const r = root();
    F.writeText(app, 'jd.txt', 'x', r);
    assert.equal(F.archiveIfClosed(app, r), null);
    assert.equal(F.archiveIfClosed({ ...app, stage: 'offer' }, r), null);
  });
  test('writing to an archived application brings it back', () => {
    const r = root();
    F.writeText(app, 'jd.txt', 'x', r);
    F.archiveIfClosed({ ...app, stage: 'rejected' }, r);
    F.writeText(app, 'notes.txt', 'they called back', r);
    assert.equal(F.read(app, r).archived, false);
  });
  test('prune deletes old archives and keeps recent ones', () => {
    const r = root();
    const old = { ...app, id: 1 }, recent = { ...app, id: 2 };
    for (const a of [old, recent]) { F.writeText(a, 'jd.txt', 'x', r); F.archiveIfClosed({ ...a, stage: 'rejected' }, r); }
    const long = new Date(Date.now() - 120 * 86_400_000);
    utimesSync(join(r, 'archive', F.folderName(old)), long, long);
    assert.deepEqual(F.prune(90, r), [F.folderName(old)]);
    assert.ok(existsSync(join(r, 'archive', F.folderName(recent))));
  });
  test('prune never touches an open application', () => {
    const r = root();
    F.writeText(app, 'jd.txt', 'x', r);
    assert.deepEqual(F.prune(0, r), []);
    assert.ok(F.read(app, r));
  });
}
