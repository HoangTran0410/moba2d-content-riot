#!/usr/bin/env node
/**
 * The four files the `packClass` migration missed.
 *
 * `node scripts/migrations/2026-08-25-pack-class-groups.mjs [--write]`
 *
 * Most spells are one class per factory. Four are not: `Zed_W` and its clone,
 * `Ezreal_W` and its orb, mark and two helpers, `Malzahar_E`'s object and its
 * spread function, `Syndra_Q`'s sphere registry — sets that reference each
 * other **as values**, so they cannot be built in separate closures and are
 * built together and returned as a bundle.
 *
 * The first api-migration codemod gave those a second naming convention:
 *
 *   function __group0_Zed_WBuild(api) { ...; return { Zed_W, Zed_W_Clone }; }
 *   const __group0_Zed_WCache = new WeakMap<ContentApi, ReturnType<...>>();
 *   function __group0_Zed_WBuilder(api) { ...the same memo... }
 *   export default function makeZed_W(api) { return __group0_Zed_WBuilder(api).Zed_W; }
 *   export function makeZed_W_Clone(api) { return __group0_Zed_WBuilder(api).Zed_W_Clone; }
 *
 * and the `packClass` migration's leftover check looked for `__build`/`__cache`
 * — which matches neither `Build` nor `Cache` — so it reported the tree clean
 * and these four kept a hand-rolled memo nobody could see. `tests/packClassSeam
 * .test.ts` is the fix for that class of miss: it scans for `new WeakMap<
 * ContentApi`, which is what a per-api memo *is*, whatever it is named.
 *
 * The bundle memoizes exactly like a class does, so `packClass` takes it
 * unchanged — it is a memo keyed on `api`, and nothing about it requires the
 * built value to be a constructor.
 *
 * `(?:\n|$)` on the accessor pattern is not defensive noise: one of these
 * four files ends its last accessor with `}` and no trailing newline, so a
 * pattern requiring `}\n` captured one accessor of two, and the leftover
 * check — the one this migration does have — caught it.
 *
 * The accessors keep their names as `const`s: `export default function makeX`
 * also *bound* `makeX` in the module, and these files call it from siblings.
 * The same mistake, made once already in the first pass, cost a full revert
 * and a re-run.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const spellsDir = join(root, 'spells');
const write = process.argv.includes('--write');

const GROUP =
  /^function __group(\d+)_(\w+)Build\(api: ContentApi\) \{\n([\s\S]*?)\n\}\nconst __group\1_\2Cache = new WeakMap<ContentApi, ReturnType<typeof __group\1_\2Build>>\(\);\nfunction __group\1_\2Builder\(api: ContentApi\) \{\n {2}const cached = __group\1_\2Cache\.get\(api\);\n {2}if \(cached\) return cached;\n {2}const built = __group\1_\2Build\(api\);\n {2}__group\1_\2Cache\.set\(api, built\);\n {2}return built;\n\}\n((?:export (?:default )?function make\w+\(api: ContentApi\) \{\n {2}return __group\1_\2Builder\(api\)\.\w+;\n\}(?:\n|$))+)/gm;

const ACCESSOR =
  /export (default )?function (make\w+)\(api: ContentApi\) \{\n {2}return __group\d+_\w+Builder\(api\)\.(\w+);\n\}(?:\n|$)/g;

const PACK_CLASS_IMPORT = "import { packClass } from '../packClass';";

let groups = 0;
const touchedFiles = [];

for (const name of readdirSync(spellsDir).filter(f => f.endsWith('.ts')).sort()) {
  const path = join(spellsDir, name);
  const original = readFileSync(path, 'utf8');
  let count = 0;

  let out = original.replace(GROUP, (_all, index, groupName, body, accessors) => {
    count++;
    const bundle = `group${index}_${groupName}`;
    const rewritten = [...accessors.matchAll(ACCESSOR)]
      .map(([, isDefault, makeName, member]) => {
        const line = `export const ${makeName} = (api: ContentApi) => ${bundle}(api).${member};`;
        return isDefault ? `${line}\nexport default ${makeName};` : line;
      })
      .join('\n');
    return `const ${bundle} = packClass((api: ContentApi) => {\n${body}\n});\n${rewritten}\n`;
  });

  if (count === 0) continue;
  groups += count;
  touchedFiles.push(name);

  // Any import from that module counts, not this exact string: the previous
  // migration left some files with `import { packClass, type Instance }`, and
  // a literal-string check added a second import beside it. Third time in this
  // pass that matching a *spelling* rather than the thing itself went wrong.
  if (!/^import \{[^}]*\} from '\.\.\/packClass';$/m.test(out)) {
    const anchor = /^import type \{ ContentApi \} from '@moba2d\/core\/content\/ContentApi';$/m;
    out = anchor.test(out)
      ? out.replace(anchor, match => `${match}\n${PACK_CLASS_IMPORT}`)
      : `${PACK_CLASS_IMPORT}\n${out}`;
  }

  const survivors = out.replace(/\/\*[\s\S]*?\*\//g, '').match(/__group\d+_/g);
  if (survivors) {
    console.error(`\n  ${name}: ${survivors.length} __group reference(s) left. Nothing written.\n`);
    process.exit(1);
  }

  if (write) writeFileSync(path, out);
}

console.log(
  `${write ? 'rewrote' : 'would rewrite'} ${groups} group(s) in ${touchedFiles.length} file(s): ` +
    touchedFiles.join(', ')
);
