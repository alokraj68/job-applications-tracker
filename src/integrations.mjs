// The two sibling packages, used if they are there and absent without drama.
//
// Both are OPTIONAL peer dependencies, not dependencies. Somebody who wants a
// record of where they applied should not have to download a prose linter to
// get one, and the zero-runtime-dependency claim here is a real difference from
// the alternatives rather than a boast. `pagecheck` in craftkit declares
// Playwright the same way and still ships its "runtime deps 0" badge honestly.
//
// They are invoked as COMMANDS, not imported as modules. A bare
// `import('@alokraj68/plainspoken')` resolves by walking up from this file, so
// it finds nothing when both packages are installed globally - which is the
// normal way to install a CLI and the first thing that failed when this was
// written the obvious way. The executables are on PATH in both the global and
// the project case, so spawning them works in both.

import { execFileSync } from 'node:child_process';

export const INSTALL_HINT = {
  plainspoken: 'npm i -g @alokraj68/plainspoken',
  'ats-resume': 'npm i -g @alokraj68/ats-resume',
};

/**
 * Run a sibling CLI and parse its `--json`.
 *
 * A non-zero exit is expected rather than exceptional: both tools exit 1 when
 * they find something, which is the whole point of them. So stdout is read
 * either way and only a genuine spawn failure counts as absent.
 */
function runJson(bin, args, input = undefined) {
  try {
    const out = execFileSync(bin, args, {
      input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 20_000,
    });
    return { ok: true, data: JSON.parse(out) };
  } catch (err) {
    if (err.stdout) {
      try { return { ok: true, data: JSON.parse(err.stdout) }; } catch { /* not json */ }
    }
    // ENOENT means the tool is not installed. Anything else is a real failure,
    // but from here both look the same to the caller: no result.
    return { ok: false, data: null };
  }
}

/**
 * Does this answer read as machine-written?
 *
 * Run when the answer is stored rather than when it is sent: the point of a
 * library is that what comes out of it is ready to paste.
 */
export function proseCheck(text) {
  const { ok, data } = runJson('plainspoken', ['--json', '--preset', 'docs', '-'], text);
  if (!ok) return { available: false, errors: [], warnings: [] };
  const findings = (data?.results ?? []).flatMap((r) => r.findings ?? []);
  return {
    available: true,
    errors: findings.filter((f) => f.severity === 'error'),
    warnings: findings.filter((f) => f.severity === 'warn'),
  };
}

/**
 * How well the CV itself matches a posting.
 *
 * Two inputs, two different answers:
 *   - resume.json (JSON Resume) gives the match rate and the fatal gaps
 *   - the .txt dumped from a built PDF gives parseability, which is the half
 *     that decides whether a human sees it at all
 *
 * A .txt cannot produce a match rate, and the caller is told why rather than
 * shown a number that means something else.
 */
export function cvCheck(cvPath, jdPath) {
  const isJson = cvPath.endsWith('.json');
  const args = isJson ? ['tailor', cvPath, jdPath, '--json'] : ['lint', cvPath, '--json'];
  const { ok, data } = runJson('ats-resume', args);
  if (!ok) return { available: false, kind: null, result: null, note: null };
  return {
    available: true,
    kind: isJson ? 'match' : 'parse',
    result: data,
    note: isJson ? null
      : 'match rate needs a resume.json (JSON Resume schema); a .txt gives parseability only',
  };
}
