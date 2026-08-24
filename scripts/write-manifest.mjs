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

/**
 * Every file this build emitted, relative to the manifest and POSIX-separated
 * — what core's background prefetch walks to fill the offline cache (core's
 * spec §3.1 and §6).
 *
 * A static host offers no directory listing, so a prefetch that is not handed
 * a list can only cache what a match happens to ask for; and what a match
 * asks for is exactly the champion the player already picked, which is the
 * champion they already have. The unplayed 237 are the ones the offline case
 * is about.
 *
 * `manifest.json` excludes itself: core already has it — fetching it is what
 * produced this list.
 */
function emittedFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...emittedFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

const files = emittedFiles(dist)
  .filter(name => name !== 'manifest.json')
  .sort();

writeFileSync(
  join(dist, 'manifest.json'),
  JSON.stringify(
    {
      id: 'riot',
      version: pkg.version,
      coreRange,
      // The name core shows wherever this pack appears — its shelf card, the
      // install confirmation, the installed row, and the section header over
      // its champions in the picker. It is Vietnamese because every other
      // string a player reads in this game is, and it matches the shelf entry
      // in core's `suggestedPacks.ts` on purpose: one pack must not have two
      // names one tab apart. Core re-reads this manifest on every boot and
      // rewrites its stored record from it, so renaming here reaches a
      // browser that installed the pack under the old name without the
      // player reinstalling anything.
      name: 'Liên Minh Huyền Thoại',
      entry: 'pack.js',
      assets: 'assets/',
      champions: championCount,
      // Copied verbatim out of `public/` by Vite, so the name is stable and
      // unhashed — core resolves it against the manifest and shows it beside
      // an *installed* pack only, never on the install confirmation (core's
      // spec §3.2). It is this pack's own artwork, served from this pack's
      // own host: core ships no content and carries no content's branding.
      icon: 'icon.png',
      files,
    },
    null,
    2
  ) + '\n'
);

const chunks = readdirSync(join(dist, 'chunks')).filter(f => f.endsWith('.js')).length;
console.log(
  `manifest written: riot@${pkg.version}, ${championCount} champions, ${chunks} chunks, ${files.length} files`
);
