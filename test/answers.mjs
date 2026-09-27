// The answer library. Both halves as everywhere here: the matcher has to find
// what is genuinely covered, and - the harder half - it has to report a gap as a
// gap rather than letting one passing mention read as an answer.
import assert from 'node:assert/strict';
import { open } from '../src/store.mjs';
import * as A from '../src/answers.mjs';

export function run(test) {
  const fresh = () => open(':memory:');

  const TALABAT_ANSWER = `I have built what talabat runs on: a food delivery platform, a POS for
restaurants and cloud kitchens across over 55 outlets, a Saudi online grocery, and a
home-services marketplace. On XP, plainly: TDD and DDD are how I have run teams, with
every change reviewed before merge. Pair and mob programming I have not run as a default.`;

  const AGENTIC_ANSWER = `An agentic test-and-fix framework I architected and led from 2024 to
2026. It generates and executes Playwright suites against the running product, reads the
failures, and patches the defects it finds. The agent merges low-risk defects unattended
and escalates anything touching data or auth.`;

  const JD = `We are seeking a hands-on technology leader to build our AI platform.
You will lead Agentic AI and AI-powered business automation, enterprise workflow
orchestration, MLOps and LLMOps platforms, and large-scale experimentation.
Deep expertise in agentic AI, generative AI and large language model applications.
Experience with MLOps and LLMOps. Workflow orchestration and intelligent automation.
API-first and event-driven architectures. Experimentation and optimization.`;

  const seeded = () => {
    const db = fresh();
    A.add(db, { name: 'talabat-fit', body: TALABAT_ANSWER, tags: ['marketplace', 'xp', 'delivery'] });
    A.add(db, { name: 'agentic-testfix', body: AGENTIC_ANSWER, tags: ['agentic-ai', 'playwright'] });
    return db;
  };

  console.log('\nstores an answer with the facts you need at form-filling time');
  test('add records the character and word count', () => {
    const db = fresh();
    const a = A.add(db, { name: 'x', body: 'one two three' });
    assert.equal(a.words, 3);
    assert.equal(a.chars, 13);
  });
  test('the character count is what a 1440-limit form is checked against', () => {
    // 293 sits between the two fixtures (292 and 331) on purpose. A cap that
    // admits everything proves nothing, which is what the first version of this
    // test did.
    const db = seeded();
    const fitting = A.list(db, { fits: 293 });
    const all = A.list(db);
    assert.equal(all.length, 2);
    assert.equal(fitting.length, 1, JSON.stringify(fitting.map((a) => [a.name, a.chars])));
    assert.equal(fitting[0].name, 'agentic-testfix');
  });
  test('tags come back as an array, not JSON text', () => {
    const db = seeded();
    assert.deepEqual(A.get(db, 'talabat-fit').tags, ['marketplace', 'xp', 'delivery']);
  });
  test('a filename becomes a slug', () => {
    assert.equal(A.slugify('/tmp/Talabat Fit 1440.txt'), 'talabat-fit-1440');
  });

  console.log('\nrefuses input that would corrupt the library');
  test('an empty answer is rejected', () => {
    const db = fresh();
    assert.throws(() => A.add(db, { name: 'x', body: '   ' }), /needs a body/);
  });
  test('an answer with no name is rejected', () => {
    const db = fresh();
    assert.throws(() => A.add(db, { body: 'text' }), /needs a name/);
  });
  test('the same name cannot be stored twice', () => {
    const db = seeded();
    assert.throws(() => A.add(db, { name: 'talabat-fit', body: 'other' }), /already exists/);
  });

  console.log('\nreads what a posting is screening on');
  test('pulls the repeated and the named terms out of a real JD', () => {
    const terms = A.requirements(JD).map((r) => r.term);
    assert.ok(terms.includes('agentic'), terms.join(', '));
    assert.ok(terms.includes('mlops'), terms.join(', '));
    assert.ok(terms.includes('orchestration'), terms.join(', '));
  });
  test('a plural and its singular are one requirement, not two', () => {
    // "platform" and "platforms" were padding the list with the same word twice.
    const terms = A.requirements(JD).map((r) => r.term);
    assert.ok(terms.includes('platform'), terms.join(', '));
    assert.ok(!terms.includes('platforms'), 'the plural survived as a second entry');
  });
  test('but not where dropping the s changes the word', () => {
    // business -> busines, analysis -> analysi, aws -> aw. All wrong.
    const terms = A.requirements('Business business. Analysis analysis. AWS AWS.').map((r) => r.term);
    assert.ok(terms.includes('business'), terms.join(', '));
    assert.ok(terms.includes('analysis'), terms.join(', '));
    assert.ok(!terms.includes('busines'), 'mangled a word ending in ss');
  });
  test('and never on the -ops family, which are names', () => {
    // The first cut of the singulariser turned the two requirements that
    // mattered most on a real posting into "mlop" and "llmop".
    const terms = A.requirements('MLOps and LLMOps and DevOps. MLOps, LLMOps, DevOps.')
      .map((r) => r.term);
    for (const name of ['mlops', 'llmops', 'devops']) {
      assert.ok(terms.includes(name), `${name} was mangled; got: ${terms.join(', ')}`);
    }
  });
  test('does not report job-ad boilerplate as a requirement', () => {
    // "experience", "team", "role" and friends are in every posting ever
    // written. A gap list that opens with them is a gap list nobody reads.
    const terms = A.requirements(JD).map((r) => r.term);
    for (const noise of ['experience', 'you', 'will', 'seeking', 'role']) {
      assert.ok(!terms.includes(noise), `"${noise}" should not be a requirement`);
    }
  });

  console.log('\nmatches, and is honest about how');
  test('a tag hit is reported as a tag hit', () => {
    const db = seeded();
    const { covered } = A.match(db, JD);
    const agentic = covered.find((c) => c.term === 'agentic');
    assert.ok(agentic, 'agentic was not covered at all');
    assert.equal(agentic.how, 'tag');
    assert.deepEqual(agentic.answers, ['agentic-testfix']);
  });
  test('a body hit is reported as weaker than a tag hit', () => {
    const db = seeded();
    const { covered } = A.match(db, 'Playwright. Playwright suites and orchestration.');
    const hit = covered.find((c) => c.term === 'suites');
    if (hit) assert.equal(hit.how, 'text', 'a passing mention must not read as a tagged answer');
  });

  console.log('\nreports a gap as a gap - the half that matters');
  test('MLOps and LLMOps are gaps, because no answer covers them', () => {
    const db = seeded();
    const { gaps } = A.match(db, JD);
    const terms = gaps.map((g) => g.term);
    assert.ok(terms.includes('mlops'), `expected mlops in gaps; got: ${terms.join(', ')}`);
    assert.ok(terms.includes('llmops'), `expected llmops in gaps; got: ${terms.join(', ')}`);
  });
  test('an empty library makes everything a gap, and claims nothing', () => {
    const db = fresh();
    const { covered, gaps } = A.match(db, JD);
    assert.equal(covered.length, 0);
    assert.ok(gaps.length > 0);
  });
  test('the character cap is applied before matching, not after', () => {
    // An answer that cannot fit the form is not coverage for that form.
    const db = seeded();
    const { covered } = A.match(db, JD, { fits: 10 });
    assert.equal(covered.length, 0, JSON.stringify(covered));
  });

  console.log('\nhousekeeping');
  test('remove deletes it, and says whether it did', () => {
    const db = seeded();
    assert.equal(A.remove(db, 'talabat-fit'), true);
    assert.equal(A.get(db, 'talabat-fit'), null);
    assert.equal(A.remove(db, 'talabat-fit'), false);
  });
}
