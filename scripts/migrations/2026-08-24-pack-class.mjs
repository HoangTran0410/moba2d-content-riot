#!/usr/bin/env node
/**
 * Collapses the hand-rolled class-factory triple into `packClass`.
 *
 * `node scripts/migrations/2026-08-24-pack-class.mjs [--write]`
 *
 * Every class in this pack is a factory, because a pack may not value-import
 * core — `Spell` and the rest arrive on `api`. Every factory is memoized per
 * `api`, because the game, an e2e script and a test each build their own, and
 * an unmemoized factory hands two callers two `instanceof`-incompatible
 * classes with the same name. Both facts are real and neither is changed here.
 *
 * What is changed is how they are written. The codemod that first moved this
 * pack onto `api` spelled each one out as three top-level declarations:
 *
 *   function __buildX(api: ContentApi) { ... }
 *   const __cacheX = new WeakMap<ContentApi, ReturnType<typeof __buildX>>();
 *   export default function makeX(api: ContentApi) {
 *     const cached = __cacheX.get(api);
 *     if (cached) return cached;
 *     const built = __buildX(api);
 *     __cacheX.set(api, built);
 *     return built;
 *   }
 *
 * 650 times across 237 files — some five thousand lines whose only content is
 * the same eight-line memo, and the reason this pack reads like build output
 * rather than like source. `packClass.ts` holds that memo once.
 *
 * ## Conservative on purpose
 *
 * It matches the canonical block and nothing else: the exact `__build`,
 * `__cache` and `make` triple, same name in all three, anchored on a `}` at
 * column zero. A file with 650 near-identical blocks is exactly the file a
 * loose regex mangles, so anything that does not match is left alone and
 * reported by name — `--write` refuses outright if a `__build` or `__cache`
 * survives the pass, rather than leaving a half-migrated tree behind.
 *
 * The `make*` functions that are *not* part of a triple (hand-written helpers
 * that happen to share the naming) are untouched by construction: this only
 * ever rewrites a `make` that is preceded by its own matching `__build` and
 * `__cache`.
 *
 * The exported name is captured rather than derived, because the two halves
 * do not always agree: where the original symbol was a function rather than a
 * class, the first codemod left the private half lowercase and capitalized the
 * public one — `__buildisZephyrTarget` under `makeIsZephyrTarget`. What ties
 * the three together is the backreferenced `__cache`/`__build` name inside the
 * memo body, which no near-miss can satisfy, so the public name is free to be
 * whatever it already was.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const spellsDir = join(root, 'spells');
const write = process.argv.includes('--write');

/**
 * The whole triple, in one match.
 *
 * `([\s\S]*?)` is non-greedy but is not doing the work alone — it is pinned
 * on both sides: a `{` ending the `__build` signature, and a `}` at column
 * zero immediately followed by that same name's `const __cache` line. A
 * nested closing brace is always indented, so it cannot end the match early.
 */
const TRIPLE =
  /^function __build([A-Za-z0-9_]+)\(api: ContentApi\) \{\n([\s\S]*?)\n\}\nconst __cache\1 = new WeakMap<ContentApi, ReturnType<typeof __build\1>>\(\);\nexport (default function|function) make([A-Za-z0-9_]+)\(api: ContentApi\) \{\n {2}const cached = __cache\1\.get\(api\);\n {2}if \(cached\) return cached;\n {2}const built = __build\1\(api\);\n {2}__cache\1\.set\(api, built\);\n {2}return built;\n\}/gm;

const PACK_CLASS_IMPORT = "import { packClass } from '../packClass';";

/** Puts the `packClass` import directly after the file's last top import. */
function withImport(source) {
  if (source.includes(PACK_CLASS_IMPORT)) return source;
  const lines = source.split('\n');
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import .*;$/.test(lines[i])) last = i;
    // Stop at the first non-import, non-blank line: a later `import()` inside
    // a function body is not a top-level import and must not move the anchor.
    else if (last >= 0 && lines[i].trim() !== '') break;
  }
  if (last === -1) return `${PACK_CLASS_IMPORT}\n${source}`;
  lines.splice(last + 1, 0, PACK_CLASS_IMPORT);
  return lines.join('\n');
}

/**
 * Comments out, so the survivor check does not flag documentation.
 *
 * `_EmptyExample.ts`'s header describes the shape this migration replaces —
 * naming `__build<Name>` in prose so nobody reintroduces it — and a scan that
 * counts that as an unmigrated call site fails on its own explanation. Only
 * `//` lines and `/* *\/` blocks are removed, never a `//` inside a string,
 * which is why the line form is anchored on the start of the line.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n');
}

const files = readdirSync(spellsDir)
  .filter(name => name.endsWith('.ts'))
  .sort();

let collapsed = 0;
let touched = 0;
const leftovers = [];

for (const name of files) {
  const path = join(spellsDir, name);
  const original = readFileSync(path, 'utf8');
  let count = 0;

  const rewritten = original.replace(TRIPLE, (_all, _cacheName, body, form, exportName) => {
    count++;
    const declaration = `export const make${exportName} = packClass((api: ContentApi) => {\n${body}\n});`;
    // A default export keeps its name as well, never `export default
    // packClass(...)` on its own. The old `export default function makeX`
    // bound `makeX` in the module too, and these files use it: sibling
    // factories in the same file call `makeX(api)`, and the instance type is
    // spelled `InstanceType<ReturnType<typeof makeX>>`. An anonymous default
    // deletes that binding, and the failure is a bare `makeJanna_E is not
    // defined` out of the catalog generator — which is where this was caught,
    // after a first pass rewrote all 650 without it.
    return form === 'default function'
      ? `${declaration}\nexport default make${exportName};`
      : declaration;
  });

  if (count === 0) continue;
  collapsed += count;
  touched++;

  const final = withImport(rewritten);
  const survivors = (withoutComments(final).match(/__build|__cache/g) ?? []).length;
  if (survivors > 0) leftovers.push(`${name}: ${survivors} __build/__cache reference(s) left`);

  if (write) writeFileSync(path, final);
}

console.log(
  `${write ? 'rewrote' : 'would rewrite'} ${collapsed} factory triple(s) across ${touched} file(s)`
);

if (leftovers.length > 0) {
  console.error(`\n  ${leftovers.length} file(s) did not migrate cleanly:\n`);
  for (const line of leftovers) console.error(`    ${line}`);
  console.error('\n  Nothing was written.' + (write ? ' Re-run once these are handled.' : ''));
  process.exit(1);
}
