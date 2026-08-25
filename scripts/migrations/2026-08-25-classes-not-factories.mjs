#!/usr/bin/env node
/**
 * Turns every spell factory back into an ordinary class declaration.
 *
 * `node scripts/migrations/2026-08-25-classes-not-factories.mjs [--write]`
 *
 * A pack may not value-import core, so the engine has to arrive rather than be
 * imported. It arrives in `packApi.ts` before any spell module evaluates,
 * which means a class can simply be declared:
 *
 *   export const makeAhri_Q = packClass((api: ContentApi) => {
 *     const Spell = api.Spell;
 *     class Ahri_Q extends Spell { ... }
 *     return Ahri_Q;
 *   });
 *   export default makeAhri_Q;
 *
 * becomes
 *
 *   const Spell = api.Spell;
 *   export default class Ahri_Q extends Spell { ... }
 *
 * The memo `packClass` held goes away with it: an ES module evaluates once, so
 * the class above *is* one class for the life of the page, which is the only
 * thing the memo ever bought.
 *
 * ## Four rewrites, and the order matters
 *
 * 1. Unwrap each block: dedent the body, hoist its `const X = api.…` aliases
 *    to module scope, and export whatever it returned.
 * 2. Drop `const Y = makeZ(api);` lines. `makeZ` is now the class `Z` itself,
 *    at module scope in this file or imported from a sibling.
 * 3. Rename across the pack: every `makeZ` becomes `Z`, in imports and at call
 *    sites, in `spells/` and in `tests/`.
 * 4. Duplicate aliases collapse. Two factories in one file each declared
 *    `const Spell = api.Spell`; at module scope that is a redeclaration.
 *    Identical declarations collapse to one; the same name with a *different*
 *    right-hand side is a conflict this refuses to guess at.
 *
 * Anything it cannot place is reported and nothing is written, because a
 * half-migrated file typechecks in ways that are worse than a failure.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const write = process.argv.includes('--write');

const BLOCK = /^export (?:const (\w+) = |(default) )packClass\(\(api: ContentApi\) => \{\n([\s\S]*?)\n\}\);$/gm;
const ALIAS = /^ {2}const (\w+) = (.+);$/;
const RETURN = /^ {2}return (\w+);$/;

/** Rewritten by hand in the same commit — see the loop below for why. */
const BY_HAND = new Set(['_EmptyExample.ts']);

/**
 * The four bundle files: classes that reference each other as values, built in
 * one closure and handed out through one accessor each.
 *
 *   const group0_Zed_W = packClass((api: ContentApi) => { …; return { A, B }; });
 *   export const makeZed_W = (api: ContentApi) => group0_Zed_W(api).A;
 *   export default makeZed_W;
 *   export const makeZed_W_Clone = (api: ContentApi) => group0_Zed_W(api).B;
 *
 * At module scope the bundle has nothing left to do: sibling declarations in
 * one module already see each other. So the wrapper and every accessor go, and
 * the members are exported directly.
 */
const GROUP_BLOCK =
  /^const (group\d+_\w+) = packClass\(\(api: ContentApi\) => \{\n([\s\S]*?)\n\}\);\n((?:export (?:const \w+ = \(api: ContentApi\) => \1\(api\)\.\w+;|default \w+;)\n?)+)/gm;
const GROUP_RETURN = /^ {2}return \{ ([\w, ]+) \};$/;
const ACCESSOR = /^export const (make\w+) = \(api: ContentApi\) => \w+\(api\)\.(\w+);$/;

const problems = [];
const renames = new Map(); // makeX -> the symbol it now names
const rewritten = new Map();

/** `  foo` -> `foo`, for every line of a factory body. */
const dedent = text =>
  text
    .split('\n')
    .map(line => (line.startsWith('  ') ? line.slice(2) : line))
    .join('\n');

for (const name of readdirSync(join(root, 'spells')).filter(f => f.endsWith('.ts')).sort()) {
  // `_EmptyExample.ts` is the teaching file, not content: its five blocks
  // `return class X { … }` inline rather than naming a class and returning it,
  // and its header describes the shape this migration replaces. It is written
  // by hand in the same commit — a codemod that mangled the one file people
  // read to learn the convention would be the worst possible outcome.
  //
  // The four group files are the other exclusion, for the opposite reason:
  // their bundle wrapper (`const group0_Zed_W = packClass(…)` plus one
  // accessor per member) does not survive this migration at all — at module
  // scope the members are simply sibling declarations, and there is nothing
  // left to bundle. Four files, rewritten by hand, rather than a branch in
  // here that runs four times and is read forever.
  if (BY_HAND.has(name)) continue;
  const path = join(root, 'spells', name);
  const original = readFileSync(path, 'utf8');
  if (!original.includes('packClass(')) continue;

  /** Module-scope aliases hoisted out of every block in this file. */
  const hoisted = new Map();
  /** `makeAhri_Q` -> `Ahri_Q`, for this file only. */
  const exported = new Map();
  let out = original;
  let changed = false;

  out = out.replace(GROUP_BLOCK, (all, bundle, body, accessors) => {
    const lines = body.split('\n');
    const returned = GROUP_RETURN.exec(lines[lines.length - 1]);
    if (!returned) {
      problems.push(`${name}: ${bundle} does not end in \`return { A, B };\``);
      return all;
    }
    const members = returned[1].split(',').map(part => part.trim());

    const defaultOf = /^export default (make\w+);$/m.exec(accessors)?.[1];
    const exportedMember = new Map();
    for (const line of accessors.split('\n')) {
      const found = ACCESSOR.exec(line.trim());
      if (found) exportedMember.set(found[2], found[1]);
    }

    const kept = [];
    for (const line of lines.slice(0, -1)) {
      const alias = ALIAS.exec(line);
      if (alias && kept.length === 0) {
        hoisted.set(alias[1], alias[2]);
        continue;
      }
      kept.push(dedent(line));
    }

    let declarations = kept.join('\n');
    for (const member of members) {
      const makeName = exportedMember.get(member);
      if (makeName) {
        renames.set(makeName, member);
        exported.set(makeName, member);
      }
      const keyword = makeName === defaultOf ? 'export default' : 'export';
      declarations = declarations.replace(
        new RegExp(`^((?:abstract )?class|const|let|function) ${member}\\b`, 'm'),
        match => `${keyword} ${match}`
      );
    }
    changed = true;
    return `${declarations}\n`;
  });

  out = out.replace(BLOCK, (all, constName, isDefault, body) => {
    const lines = body.split('\n');
    const last = lines[lines.length - 1];
    const returned = RETURN.exec(last);
    if (!returned) {
      problems.push(`${name}: block does not end in a plain \`return X;\` — ${last.trim()}`);
      return all;
    }
    const symbol = returned[1];
    const rest = lines.slice(0, -1);

    // Aliases at the top of the body, up to the first line that is not one.
    const kept = [];
    for (const line of rest) {
      // `const Ahri_Q_Object = makeAhri_Q_Object(api);` is left verbatim and
      // hoisted like any other alias. It is tempting to resolve it here by
      // stripping `make` — and wrong: `makeMoonlightOn` names `moonlightOn`,
      // not `MoonlightOn`, and only the rename map knows that. The second
      // pass has the whole map and turns this into nothing or a plain alias.
      const alias = ALIAS.exec(line);
      if (alias && kept.length === 0) {
        const [, aliasName, expression] = alias;
        const already = hoisted.get(aliasName);
        // One file both defines a symbol and re-fetches it through its own
        // factory (`Olaf_R`'s `CROWD_CONTROL`). At module scope the
        // definition is simply in scope, so the `make…(api)` fetch is
        // redundant whichever order the two blocks appear in.
        const selfFetch = value => new RegExp(`^make\\w+\\(api\\)$`).test(value);
        if (already !== undefined && selfFetch(expression)) continue;
        if (already !== undefined && selfFetch(already)) {
          hoisted.set(aliasName, expression);
          continue;
        }
        if (already !== undefined && already !== expression) {
          problems.push(
            `${name}: \`${aliasName}\` hoists to two different values ` +
              `(\`${already}\` and \`${expression}\`)`
          );
          return all;
        }
        hoisted.set(aliasName, expression);
        continue;
      }
      kept.push(dedent(line));
    }

    changed = true;
    if (constName) {
      renames.set(constName, symbol);
      exported.set(constName, symbol);
    }
    // The returned symbol is usually a class and sometimes not — `Brand_Q`
    // returns `applyAblaze`, an arrow function. Whatever declares it is what
    // gains the `export`, or the symbol quietly stops being importable and
    // every sibling that used it breaks one file away from the cause.
    const DECLARES = `^((?:abstract )?class|const|let|function) ${symbol}\\b`;
    const declaration = kept
      .join('\n')
      .replace(new RegExp(DECLARES, 'm'), match => `export ${match}`);
    return isDefault
      ? declaration.replace(new RegExp(`^export (${DECLARES.slice(1)})`, 'm'), 'export default $1')
      : declaration;
  });

  if (!changed) continue;

  /**
   * `export default makeAhri_Q;` was how the previous migration kept the
   * default export's *name* bound — the files call it from siblings. Now the
   * class carries both, so the line goes and its class gains `default`.
   */
  out = out.replace(/^export default (make\w+);(?:\n|$)/gm, (line, makeName) => {
    const symbol = exported.get(makeName);
    if (!symbol) {
      problems.push(`${name}: \`export default ${makeName}\` names no block in this file`);
      return line;
    }
    return '';
  });
  for (const [makeName, symbol] of exported) {
    if (!original.includes(`export default ${makeName};`)) continue;
    out = out.replace(
      new RegExp(`^export ((?:(?:abstract )?class|const|let|function) ${symbol}\\b)`, 'm'),
      'export default $1'
    );
  }

  // The engine arrives on `api` now, not through a wrapper.
  out = out.replace(
    /^import \{[^}]*\} from '\.\.\/packClass';$/m,
    "import { api } from '../packApi';"
  );

  // The hoisted aliases go directly under the imports, in one block.
  if (hoisted.size > 0) {
    const block = [...hoisted].map(([n, expression]) => `const ${n} = ${expression};`).join('\n');
    const importEnd = [...out.matchAll(/^import .*;$/gm)].pop();
    if (!importEnd) {
      problems.push(`${name}: no import line to hoist aliases under`);
      continue;
    }
    const at = importEnd.index + importEnd[0].length;
    out = `${out.slice(0, at)}\n\n${block}${out.slice(at)}`;
  }

  rewritten.set(path, out);
}

console.log(
  `${write ? 'rewrote' : 'would rewrite'} ${rewritten.size} file(s), ` +
    `${renames.size} exported symbol(s) renamed`
);

if (problems.length > 0) {
  console.error(`\n  ${problems.length} block(s) this cannot place:\n`);
  for (const line of problems.slice(0, 25)) console.error(`    ${line}`);
  console.error('\n  Nothing written.');
  process.exit(1);
}

if (write) {
  for (const [path, source] of rewritten) writeFileSync(path, source);
  writeFileSync(
    join(root, 'scripts/migrations/.rename-map.json'),
    `${JSON.stringify([...renames].filter(([, to]) => to), null, 2)}\n`
  );
  console.log('rename map written to scripts/migrations/.rename-map.json');
}
