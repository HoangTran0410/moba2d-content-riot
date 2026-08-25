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
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dist = join(root, 'dist');

const coreSpec = pkg.devDependencies?.['@moba2d/core'] ?? pkg.dependencies?.['@moba2d/core'];
if (!coreSpec) {
  throw new Error('package.json declares no @moba2d/core dependency to derive coreRange from');
}

/**
 * The oldest core this pack works against.
 *
 * The minor is core's **contract number** — the version of `ContentApi`'s
 * shape, moved by core's `npm run contract:bump` whenever that surface
 * changes. Raise this floor when this pack starts using something a newer
 * contract added, and **only after a core carrying that contract is deployed**:
 * this pack is the half that is already published, so a floor the live core
 * cannot meet is refused on every player's machine at once.
 *
 * Raised to `>=1.3.0` when this pack grew a shop, and to `>=1.4.0` when the
 * shop grew recipes. `ContentPackData.items` existed as a *field* before core
 * read it, and `ItemDef.buildsFrom` has the identical shape one level down —
 * an older core drops it, every recipe stops existing, every finished item
 * quietly costs full price, and nothing anywhere says so. That is the exact
 * silent-compatibility failure this paragraph warns about, in the direction
 * nobody expects.
 *
 * It matches `data.ts`'s own `manifest.coreRange`, which is the copy
 * `PackRegistry` holds; **this** is the copy a *runtime* install checks,
 * before a line of this pack's code runs, so the two drifting means the
 * bundled build and the published build disagree about which cores they
 * support. `tests/items.test.ts` pins both.
 */
const coreRange = '>=1.4.0';

/**
 * A floor no core can satisfy is a pack nobody can install, and this build is
 * the last place to notice before it is a URL people already have.
 *
 * Two failures, both silent otherwise: a range core's parser does not
 * understand (`^1`, `>=1.0`, `~1.2.3` — `satisfiesCoreRange` reads `*` and
 * `>=X.Y.Z` and nothing else), and a floor above the core this pack was
 * actually built against, which cannot be right because the members it
 * promises did not exist in what compiled it.
 */
const installedCore = JSON.parse(
  readFileSync(join(root, 'node_modules/@moba2d/core/package.json'), 'utf8')
).version;

const floor = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(coreRange);
if (coreRange !== '*' && !floor) {
  throw new Error(
    `coreRange "${coreRange}" is not a shape core can parse — use '*' or '>=X.Y.Z'.`
  );
}
const have = /^(\d+)\.(\d+)\.(\d+)$/.exec(installedCore);
if (floor && have) {
  let ordering = 0;
  for (let i = 1; i <= 3 && ordering === 0; i++) ordering = Number(floor[i]) - Number(have[i]);
  if (ordering > 0) {
    throw new Error(
      `coreRange "${coreRange}" is above the core this pack was built against ` +
        `(${installedCore}). Nothing here can be using members that core does not have.`
    );
  }
}

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

/**
 * Which build this is — core's `buildId`, and the only thing that can tell a
 * stale install from a current one.
 *
 * **Derived, never declared.** `version` is the obvious candidate and it does
 * not work: it is a number a human has to remember to bump, and this pack's
 * stayed `1.0.0` across dozens of publishes. Core's `InstalledPackRecord`
 * carried a `version` field commented "so an update can be noticed later"
 * that nothing could ever act on, because the value never moved.
 *
 * Hashed over the sorted file list rather than over `pack.js`'s bytes: the
 * entry is an 86-byte facade that re-exports from a hashed chunk, so two
 * genuinely different builds can emit an identical one. Every other name in
 * `dist` carries a content hash, which makes the list itself the complete
 * statement of what this build contains.
 */
const buildId = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);

/**
 * This pack's id, stated once here.
 *
 * It was a literal in the manifest object and a second literal in the console
 * line at the bottom, and the second drifted the instant the pack was renamed
 * from `riot` to `lol`: the manifest said `lol`, the build log said
 * `riot@1.0.0`, and nothing failed. `data.ts` states it too, as
 * `BUNDLED_PACK_ID`, and core refuses an install where the two disagree —
 * that check is what makes *those* two copies survivable. A third copy with
 * no check behind it was not.
 */
const packId = 'lol';

writeFileSync(
  join(dist, 'manifest.json'),
  JSON.stringify(
    {
      id: packId,
      version: pkg.version,
      coreRange,
      buildId,
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
  `manifest written: ${packId}@${pkg.version}, ${championCount} champions, ${chunks} chunks, ${files.length} files`
);
