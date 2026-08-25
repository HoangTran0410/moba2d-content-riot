#!/usr/bin/env node
/**
 * `makeAhri_Q` was a factory; `Ahri_Q` is the class. Rename every reference.
 *
 * `node scripts/migrations/2026-08-25-rename-factories.mjs [--write]`
 *
 * Second half of the classes-not-factories migration, run after
 * `2026-08-25-classes-not-factories.mjs` has written the classes and the map
 * of what each factory now names. Two forms, in this order:
 *
 *   makeAhri_Q_Object(api)  ->  Ahri_Q_Object     a call that built the class
 *   makeAhri_Q_Object       ->  Ahri_Q_Object     an import, a type position
 *
 * The call form first, because the bare form would otherwise leave `Ahri_Q(api)`
 * behind — a class called as a function.
 *
 * The map is only ever built from `spells/`, which is what keeps this off
 * `makeBaronAbilities` and anything else in `monsters/` that is still a real
 * factory and stays one.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const write = process.argv.includes('--write');

const renames = new Map(
  JSON.parse(readFileSync(join(root, 'scripts/migrations/.rename-map.json'), 'utf8'))
);
if (renames.size === 0) throw new Error('the rename map is empty — run the class migration first');

function tsFilesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'generated', '.git'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...tsFilesUnder(full));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

let touched = 0;
let replacements = 0;
const collisions = [];

for (const path of tsFilesUnder(root)) {
  const original = readFileSync(path, 'utf8');
  let out = original;

  /**
   * `type Tibbers = Instance<typeof makeTibbers>;` was the alias that named
   * what a factory eventually built. The class name is the type now, so the
   * alias is not shortened, it is deleted — left in, the rename would make it
   * `type Tibbers = Instance<typeof Tibbers>`, which is circular, and where
   * the class is *imported* it is worse: a local `type X` beside an imported
   * `X` is "import declaration conflicts with local declaration", 71 times.
   *
   * Three spellings accumulated for the same idea — `Instance<…>`,
   * `InstanceType<typeof make…>` and `InstanceType<ReturnType<typeof make…>>`
   * — which is its own argument for the class simply being the type.
   */
  out = out.replace(
    /^type \w+ = (?:Instance<typeof (make\w+)>|InstanceType<(?:ReturnType<)?typeof (make\w+)>>?);\n/gm,
    (line, shortForm, longForm) => (renames.has(shortForm ?? longForm) ? '' : line)
  );

  /**
   * A comment block that exists only to explain the alias above goes with it.
   * Leaving it turns a correct file into a misleading one — `Pet.test.ts` had
   * three lines saying the type "needs its own alias off the factory's return
   * type", beside no alias and no factory.
   */
  out = out.replace(
    /(?:^\/\/[^\n]*\n)+(?=(?:type \w+ = (?:Instance<typeof make|InstanceType<ReturnType<typeof make))[^\n]*\n)+/gm,
    match => (/factory|alias/i.test(match) ? '' : match)
  );

  /**
   * `const Malphite_Q = makeMalphite_Q(api);` is how a test named the class it
   * was about to drive. Renamed naively that becomes `const Malphite_Q =
   * Malphite_Q;`, which is a temporal-dead-zone error, so the binding goes
   * instead and the name resolves to the import. A local that was *not* named
   * after the class keeps a plain alias, because the file chose that name for
   * a reason.
   */
  out = out.replace(
    /^([ \t]*)(?:const|let) (\w+) = (make\w+)\(\w+\);\n(?:[ \t]*type \2 = InstanceType<typeof \2>;\n)?/gm,
    (line, indent, local, factory) => {
      const symbol = renames.get(factory);
      if (!symbol) return line;
      return symbol === local ? '' : `${indent}const ${local} = ${symbol};\n`;
    }
  );

  for (const [factory, symbol] of renames) {
    if (!out.includes(factory)) continue;
    // A file that already means something else by this name would be broken
    // silently by the rename, so say so instead.
    const declaresOwn = new RegExp(`^(?:export )?(?:const|let|class|function) ${symbol}\\b`, 'm');
    if (declaresOwn.test(out) && !path.includes(`/spells/${symbol.split('_')[0]}`)) {
      const already = new RegExp(`\\b${factory}\\b`).test(out);
      if (already) collisions.push(`${relative(root, path)}: ${factory} -> ${symbol} already taken`);
    }
    const before = out;
    out = out.replace(new RegExp(`\\b${factory}\\(\\w+\\)`, 'g'), symbol);
    out = out.replace(new RegExp(`\\b${factory}\\b`, 'g'), symbol);
    if (out !== before) replacements++;
  }

  if (out === original) continue;
  touched++;
  if (write) writeFileSync(path, out);
}

console.log(
  `${write ? 'rewrote' : 'would rewrite'} ${touched} file(s), ${replacements} symbol rename(s)`
);
if (collisions.length > 0) {
  console.error(`\n  ${collisions.length} possible collision(s):\n`);
  for (const line of collisions.slice(0, 20)) console.error(`    ${line}`);
  process.exitCode = 1;
}
