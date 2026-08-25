#!/usr/bin/env node
/**
 * Deletes the type aliases nothing reads.
 *
 * `node scripts/migrations/2026-08-25-drop-dead-type-aliases.mjs [--write]`
 *
 * Every spell file opens with a block like
 *
 *   type AttackableUnit = InstanceType<ContentApi['units']['AttackableUnit']>;
 *   type Spell = InstanceType<ContentApi['Spell']>;
 *   type Vi_W = InstanceType<ReturnType<typeof makeVi_W>>;
 *
 * which is how a pack names an instance type without value-importing core.
 * The codemod that first moved this pack onto `api` emitted them per file
 * unconditionally — 2002 of them across `spells/` — and `tsc` was never asked
 * whether any were read, because this pack's `tsconfig.json` did not set
 * `noUnusedLocals`. Asked once, the answer was 1697: **85% of that block is
 * dead**, and every single unused declaration in the whole package is one of
 * these two alias shapes. Nothing else in 237 files was unused.
 *
 * ## The compiler decides, not a regex
 *
 * The line numbers come from `tsc --noUnusedLocals` itself, so "unused" means
 * what the type checker means by it, including uses inside a class body, a
 * generic argument or a JSDoc cast. This script only refuses to touch a line
 * the compiler named that does not *look* like one of these aliases — a guard
 * against a future error format change silently deleting real code, not a
 * second opinion about what is used.
 *
 * It re-runs the compiler after each pass and stops when nothing is left,
 * because one alias can be the only reader of another.
 *
 * `tsconfig.json` gains `noUnusedLocals` in the same commit. Deleting 1697
 * lines is worth doing once; the reason they accumulated is that nothing
 * asked, and a cleanup that leaves the question unasked accumulates them
 * again.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const write = process.argv.includes('--write');

/**
 * Two messages, not one — and the difference is the whole reason the first
 * pass of this script reported nothing on the second wave:
 *
 *   TS6196: 'Vi_W' is declared but never used.            (a type)
 *   TS6133: 'Spell' is declared but its value is never read. (a value)
 *
 * Matching only the first found every dead type alias and none of the dead
 * `const` aliases underneath them.
 */
const REPORT =
  /^(.+?)\((\d+),\d+\): error TS(?:6133|6196): '(.+?)' is declared but (?:never used|its value is never read)/;

/**
 * The two shapes this migration is allowed to delete, and no other line.
 *
 * `TYPE_ALIAS` is the `type X = InstanceType<...>` block at the top of a
 * file. `VALUE_ALIAS` is its runtime twin inside a factory body — `const
 * Spell = api.Spell;` — emitted by the same codemod for every `api` member a
 * file might have wanted. Deleting a type alias uncovers these: while the
 * alias was there, the name resolved and the local counted as read.
 *
 * `VALUE_ALIAS` is a pure member-access chain and nothing else. A `const X =
 * something()` may be dead *and* load-bearing — the call could be what
 * matters — so a call is refused and reported rather than guessed at, even
 * `makeY(api)`, whose only effect is warming a memo.
 */
const TYPE_ALIAS = /^type [A-Za-z_$][\w$]* = InstanceType<(ContentApi\[|ReturnType<typeof )/;
const VALUE_ALIAS = /^const [A-Za-z_$][\w$]* = [A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+;$/;

function unusedDeclarations() {
  let output = '';
  try {
    execFileSync('npx', ['tsc', '-p', 'tsconfig.json', '--noUnusedLocals'], {
      cwd: root,
      encoding: 'utf8',
    });
  } catch (failed) {
    // A non-zero exit is the normal case here: these *are* errors.
    output = `${failed.stdout ?? ''}${failed.stderr ?? ''}`;
  }

  const byFile = new Map();
  for (const line of output.split('\n')) {
    const found = REPORT.exec(line.trim());
    if (!found) continue;
    const [, file, lineNumber] = found;
    // Core ships raw TypeScript, so its own source is part of this
    // program and `--noUnusedLocals` reports on it too. Core's unused
    // locals are core's to fix; this pass is about this package.
    if (file.includes('node_modules')) continue;
    if (!byFile.has(file)) byFile.set(file, new Set());
    byFile.get(file).add(Number(lineNumber));
  }
  return byFile;
}

/**
 * Removes `lineNumbers` (1-indexed) and closes the hole they leave.
 *
 * A deleted block sits between the imports and the first real declaration,
 * both of which are already separated from it by blank lines — remove ten
 * lines from between them and the file opens with five consecutive blank
 * ones. Only runs of blank lines that a deletion actually touched are
 * collapsed, so blank-line spacing everywhere else in the file is left
 * exactly as its author left it.
 */
function withLinesRemoved(source, lineNumbers) {
  const lines = source.split('\n');
  const kept = [];
  const touched = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (lineNumbers.has(i + 1)) {
      touched.add(kept.length);
      continue;
    }
    kept.push(lines[i]);
  }

  const out = [];
  for (let i = 0; i < kept.length; i++) {
    const atHole = touched.has(i);
    if (atHole && kept[i].trim() === '') {
      // Keep one blank line for the whole run this hole opened up.
      let j = i;
      while (j < kept.length && kept[j].trim() === '') j++;
      if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
      i = j - 1;
      continue;
    }
    out.push(kept[i]);
  }
  return out.join('\n');
}

let pass = 0;
let removed = 0;
const refused = [];

while (pass < 8) {
  pass++;
  const byFile = unusedDeclarations();
  if (byFile.size === 0) break;

  let removedThisPass = 0;
  for (const [file, lineNumbers] of byFile) {
    const path = join(root, file);
    const source = readFileSync(path, 'utf8');
    const lines = source.split('\n');

    const deletable = new Set();
    for (const lineNumber of lineNumbers) {
      const text = (lines[lineNumber - 1] ?? '').trim();
      if (TYPE_ALIAS.test(text) || VALUE_ALIAS.test(text)) deletable.add(lineNumber);
      else refused.push(`${file}:${lineNumber}: ${text.slice(0, 70)}`);
    }
    if (deletable.size === 0) continue;

    removedThisPass += deletable.size;
    if (write) writeFileSync(path, withLinesRemoved(source, deletable));
  }

  removed += removedThisPass;
  console.log(`pass ${pass}: ${write ? 'removed' : 'would remove'} ${removedThisPass} alias(es)`);
  if (!write || removedThisPass === 0) break;
}

console.log(`\n${write ? 'removed' : 'would remove'} ${removed} dead type alias(es)`);

if (refused.length > 0) {
  console.error(`\n  ${refused.length} unused declaration(s) left alone — not an alias:\n`);
  for (const line of refused.slice(0, 20)) console.error(`    ${line}`);
  process.exitCode = 1;
}
