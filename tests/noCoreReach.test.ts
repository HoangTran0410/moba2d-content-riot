import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  checkPackCoreBoundary,
  scanImports,
  scannedSeamFiles,
  stripComments,
} from '@moba2d/core/seams';

/**
 * Closes the class of mistake Task 5 spent its whole budget fixing by hand:
 * a pack test reaching core through a relative path (`../../../../src/...`)
 * or a `vi.mock()` on a core module string. Both resolve to nothing the day
 * `packs/riot/` is a repository of its own — the relative path has no `src/`
 * left to climb into, and `vi.mock()` needs a resolvable specifier to
 * intercept, which a departed pack's own `node_modules` will never have for
 * a bare `../../../../src/...` string.
 *
 * ## Two halves, and the second is the one that matters
 *
 * `scanImports` (`@moba2d/core/seams`, formerly `tests/support/importScan.ts`
 * — moved to `src/seams/` in a fix round of batch 5 task 6, once a pack's own
 * `check-seams` needed the same parser for `pack-core-boundary`, so it had to
 * ship inside `@moba2d/core` rather than live only in this checkout's own
 * `tests/`) answers the import half. It cannot see a `vi.mock()` call at
 * all — that is not import syntax, it is an ordinary function call whose
 * first argument happens to be a module specifier — and that blind spot is
 * exactly how 48 `vi.mock('.../src/managers/AssetManager', ...)` calls sat
 * unnoticed in this tree until Task 5 went looking by hand. The `vi.mock`
 * half below is matched textually, after `stripComments`, for that reason.
 *
 * ## This file's own necessary exception
 *
 * The walk below counts every `.ts` file under this pack's own `tests/`,
 * including this one — a scan of its own directory cannot help but see
 * itself, and excluding it from the *population* count would be exactly the
 * kind of silent self-exemption `srcTree.ts`'s own header warns against. But
 * this file needs `scanImports`/`stripComments` to do its job, and the only
 * place they are published is `@moba2d/core/seams` — not one of the three
 * subpaths a pack's own test is otherwise held to. That is not a hole in the
 * rule; it is the same shape `pack-core-boundary`'s own checker
 * (`src/seams/packCoreBoundary.ts`) takes: the code that enforces a boundary
 * is not itself a resident of the tree the boundary applies to. `SELF_ALLOWED`
 * is the one narrow, named exemption that follows from that — checked
 * against `__filename` alone, so a future edit to this file that reaches for
 * some *other* unpublished core specifier is still caught.
 *
 * ## The one proven false positive
 *
 * `scanImports`'s own header states its checked trees as `src/**` and
 * `packs/**` — this pack's own `tests/**` was never checked before this file
 * existed, and `generate-assets.test.ts` is exactly the gap: it tests a code
 * generator by asserting on the literal *string content* of its generated
 * output, two of which —
 * `'export const assetManifest = {'` and
 * `"from '../assets/images/champions/janna.png?url'"` — together read
 * exactly like a real `export ... from '...'` statement to a parser with no
 * notion of "these are two separate quoted strings, not one statement
 * spanning both". Confirmed by hand: that file has no other core-adjacent
 * import at all, and the flagged text is real generated output the test must
 * match byte-for-byte, so it cannot be reworded to dodge the parser without
 * weakening what the test proves. Named here, once, as `KNOWN_FALSE_POSITIVES`
 * — the same shape `corePacksBoundary.test.ts`'s own `EXEMPT_FILES` takes —
 * rather than silently loosening the rule for every file.
 *
 * ## The escape rule, restated after the move
 *
 * Content-pack-extraction batch 6 task 6 moved this file (and the 69
 * alongside it) from `tests/packs/riot/` into this pack's own `tests/`, so
 * "resolves outside packs/riot/ and outside tests/packs/riot/" stopped
 * meaning anything the moment the second half named a directory that no
 * longer exists — both halves are the same tree now. `PACK_ROOT` is the
 * single boundary a relative specifier may not cross; there is no second
 * root to keep in sync with it.
 */
const PACK_ROOT = resolve(__dirname, '..');
const TESTS_DIR = __dirname;
const SELF = __filename;

const ALLOWED_CORE_SUBPATHS = new Set([
  '@moba2d/core/content/types',
  '@moba2d/core/testing',
  '@moba2d/core/testing/spell',
  '@moba2d/core/testing/spells',
  // The shared shop rules. Published on its own subpath, out of the `./testing`
  // barrel, for the reason `./testing/spells` is: `export *` evaluates the
  // whole module and this one value-imports core's `Item` and `Stats` for the
  // two constants (`INVENTORY_SIZE`, `MAX_COOLDOWN_REDUCTION`) it refuses to
  // let a pack copy.
  '@moba2d/core/testing/items',
  // The shared map rules, published the same way and for the same reason. The
  // implementation is the map editor's own plain JavaScript
  // (`public/map-editor/js/mapRules.js`) and the only other caller is that
  // editor, so what a pack gets here is literally the check the tool it draws
  // maps in already ran — which is the whole point: this gate and that tool
  // cannot disagree about whether a map is shippable.
  //
  // Not `@moba2d/core/seams`, where the same functions are also published.
  // That barrel carries core's source scanners and its own boundary checker,
  // and a pack has no business reaching into either; `tests/maps/*.test.ts`
  // imported it for one commit and this rule was right to refuse.
  '@moba2d/core/testing/maps',
  // The two build helpers core ships for packs: the asset-manifest generator
  // (this pack used to carry its own copy) and the WebP re-encode plugin.
  // Neither is ever part of `pack.js` — one is a bin plus the module behind
  // it, the other a Vite plugin — so neither can become the bare unresolvable
  // specifier this scan exists to catch.
  '@moba2d/core/pack-assets',
  '@moba2d/core/pack-webp',
]);

/** This file's own, and only this file's, licence to import the scan machinery itself. */
const SELF_ALLOWED = new Set(['@moba2d/core/seams']);

const KNOWN_FALSE_POSITIVES = new Set([
  'generate-assets.test.ts::../assets/images/champions/janna.png?url',
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Whether `child` resolves inside `parent`. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function labelFor(absFile: string): string {
  return relative(TESTS_DIR, absFile).split(sep).join('/');
}

function checkSpecifier(
  specifier: string,
  fileDir: string,
  label: string,
  extraAllowed: Set<string>
): string | null {
  if (specifier === 'vitest' || specifier.startsWith('node:')) return null;

  if (specifier.startsWith('@/') || specifier.startsWith('src/')) {
    return `${label}: "${specifier}" starts with @/ or src/`;
  }

  if (specifier.startsWith('.')) {
    const resolved = resolve(fileDir, specifier);
    if (isInside(PACK_ROOT, resolved)) return null;
    if (KNOWN_FALSE_POSITIVES.has(`${label}::${specifier}`)) return null;
    return `${label}: "${specifier}" resolves outside the pack root`;
  }

  if (specifier.startsWith('@moba2d/core')) {
    if (ALLOWED_CORE_SUBPATHS.has(specifier) || extraAllowed.has(specifier)) return null;
    return `${label}: "${specifier}" is not one of ${[...ALLOWED_CORE_SUBPATHS].join(', ')}`;
  }

  return null;
}

function checkFile(absFile: string): string[] {
  const source = readFileSync(absFile, 'utf8');
  const fileDir = dirname(absFile);
  const label = labelFor(absFile);
  const extraAllowed = absFile === SELF ? SELF_ALLOWED : new Set<string>();
  const offenders: string[] = [];

  for (const { specifier } of scanImports(source)) {
    const offense = checkSpecifier(specifier, fileDir, label, extraAllowed);
    if (offense) offenders.push(offense);
  }

  // vi.mock() is an ordinary call, invisible to scanImports — matched
  // textually instead, after the same stripComments every other seam in
  // this codebase strips with first.
  const stripped = stripComments(source);
  for (const match of stripped.matchAll(/\bvi\.mock\(\s*(['"])([^'"]+)\1/g)) {
    const specifier = match[2];
    const offense = checkSpecifier(specifier, fileDir, label, extraAllowed);
    if (offense) offenders.push(offense.replace('"' + specifier + '"', `vi.mock("${specifier}")`));
  }

  return offenders;
}

describe("the pack's tests speak only published core surfaces", () => {
  const files = walk(TESTS_DIR);

  it('finds files to scan, or this proves nothing', () => {
    // 69 pack test files, the population this task's own invariant is
    // measured against, plus this scan file itself — a walk of its own
    // directory cannot help but count itself. 71, not 69: see this file's
    // own header for why counting it here and exempting it from the checks
    // below are two different questions with two different answers. The
    // extra one beyond that 70 is `support/packRoot.ts`, added when
    // `ahri-palette.test.ts` and `generate-assets.test.ts` stopped climbing
    // a hardcoded `packs/riot` and started deriving their root instead.
    //
    // 73, not 71, as of content-pack-and-repo-split batch 6 task 10:
    // `tests/wiki/import-abilities.test.ts` and `tests/wiki/lua-data.test.ts`
    // arrived with `scripts/wiki/` when it left `@moba2d/core` and became
    // this pack's own — two more `.ts` files under this same walk, neither
    // reaching core at all (both import only `node:*` builtins and this
    // pack's own `../../scripts/wiki/*.mjs`), so the population count moves
    // and the offender count below does not.
    //
    // 74, not 73, from the same task's fix round 1: `tests/Pet.test.ts`
    // arrived from `@moba2d/core`'s own suite — the four describe blocks
    // there that are a fact about this pack's own spells (Shaco W, Jinx E,
    // Annie R), not about the engine's `Pet` class in general, which stayed
    // in core's suite instead.
    //
    // 75, not 74, same fix round: `tests/representative-spells.test.ts`
    // arrived the same way — a fact about seven of this pack's own spells'
    // activation-pattern declarations, not about `SpellRuntime` in general
    // (already covered, exhaustively, by core's own
    // `tests/game/spell/SpellRuntime.test.ts`).
    //
    // 76, not 75, fix round 2: `tests/catalogCompleteness.test.ts` is the
    // catalogue-completeness audit half of core's own
    // `tests/game/preset.catalog.test.ts` — a question about whatever
    // content is installed, reformulated against this pack's own
    // data.ts/code.ts/generated/spellCatalog.ts rather than core's
    // unpublished listSpellCatalog()/spellGroups().
    //
    // 77, not 76, runtime-pack-loading Task 2: `tests/build/
    // runtimeBundle.test.ts` arrived with the build that gives this pack a
    // loadable `dist/` a browser can `import()`. It asserts on that built
    // directory alone — `node:fs`, `node:path`, `vitest` — and reaches core
    // not at all, so the population count moves and the offender count
    // below does not.
    //
    // Still 78: `tests/packClassSeam.test.ts` — which banned a hand-rolled
    // per-api memo — is replaced one-for-one by `tests/dataHalf.test.ts`.
    // There is no memo left to ban: a spell is an ordinary class now, and the
    // rule that took its place is that the data half must not statically
    // import one. Both read `node:fs`/`node:path` and reach core not at all.
    //
    // 79, not 78, pack pinning: `tests/buildId.test.ts` checks the value core
    // hangs off the entry URL so that two builds are two URLs — the fix for a
    // republished pack whose old chunk graph 404'd and turned a champion's
    // ability into a basic attack in silence. It reads this pack's own
    // `dist/manifest.json` through `node:fs`/`node:crypto` — the writer
    // itself is core's `moba2d-write-manifest` now — and reaches core not at
    // all, so the population
    // count moves and the offender count below does not.
    //
    // 81, not 79, the shop: `tests/items.test.ts` and
    // `tests/spells/Item_actives.test.ts` arrived with this pack's item set.
    // Both reach core only through `@moba2d/core/testing`,
    // `@moba2d/core/testing/spell` and `@moba2d/core/content/types` — all
    // three already on `ALLOWED_CORE_SUBPATHS` — so the population count
    // moves and the offender count below does not.
    //
    // 82, not 81, Yasuo's combo: `tests/spells/Yasuo_Q.test.ts` pins the Q
    // stack machine after a tornado spent it. It reaches core only through
    // `@moba2d/core/testing` and `@moba2d/core/testing/spell`, both already
    // on `ALLOWED_CORE_SUBPATHS`, so the population count moves and the
    // offender count below does not.
    //
    // 83, not 82, the on-hit shelf: `tests/onHitItems.test.ts` drives the
    // fifteen on-hit item passives through `api.combat.applyOnHitEffects`.
    // It reaches core only through `@moba2d/core/testing`,
    // `@moba2d/core/testing/spell` and `@moba2d/core/content/types` — all
    // three already on `ALLOWED_CORE_SUBPATHS`, so the population count
    // moves and the offender count below does not.
    //
    // 84, not 83, the jungle blessings: `tests/monsters/JungleBuffs.test.ts`
    // drives `MonsterAbility.onKilled` for the two buff camps and Baron. It
    // reaches core only through `@moba2d/core/testing`,
    // `@moba2d/core/testing/spell` and `@moba2d/core/content/types` — all
    // three already on `ALLOWED_CORE_SUBPATHS`, so the population count moves
    // and the offender count below does not.
    //
    // 90, not 84, the batch that added five champions and five items:
    // `tests/spells/Item_charges.test.ts` drives the two new meter passives,
    // and `Shen`/`Lissandra`/`Pyke`/`Orianna`/`TwistedFate` bring one suite
    // each. All six reach core only through `@moba2d/core/testing`,
    // `@moba2d/core/testing/spell` and `@moba2d/core/content/types` — all
    // three already on `ALLOWED_CORE_SUBPATHS`, so the population count moves
    // and the offender count below does not.
    //
    // 91, not 90: `tests/damageAttribution.test.ts`, which proves this pack's
    // damage still reaches the death recap under the ability's name now that
    // core infers it rather than each `takeDamage` call passing it. It reaches
    // core through the same three allowed subpaths, so again the population
    // moves and the offender count does not.
    //
    // 92, not 91: `tests/abilityScaling.test.ts`, which proves an item bought
    // in this pack's shop makes this pack's abilities hit harder — the other
    // end of `items.test.ts`'s table read. Same three allowed subpaths, so the
    // population moves and the offender count does not.
    //
    // 93, not 92: `tests/roleProfiles.test.ts`, which holds this pack's role
    // table to the durability spread it was tuned to. It reads `../data` and
    // core not at all, so it moves the population and nothing else.
    //
    // 94, not 93: `tests/balanceReport.test.ts`, the gold-for-gold comparison
    // of the shop's attack and ability paths. It reads `../pack` and core not
    // at all, so it moves the population and nothing else.
    //
    // 95, not 94: `tests/maps/twistedTreeline.test.ts`, the traced map's own
    // suite. It reaches core through `@moba2d/core/testing` and
    // `@moba2d/core/content/types`, both already allowed, so the population
    // moves and the offender count does not.
    //
    // 96, not 95: `tests/monsters/NewCamps.test.ts`, the four camps added on
    // top of Baron and the two buff pits.
    //
    // 97, not 96: `tests/monsters/campPower.test.ts`, which builds each camp
    // as a real `Monster` and measures what it actually hits for rather than
    // reading a table core may not use.
    //
    // 98, not 97: `tests/monsters/DragonKit.test.ts`, the wingbeat and the
    // four elemental rites. All three reach core through
    // `@moba2d/core/testing` and `/testing/spell`, both already allowed, so
    // the population moves and the offender count does not.
    //
    // 99, not 98: `tests/spellDescriptionTags.test.ts`, which scans every
    // shipped description for a damage span core would rescale wrongly. It
    // reads `../generated/spellCatalog` and core not at all, so it moves the
    // population and nothing else.
    //
    // 100, not 99: `tests/monsterArt.test.ts`, the drake portraits' own
    // provenance ledger re-hashed offline. It reads `node:crypto`, `node:fs`
    // and `../generated/assetManifest` — the same shape of import as the one
    // above, and core not at all.
    //
    // 101, not 100: `tests/maps/mapRules.test.ts`, which runs core's own map
    // rules against every map this pack ships. It reaches core through
    // `@moba2d/core/testing/maps` and `@moba2d/core/content/types`, both
    // allowed, so the population moves and the offender count does not.
    //
    // 102, not 101: `tests/monsters/bossParity.test.ts`, which adds Baron's
    // and Vilemaw's kits up and holds them to each other. It reaches core
    // through `@moba2d/core/testing` and `@moba2d/core/testing/spell`, the
    // same two every other monster test here uses.
    //
    // 103, not 102: `tests/spells/damageTypeClaims.test.ts`, which checks that
    // a spell promising "sát thương chuẩn" deals it. It reads this pack's own
    // source as text and imports nothing from core at all, so it adds to the
    // population and to no other count here.
    //
    // 114, not 113: `tests/spells/Janna_R.camp.test.ts` — Monsoon against a
    // real camp, kept out of `Janna_R.test.ts` because that file mocks the VFX
    // surface and this one wants a plain world.
    //
    // 113, not 112: `tests/spells/recordParity.test.ts`, the one place that
    // checks an ability against the wiki record it was imported from. Same two
    // published surfaces as every other spell test here.
    //
    // 112, not 111: `tests/spells/Item_capstones.test.ts`, which drives Mũ
    // Phù Thủy Rabadon, Móng Vuốt Sterak and Tim Băng. Same two published
    // surfaces as every other spell test here.
    //
    // 111, not 110: `tests/spells/Item_wounds.test.ts`, which drives the three
    // Vết Thương Sâu passives. It reaches core through `@moba2d/core/testing`
    // and `@moba2d/core/testing/spell` like every other spell test here, and
    // names `api.buffs.HealCut` — core's own published surface, not a reach.
    //
    // 110, not 109: `tests/spells/Olaf_R.test.ts` — the ultimate that was
    // invisible for the seven seconds it lasted.
    //
    // 109, not 108: `tests/spells/Pantheon_E.test.ts` — the aegis that was a
    // 60-point pool and is now the directional wall the ability describes.
    //
    // 108, not 106: `tests/spells/Heal.test.ts` and
    // `tests/spells/LeeSin_W.test.ts` — the summoner spell that healed only
    // its caster, and the Iron Will that paid a drip instead of omnivamp.
    //
    // 106, not 105: `tests/spells/Morgana_E.test.ts`, which pins Black Shield
    // to magic damage only — the ability that asked core for `Shield.absorbs`.
    //
    // 105, not 104: `tests/spellNumberFormat.test.ts`, which scans every
    // rendered description for a floating-point tail — the bug that had
    // Lissandra Q advertising a 28.000000004% slow.
    //
    // 104, not 103: `tests/buffDescriptions.test.ts`, which checks that a buff
    // this pack invents says what it does. Like the one above it, it reads this
    // pack's own source as text and imports nothing from core.
    expect(files.length).toBe(116);
  });

  it('reaches core only through @moba2d/core/content/types, /testing, /testing/spell, or /testing/spells', () => {
    const offenders = files.flatMap(checkFile);
    expect(offenders).toEqual([]);
  });
});

/**
 * **The `@/...` half, which TypeScript structurally cannot see.**
 *
 * A pack reaches core through the injected `ContentApi` and core's declared
 * subpaths, and nowhere else — but this pack's `tsconfig.json` must publish
 * core's own `@/*` alias, because core ships as *unbundled source* and every
 * one of its exported entry points imports its neighbours that way (there are
 * seventy-two such imports in `ContentApi.ts` alone). `paths` is a
 * program-wide mapping with no notion of which file is asking, so an alias
 * that has to resolve for core's files resolves for this pack's files too.
 * Measured rather than assumed: with
 * `import BuffAddType from '@/game/enums/BuffAddType'` planted in a spell,
 * `npm run typecheck` exits 0 and the editor underlines nothing.
 *
 * `check-seams` does catch it — `pack-core-boundary` is exactly this rule —
 * but that is not the command anyone runs while writing a spell, so the first
 * time you hear about it is the gate. This runs the engine's own checker over
 * the whole package so `npm test` says it too, in the seconds after typing it.
 *
 * Calling core's checker rather than re-deriving the rule is the point: a
 * second implementation here would be a second thing to keep in step, and the
 * one it drifted from is the one CI believes.
 */
describe('no file in this pack names a core internal', () => {
  /**
   * Counted through the engine's own walker, not this file's. The local
   * `walk()` above is written for `tests/` and follows every directory it
   * finds — pointed at the package root it descends the `@moba2d/core` <->
   * `@moba2d/content-lol` workspace symlink loop until the path is too long
   * for `stat`. `walkTsFiles` skips `node_modules` and does not follow a
   * symlinked directory, which is the reason the seam machinery has a walker
   * of its own.
   */
  it('has files to check, or this case proves nothing', () => {
    expect(scannedSeamFiles(PACK_ROOT).length).toBeGreaterThan(100);
  });

  it('reaches core only through the api and core’s declared subpaths', () => {
    const violations = checkPackCoreBoundary(PACK_ROOT);
    const report = violations.map(v => `${v.file}: ${v.message}`).join('\n');
    expect(report, report).toBe('');
  });
});
