/**
 * Writes `dist/manifest.json` — the file core fetches *before* it runs any
 * of this pack's code.
 *
 * `coreRange` comes from the declared dependency rather than from a literal
 * in this file: a literal is a second place to remember to change, and the
 * only failure it can produce is the silent kind, where a pack claims
 * compatibility it no longer has.
 *
 * `champions` does NOT come from `generated/spellCatalog.json` — this pack
 * generates no such file (only `generated/spellCatalog.ts`; `catalog.
 * config.mjs`'s `outputPath` names the `.ts` form and nothing here ever
 * writes JSON). Instead this reads it the way `tests/catalogCompleteness.
 * test.ts` already does: off the built pack's own `data.champions`. It
 * reads the *built* `dist/pack.js` rather than importing `../pack.ts`
 * directly, because this script is plain Node (no TS loader) and by the
 * time it runs (`build` is `vite build && node scripts/write-manifest.mjs`)
 * that file already exists as plain ESM. `data` is inert data — no
 * `ContentApi` is constructed to read it, unlike the code half.
 *
 * `data.champions` also holds two rows that are not champions at all:
 * `'Đánh Thường'` (the bare basic attack, its own shelf so a player can find
 * slot 0 again) and `'Phép Bổ Trợ'` (the summoner-spell shelf) — see
 * `data.ts`'s own `championEntries()`. Both come back with `playable:
 * false` from that same function, which is the field it computes for
 * exactly this reason, so filtering on it is that function's own test for
 * "a real champion", not one invented here.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dist = join(root, 'dist');

const coreSpec = pkg.devDependencies?.['@moba2d/core'] ?? pkg.dependencies?.['@moba2d/core'];
if (!coreSpec) {
  throw new Error('package.json declares no @moba2d/core dependency to derive coreRange from');
}

// A git dependency carries no version, so the range is the floor this pack
// was authored against. Bump it deliberately when core's contract changes.
const coreRange = '>=1.0.0';

const { data } = await import(pathToFileURL(join(dist, 'pack.js')).href);
const championCount = data.champions.filter(champion => champion.playable).length;

writeFileSync(
  join(dist, 'manifest.json'),
  JSON.stringify(
    {
      id: 'riot',
      version: pkg.version,
      coreRange,
      name: 'Riot champions',
      entry: 'pack.js',
      assets: 'assets/',
      champions: championCount,
    },
    null,
    2
  ) + '\n'
);

const chunks = readdirSync(join(dist, 'chunks')).filter(f => f.endsWith('.js')).length;
console.log(`manifest written: riot@${pkg.version}, ${championCount} champions, ${chunks} chunks`);
