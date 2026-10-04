// The question bank. Both halves: a reworded question must find its answer,
// and - the half that costs money when it fails - a question that only LOOKS
// similar must not borrow an answer that is wrong for it.
import assert from 'node:assert/strict';
import { open } from '../src/store.mjs';
import * as Q from '../src/questions.mjs';

export function run(test) {
  const fresh = () => open(':memory:');
  const answer = (db, question, text) => Q.setAnswer(db, Q.record(db, { question }).id, text);

  console.log('\nquestions: logging');
  test('a question met for the first time is logged, waiting for an answer', () => {
    const db = fresh();
    const r = Q.resolve(db, { question: 'Notice Period *', portal: 'naukrigulf' });
    assert.equal(r.via, 'open');
    assert.equal(Q.list(db, { status: 'open' }).length, 1);
  });
  test('the same question in different punctuation is one row, seen twice', () => {
    const db = fresh();
    Q.record(db, { question: 'Notice Period *', portal: 'naukrigulf' });
    const q = Q.record(db, { question: 'notice period?', portal: 'bayt' });
    assert.equal(Q.list(db).length, 1);
    assert.equal(q.seen, 2);
    assert.deepEqual(q.portals, ['naukrigulf', 'bayt']);
  });

  console.log('\nquestions: reuse');
  test('an answered question is answered again, exactly', () => {
    const db = fresh();
    answer(db, 'Notice period', '30 days');
    assert.deepEqual(
      (({ answer, via }) => ({ answer, via }))(Q.resolve(db, { question: 'Notice Period *' })),
      { answer: '30 days', via: 'exact' });
  });
  test('a reworded question borrows, and is marked for review', () => {
    const db = fresh();
    answer(db, 'Notice period', '30 days');
    const r = Q.resolve(db, { question: 'What is your notice period in days?' });
    assert.equal(r.via, 'related');
    assert.equal(r.answer, '30 days');
    assert.equal(Q.list(db, { status: 'borrowed' }).length, 1);
  });
  test('answering a borrowed question by hand makes it yours', () => {
    const db = fresh();
    answer(db, 'Notice period', '30 days');
    const r = Q.resolve(db, { question: 'What is your notice period in days?' });
    const q = Q.setAnswer(db, r.question.id, '30');
    assert.equal(q.status, 'answered');
    assert.equal(q.borrowed_from, null);
  });

  console.log('\nquestions: refuses a lookalike');
  test('expected salary never borrows the current salary', () => {
    const db = fresh();
    answer(db, 'Current monthly salary (AED)', '45000');
    const r = Q.resolve(db, { question: 'Expected monthly salary (AED)' });
    assert.equal(r.via, 'open', `borrowed "${r.answer}" from the wrong question`);
  });
  test('a borrowed answer is never lent on to a third question', () => {
    const db = fresh();
    answer(db, 'Notice period', '30 days');
    Q.resolve(db, { question: 'Notice period in days' });
    Q.remove(db, 1);   // the only real answer is gone
    assert.equal(Q.resolve(db, { question: 'Your notice period in days please' }).via, 'related',
      'same key as the borrowed row, so it is that row, still under review');
    assert.equal(Q.resolve(db, { question: 'Notice period length' }).via, 'open');
  });
  test('an unrelated question does not borrow anything', () => {
    const db = fresh();
    answer(db, 'Notice period', '30 days');
    assert.equal(Q.resolve(db, { question: 'Do you hold a UAE driving licence?' }).via, 'open');
  });

  console.log('\nquestions: select boxes');
  test('the answer is mapped onto the form\'s own option', () => {
    assert.equal(Q.pickOption('30 days', ['Immediate', '15 Days', '30 Days', '60 Days']), '30 Days');
    assert.equal(Q.pickOption('Immediately', ['Immediate joiner', '1 month']), 'Immediate joiner');
  });
  test('no fitting option is null, never the nearest-looking one', () => {
    assert.equal(Q.pickOption('45 days', ['Immediate', '30 Days', '60 Days']), null);
  });
  test('resolve says when the answer exists but the form cannot take it', () => {
    const db = fresh();
    answer(db, 'Notice period', '45 days');
    const r = Q.resolve(db, { question: 'Notice period', options: ['30 Days', '60 Days'] });
    assert.equal(r.via, 'no-option');
    assert.equal(r.wanted, '45 days');
  });

  console.log('\nquestions: region and role');
  const salary = (db) => {
    const q = answer(db, 'Expected monthly salary', 'negotiable');
    Q.setScoped(db, q.id, { region: 'uae' }, '45,000 AED');
    Q.setScoped(db, q.id, { region: 'ksa' }, '55,000 SAR');
    Q.setScoped(db, q.id, { region: 'uae', role: 'cto' }, '65,000 AED');
    return q;
  };
  const ask = (db, location, title) =>
    Q.resolve(db, { question: 'Expected monthly salary', job: { location, title } }).answer;
  test('a city on the card resolves to its region', () => {
    assert.equal(Q.regionOf('Dubai - United Arab Emirates (UAE)'), 'uae');
    assert.equal(Q.regionOf('Riyadh, Saudi Arabia'), 'ksa');
    assert.equal(Q.regionOf('Bengaluru'), 'india');
  });
  test('a region is matched on whole words, not inside another name', () => {
    assert.equal(Q.regionOf('Romania'), null, '"oman" found inside "romania"');
    assert.equal(Q.regionOf(''), null);
  });
  test('the region decides the answer', () => {
    const db = fresh(); salary(db);
    assert.equal(ask(db, 'Dubai', 'Engineering Manager'), '45,000 AED');
    assert.equal(ask(db, 'Riyadh', 'Engineering Manager'), '55,000 SAR');
  });
  test('region and role together beat region alone', () => {
    const db = fresh(); salary(db);
    assert.equal(ask(db, 'Abu Dhabi', 'Group CTO'), '65,000 AED');
  });
  test('a role scoped to one region does not leak into another', () => {
    const db = fresh(); salary(db);
    assert.equal(ask(db, 'Riyadh', 'CTO'), '55,000 SAR', 'the UAE CTO figure was quoted in Riyadh');
  });
  test('no scope fits: the default answer, never a scoped one', () => {
    const db = fresh(); salary(db);
    assert.equal(ask(db, 'Doha, Qatar', 'CTO'), 'negotiable');
  });
  test('an unknown region is refused, not stored', () => {
    const db = fresh(); const q = salary(db);
    assert.throws(() => Q.setScoped(db, q.id, { region: 'dubai' }, 'x'), /unknown region "dubai"/);
  });
  test('a blank scoped answer removes the scope', () => {
    const db = fresh(); const q = salary(db);
    Q.setScoped(db, q.id, { region: 'ksa' }, '');
    assert.equal(ask(db, 'Riyadh', 'Engineering Manager'), 'negotiable');
  });

  console.log('\nquestions: settings');
  test('clearing an answer puts the question back in the open list', () => {
    const db = fresh();
    const q = answer(db, 'Visa status', 'Employment visa');
    Q.setAnswer(db, q.id, '  ');
    assert.equal(Q.get(db, q.id).status, 'open');
  });
  test('answering a question that does not exist is an error', () => {
    assert.throws(() => Q.setAnswer(fresh(), 9, 'x'), /no question #9/);
  });
  test('a label with no words in it is rejected', () => {
    assert.throws(() => Q.record(fresh(), { question: ' * ' }), /no words/);
  });
}
