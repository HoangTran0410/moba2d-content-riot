#!/usr/bin/env node
/**
 * Replaces the last hand-derived type aliases with imports.
 *
 * `node scripts/migrations/2026-08-25-import-core-types.mjs [--write]`
 *
 * Two shapes are left in `spells/` once the dead ones are gone, and each has
 * a shorter spelling now:
 *
 *   type AttackableUnit = InstanceType<ContentApi['units']['AttackableUnit']>;
 *     -> import type { AttackableUnit } from '@moba2d/core/content/types';
 *
 *   type Vi_W_Buff = InstanceType<ReturnType<typeof makeVi_W_Buff>>;
 *     -> type Vi_W_Buff = Instance<typeof makeVi_W_Buff>;
 *
 * The first is a real deletion: core now publishes the instance type of every
 * class `api` hands out, so the derivation belongs there once instead of here
 * 221 times. The second cannot be — `packClass` returns a factory and only
 * this pack knows what it builds — so it gets the two-unwrapping helper
 * `Instance` from `../packClass` and stays one line.
 *
 * ## Names, not positions
 *
 * A pack is free to alias: `type RootBuff = InstanceType<ContentApi['buffs']
 * ['Root']>` names core's `Root` as `RootBuff` because the file also has its
 * own `Root`. So the import is emitted as `Root as RootBuff` when the local
 * name and the core name differ, never as a rename of the usage sites.
 *
 * ## What it refuses
 *
 * Only the two exact shapes, and only where the core path resolves to a
 * published name. Anything else — a hand-written alias, a member this
 * migration has no mapping for — is left in place and reported, because a
 * wrong mapping here is a type that silently becomes `never`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const spellsDir = join(root, 'spells');
const write = process.argv.includes('--write');

const CORE_TYPES = "@moba2d/core/content/types";

/** `type Local = InstanceType<ContentApi['a']['b']>;` */
const CORE_ALIAS = /^type (\w+) = InstanceType<ContentApi((?:\['\w+'\])+)>;$/;
/** `type Local = InstanceType<ReturnType<typeof makeX>>;` */
const LOCAL_ALIAS = /^type (\w+) = InstanceType<ReturnType<typeof (\w+)>>;$/;

/** The last segment of `['units']['AttackableUnit']` is the published name. */
function publishedName(path) {
  const segments = [...path.matchAll(/\['(\w+)'\]/g)].map(m => m[1]);
  return segments[segments.length - 1] ?? null;
}

const published = new Set(
  [
    ...readFileSync(
      join(root, 'node_modules/@moba2d/core/src/content/types.ts'),
      'utf8'
    ).matchAll(/^export type (\w+) = InstanceType<ContentApi\[/gm),
  ].map(m => m[1])
);

if (published.size === 0) {
  console.error('\n  core publishes no instance types — is @moba2d/core up to date?\n');
  process.exit(1);
}

let coreReplaced = 0;
let localReplaced = 0;
let touched = 0;
const refused = [];

for (const name of readdirSync(spellsDir).filter(f => f.endsWith('.ts')).sort()) {
  const path = join(spellsDir, name);
  const source = readFileSync(path, 'utf8');
  const lines = source.split('\n');

  const imports = [];
  const kept = [];
  let changed = false;

  for (const line of lines) {
    const core = CORE_ALIAS.exec(line.trim());
    if (core) {
      const [, local, memberPath] = core;
      const coreName = publishedName(memberPath);
      if (coreName && published.has(coreName)) {
        imports.push(coreName === local ? local : `${coreName} as ${local}`);
        coreReplaced++;
        changed = true;
        continue;
      }
      refused.push(`${name}: ${line.trim()}`);
      kept.push(line);
      continue;
    }

    const local = LOCAL_ALIAS.exec(line.trim());
    if (local) {
      kept.push(`type ${local[1]} = Instance<typeof ${local[2]}>;`);
      localReplaced++;
      changed = true;
      continue;
    }

    kept.push(line);
  }

  if (!changed) continue;
  touched++;

  let out = kept.join('\n');

  if (imports.length > 0) {
    imports.sort((a, b) => a.localeCompare(b));
    const existing = new RegExp(`^import type \\{([^}]*)\\} from '${CORE_TYPES}';$`, 'm');
    const found = existing.exec(out);
    if (found) {
      // Fold into the import this file already has, rather than adding a
      // second one from the same module.
      const already = found[1]
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
      const merged = [...new Set([...already, ...imports])].sort((a, b) => a.localeCompare(b));
      out = out.replace(found[0], `import type { ${merged.join(', ')} } from '${CORE_TYPES}';`);
    } else {
      const line = `import type { ${imports.join(', ')} } from '${CORE_TYPES}';`;
      const anchor = /^import type \{ ContentApi \} from '@moba2d\/core\/content\/ContentApi';$/m;
      out = anchor.test(out)
        ? out.replace(anchor, match => `${match}\n${line}`)
        : `${line}\n${out}`;
    }
  }

  if (localReplaced > 0 && /^type \w+ = Instance<typeof /m.test(out)) {
    // `Instance` rides on the same module `packClass` already comes from.
    out = out.replace(
      /^import \{ packClass \} from '\.\.\/packClass';$/m,
      "import { packClass, type Instance } from '../packClass';"
    );
  }

  if (write) writeFileSync(path, out);
}

console.log(
  `${write ? 'rewrote' : 'would rewrite'} ${touched} file(s): ` +
    `${coreReplaced} core alias(es) -> imports, ${localReplaced} local alias(es) -> Instance<>`
);

if (refused.length > 0) {
  console.error(`\n  ${refused.length} alias(es) left alone — no published name:\n`);
  for (const line of refused.slice(0, 20)) console.error(`    ${line}`);
  process.exitCode = 1;
}
