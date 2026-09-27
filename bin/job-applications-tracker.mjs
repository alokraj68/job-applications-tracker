#!/usr/bin/env node
// Which job you applied to, with which CV, and what came back.
//
//   job-applications-tracker add <url> --company talabat --role "Sr. Engineering Manager"
//   job-applications-tracker list [--open] [--json]
//   job-applications-tracker stage <id> <stage> [--note "..."]
//   job-applications-tracker followup [--after 7]
//   job-applications-tracker show <id>
//   job-applications-tracker rm <id>
//   job-applications-tracker answers add <file> --tags agentic-ai,xp
//   job-applications-tracker answers match <jd.txt> [--fits 1440]
import { open, add, get, list, setStage, history, followup, remove, STAGES, TERMINAL, defaultDbPath }
  from '../src/store.mjs';
import * as answers from '../src/answers.mjs';

const args = process.argv.slice(2);
const cmd = args[0];

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', off: '\x1b[0m' }
  : { dim: '', b: '', g: '', y: '', r: '', c: '', off: '' };

const flag = (n) => args.includes(n);
const valueOf = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const positionals = () => {
  const out = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; }   // skip the flag AND its value
    out.push(args[i]);
  }
  return out;
};

if (!cmd || flag('-h') || flag('--help')) {
  console.log(`job-applications-tracker - which job you applied to, with which CV, and what came back

  add <url>                 record an application
      --company  --role  --source  --cv  --answers a,b  --on YYYY-MM-DD  --note
  list                      everything, newest first     [--open] [--json]
  show <id>                 one application and its history
  stage <id> <stage>        move it along               [--note "..."]
  followup                  what has gone quiet         [--after 7] [--json]
  rm <id>                   delete it

  answers add <file>        store a written answer      [--name x] [--tags a,b]
  answers list              what you have               [--fits 1440]
  answers show <name>       one answer in full
  answers match <jd-file>   what a posting needs that you have, and what you do not
  answers rm <name>         delete one

  stages: ${STAGES.join(', ')}

Stored in ${defaultDbPath()} and nowhere else.
This package has no telemetry. Nothing it knows leaves your machine.`);
  process.exit(cmd ? 0 : 2);
}

const db = open();
const asJson = flag('--json');
const die = (m) => { console.error(`job-applications-tracker: ${m}`); process.exit(1); };

/** Colour by how far along it is, so a list scans without being read. */
const stageColour = (s) =>
  s === 'offer' ? C.g : s === 'rejected' || s === 'withdrawn' ? C.dim : s === 'interview' ? C.c : C.y;

/**
 * A column has to be truncated as well as padded, or it is not a column.
 * `padEnd` on its own let "AllUp (One Tech Capital)" run two characters past
 * its width and shunted every field after it out of line.
 */
const col = (s, w) => String(s ?? '').slice(0, w).padEnd(w);

const row = (a) =>
  `  ${C.dim}#${col(a.id, 3)}${C.off} ${stageColour(a.stage)}${col(a.stage, 10)}${C.off} ` +
  `${C.b}${col(a.company ?? '?', 22)}${C.off} ${col(a.role, 34)} ` +
  `${C.dim}${a.applied_on}${C.off}`;

try {
  if (cmd === 'add') {
    const [url] = positionals();
    if (!url) die('add needs a url');
    const a = add(db, {
      url,
      company: valueOf('--company'),
      role: valueOf('--role'),
      source: valueOf('--source') ?? safeHost(url),
      cv_file: valueOf('--cv'),
      answers: valueOf('--answers')?.split(',').map((s) => s.trim()).filter(Boolean),
      applied_on: valueOf('--on'),
      notes: valueOf('--note'),
    });
    console.log(`${C.g}recorded${C.off} #${a.id}  ${a.company ?? url}`);
    if (!a.cv_file) console.log(`  ${C.dim}no --cv recorded. Which variant did you send?${C.off}`);
  }

  else if (cmd === 'list') {
    const all = list(db, { open: flag('--open') });
    if (asJson) { console.log(JSON.stringify(all, null, 2)); process.exit(0); }
    if (!all.length) { console.log(`  ${C.dim}nothing recorded yet${C.off}`); process.exit(0); }
    for (const a of all) console.log(row(a));
    const live = all.filter((x) => !TERMINAL.has(x.stage)).length;
    console.log(`\n  ${all.length} application(s), ${live} still open`);
  }

  else if (cmd === 'show') {
    const [id] = positionals();
    const a = get(db, Number(id));
    if (!a) die(`no application #${id}`);
    if (asJson) { console.log(JSON.stringify({ ...a, history: history(db, a.id) }, null, 2)); process.exit(0); }
    console.log(`\n${C.b}${a.company ?? '?'}${C.off} - ${a.role ?? '?'}`);
    console.log(`${C.dim}${a.url}${C.off}\n`);
    console.log(`  stage    ${stageColour(a.stage)}${a.stage}${C.off}`);
    console.log(`  applied  ${a.applied_on}`);
    console.log(`  cv       ${a.cv_file ?? C.dim + 'not recorded' + C.off}`);
    console.log(`  answers  ${a.answers.length ? a.answers.join(', ') : C.dim + 'none' + C.off}`);
    if (a.notes) console.log(`  notes    ${a.notes}`);
    console.log(`\n  history`);
    for (const h of history(db, a.id)) {
      console.log(`    ${h.at.slice(0, 10)}  ${h.stage}${h.note ? `  ${C.dim}${h.note}${C.off}` : ''}`);
    }
  }

  else if (cmd === 'stage') {
    const [id, stage] = positionals();
    if (!id || !stage) die('stage needs an id and a stage');
    const a = setStage(db, Number(id), stage, valueOf('--note'));
    console.log(`#${a.id} ${C.b}${a.company ?? a.url}${C.off} -> ${stageColour(a.stage)}${a.stage}${C.off}`);
  }

  else if (cmd === 'followup') {
    const due = followup(db, { after: Number(valueOf('--after', 7)) });
    if (asJson) { console.log(JSON.stringify(due, null, 2)); process.exit(0); }
    if (!due.length) { console.log(`  ${C.g}nothing is overdue${C.off}`); process.exit(0); }
    for (const a of due) {
      console.log(`${row(a)}  ${C.r}${a.quiet_days}d quiet${C.off}`);
    }
    console.log(`\n  ${due.length} waiting on a reply`);
  }

  else if (cmd === 'answers') {
    const [sub, arg] = positionals();
    const fits = valueOf('--fits') ? Number(valueOf('--fits')) : null;

    if (sub === 'add') {
      if (!arg) die('answers add needs a file');
      const a = answers.addFile(db, arg, {
        name: valueOf('--name'),
        tags: valueOf('--tags')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
      });
      console.log(`${C.g}stored${C.off} ${C.b}${a.name}${C.off}  ${a.words} words, ${a.chars} chars` +
        (a.tags.length ? `  ${C.dim}[${a.tags.join(', ')}]${C.off}` : `\n  ${C.dim}no --tags given. Tagging is what makes 'answers match' useful.${C.off}`));
    }

    else if (sub === 'list') {
      const all = answers.list(db, { fits });
      if (asJson) { console.log(JSON.stringify(all, null, 2)); process.exit(0); }
      if (!all.length) { console.log(`  ${C.dim}no answers stored yet${C.off}`); process.exit(0); }
      for (const a of all) {
        console.log(`  ${C.b}${col(a.name, 26)}${C.off} ${String(a.chars).padStart(5)} chars  ` +
          `${String(a.words).padStart(4)} words  ${C.dim}${a.tags.join(', ')}${C.off}`);
      }
      if (fits) console.log(`\n  ${all.length} that fit ${fits} characters`);
    }

    else if (sub === 'show') {
      const a = answers.get(db, arg ?? '');
      if (!a) die(`no answer "${arg}"`);
      console.log(`\n${C.b}${a.name}${C.off}  ${C.dim}${a.words} words, ${a.chars} chars` +
        `${a.tags.length ? `  [${a.tags.join(', ')}]` : ''}${C.off}\n`);
      console.log(a.body);
    }

    else if (sub === 'match') {
      if (!arg) die('answers match needs a job-description file');
      const { readFileSync } = await import('node:fs');
      const r = answers.match(db, readFileSync(arg, 'utf8'), { fits });
      if (asJson) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }

      if (!r.answers) {
        console.log(`  ${C.dim}no answers stored, so everything is a gap. Add some with 'answers add'.${C.off}`);
      }
      console.log(`\n${C.g}covered${C.off} ${C.dim}- you have written this already${C.off}`);
      if (!r.covered.length) console.log(`  ${C.dim}nothing${C.off}`);
      for (const c of r.covered) {
        const how = c.how === 'tag' ? `${C.g}tag${C.off} ` : `${C.y}text${C.off}`;
        console.log(`  ${how} ${col(c.term, 24)} ${C.dim}${c.answers.join(', ')}${C.off}`);
      }

      console.log(`\n${C.r}no answer yet${C.off} ${C.dim}- this is the work${C.off}`);
      if (!r.gaps.length) console.log(`  ${C.dim}nothing${C.off}`);
      for (const g of r.gaps) {
        console.log(`  ${col(g.term, 29)} ${C.dim}${g.mentions}x in the posting${g.named ? ', named' : ''}${C.off}`);
      }
      console.log(`\n  ${r.considered} requirement(s) read, ${r.covered.length} covered, ${r.gaps.length} open` +
        (fits ? `  ${C.dim}(only answers under ${fits} chars counted)${C.off}` : ''));
    }

    else if (sub === 'rm') {
      if (!answers.remove(db, arg ?? '')) die(`no answer "${arg}"`);
      console.log(`deleted ${arg}`);
    }

    else die(`unknown answers subcommand "${sub ?? ''}". One of: add, list, show, match, rm`);
  }

  else if (cmd === 'rm') {
    const [id] = positionals();
    if (!remove(db, Number(id))) die(`no application #${id}`);
    console.log(`deleted #${id}`);
  }

  else die(`unknown command "${cmd}". See --help`);
} catch (err) {
  die(err.message);
}

/** A bad URL should not take the command down before the row is written. */
function safeHost(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return null; }
}
