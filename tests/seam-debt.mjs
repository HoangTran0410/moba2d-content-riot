/**
 * This pack's own known seam debt for its **test** tree — the same shape,
 * and the same reason, as ./spells/seam-debt.mjs beside it: "the rule lives
 * with the engine, the population lives with the content" (spec §8.1). The
 * CLI discovers this file automatically because it lives *inside* the tree
 * `moba2d-check-seams ./tests` points at.
 *
 * Content-pack-extraction batch 6 task 6 is what first pointed the general
 * thirteen-seam battery at this pack's own tests at all — before this task,
 * these 70 files lived in core's own `tests/packs/riot/` tree and were never
 * scanned by anything but Task 5's own hand-written `noCoreReach.test.ts`.
 * Running the full battery against a **test** tree for the first time
 * surfaced every entry below, mechanically, from the real scan
 * (`node scripts/check-seams.mjs ./tests` from this pack's own directory,
 * before this file existed) — none of it is new debt this task introduced,
 * all of it is debt this task is the first thing to have looked for.
 * Regenerated more than once, after later fixes (typecheck aliases, then
 * this file's own restructuring below) inserted or removed lines above some
 * of these and shifted their own line numbers — a licence issued to a
 * line's *content* is still keyed on its *position* too (`pinnedLineFor`,
 * `src/seams/shared.ts`), so the fix and the debt file were regenerated
 * from the same tree, together, every time.
 *
 * **Every one of the twelve tree-scoped seams carries a genuine per-entry
 * exemption field now.** That was not true through fix round 1 of this
 * task's own review: `stat-resource-modifier` and `unit-target-team` had no
 * field narrow enough to say "this line/file is an assertion about a real
 * spell, not a declaration of one" — `expect(spell.castSpec).toMatchObject({
 * targeting: 'UNIT', ... })` reads exactly like the thing each seam is
 * watching for, from the wrong side — so eleven files sat in a blanket
 * `SKIP` instead. `SKIP` blinds *every* seam that reads it, not only the one
 * or two it was reached for (`walkTsFiles`, `src/seams/shared.ts`, applies
 * `skip` before any seam's own loop runs), and two of those eleven files,
 * `Pantheon_Q.test.ts` and `Varus_Q.test.ts`, carried real
 * `spell-runtime-drive` debt too — genuine `.onChargeUpdate(`/`.onCancel(`
 * calls, previously tracked in core's own hand-written `GRANDFATHERED` set
 * before this task moved them. Putting them in `SKIP` silently turned that
 * *tracked* debt into *untracked* debt, which is the exact invisibility
 * Step 6b of this task exists to catch on a different axis — found in fix
 * round 1's review, and fix round 1's own attempted repair (add both names
 * to `grandfatheredTests` *as well as* `SKIP`) does not work either:
 * `walkTsFiles` filters `skip` out before `checkSpellRuntimeDrive`'s own
 * consumption loop ever runs, so a skipped file's `grandfatheredTests` entry
 * can never be consumed and is unconditionally reported `STALE-EXEMPTION`
 * (checked: `node scripts/check-seams.mjs ./tests` with both names in both
 * sets exits 1, not 0). `skip` is a *precondition* to every other exemption
 * field ever being asked a question, not an independent, stackable licence.
 *
 * Fix round 2 is the real fix, not a documented workaround: `src/seams/
 * statResourceModifier.ts` gained `pinnedResourceLines` (the same
 * per-line, stale-checked shape `manaSpend.ts`'s `pinnedManaLines` already
 * uses — the two seams key their violations identically) and `src/seams/
 * unitTargetTeam.ts` gained `noTargetingRequestOverride` beside its existing
 * `noPressOverride` (**not** the same field — `noPressOverride` only ever
 * gates "UNIT spell has no press()"; `Leblanc_Q.test.ts`'s actual gap is a
 * *different*, previously unexemptable check, "UNIT spell supplies no
 * targetingRequest", which `noPressOverride` is never even consulted for).
 * `SKIP` below is empty as a result — every file that used to sit in it now
 * carries its debt in the field that actually matches what it does, and
 * `spell-runtime-drive`'s own `grandfatheredTests` entries for
 * `Pantheon_Q.test.ts`/`Varus_Q.test.ts` are real again, consumed and
 * verified on every run rather than merely asserted in prose.
 *
 * **The rule going forward:** before reaching for `SKIP`, check whether the
 * seam that actually needs to ignore this file has (or can cheaply be given)
 * its own exemption field — `SKIP` is for a file that is not spell-shaped
 * code at all (a barrel, a scaffolding template, `./spells/seam-debt.mjs`'s
 * own `SKIP` is exactly that), not a shortcut for "I don't want to build the
 * field this one violation actually needs."
 */

/**
 * `mana-spend`: every one of these initializes or reads a plain test
 * double's `.mana.baseValue`/`.mana.value` to set up or assert a fixture's starting
 * resource pool — never a spell billing a real cast against
 * `Spell.spendMana()`'s URF-aware seam. The rule this seam enforces
 * (`Spell.effectiveMana()`/`spendMana()` as the only sanctioned path) has no
 * meaning for a test harness constructing the world a spell is about to be
 * dropped into.
 */
const PINNED_MANA_LINES = new Set([
  // Content-pack-and-repo-split batch 6 task 10, fix round 1:
  // `representative-spells.test.ts` moved here from core's own suite. Every
  // one of these reads or seeds a synthetic fixture owner's starting/ending
  // mana pool to assert the *runtime's* commit-point rule (mana debited at
  // press vs release, depending on activation pattern) — never a spell
  // billing a real cast through `Spell.spendMana()`. Same shape as every
  // other entry in this set, just never scanned before this file existed
  // in a pack's own tree.
  "representative-spells.test.ts:x1:expect(luxOwner.stats.mana.value).toBe(200 - luxR.manaCost);",
  "representative-spells.test.ts:x1:expect(jannaROwner.stats.mana.value).toBe(200 - jannaR.manaCost);",
  "representative-spells.test.ts:x1:expect(jannaQOwner.stats.mana.value).toBe(200 - jannaQ.manaCost);",
  "representative-spells.test.ts:x2:expect(aniviaOwner.stats.mana.value).toBe(200 - aniviaR.manaCost);",
  "representative-spells.test.ts:x1:expect(varusOwner.stats.mana.value).toBe(200 - varusQ.manaCost);",
  "representative-spells.test.ts:x1:expect(tapOwner.stats.mana.value).toBe(200 - tapQ.manaCost);",
  "representative-spells.test.ts:x1:expect(holdOwner.stats.mana.value).toBe(200 - holdQ.manaCost);",
  "representative-spells.test.ts:x1:owner.stats.mana.baseValue = 200;",
  "representative-spells.test.ts:x2:expect(owner.stats.mana.value).toBe(200);",
  "representative-spells.test.ts:x1:expect(owner.stats.mana.value).toBe(200 - spell.manaCost);",
  "spells/Anivia_E.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Anivia_R.test.ts:x2:const startingMana = owner.stats.mana.value;",
  "spells/Anivia_R.test.ts:x2:expect(owner.stats.mana.value).toBe(startingMana - MANA_COST);",
  "spells/Anivia_R.test.ts:x1:expect(owner.stats.mana.value).toBe(startingMana - MANA_COST - UPKEEP_COST);",
  "spells/Anivia_R.test.ts:x2:expect(owner.stats.mana.value).toBe(startingMana);",
  "spells/Anivia_R.test.ts:x1:owner.stats.mana.baseValue = 0;",
  "spells/Anivia_W.test.ts:x1:unit.stats.mana.baseValue = 100;",
  "spells/Annie_QE.test.ts:x1:unit.stats.mana.baseValue = 500;",
  "spells/Brand.test.ts:x1:result.stats.mana.baseValue = 300;",
  "spells/Caitlyn.test.ts:x1:result.stats.mana.baseValue = 200;",
  "spells/Camille.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Diana.test.ts:x1:result.stats.mana.baseValue = 500;",
  "spells/Ekko.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Ezreal.test.ts:x2:owner.stats.mana.baseValue = 10;",
  "spells/Ezreal.test.ts:x1:expect(owner.stats.mana.value).toBe(10);",
  "spells/Ezreal.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Ezreal.test.ts:x1:expect(owner.stats.mana.value).toBe(10 + EZREAL_W_MANA_REFUND);",
  "spells/Irelia.test.ts:x1:const manaBefore = owner.stats.mana.baseValue;",
  "spells/Irelia.test.ts:x1:expect(owner.stats.mana.baseValue).toBe(manaBefore);",
  "spells/Irelia.test.ts:x1:expect(owner.stats.mana.baseValue).toBe(100 - q.manaCost);",
  "spells/Irelia.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Janna_E.test.ts:x1:result.stats.mana.baseValue = 10_000;",
  "spells/Janna_Q.test.ts:x1:expect(owner.stats.mana.value).toBe(100 - spell.manaCost);",
  "spells/Janna_R.test.ts:x1:expect(owner.stats.mana.value).toBe(200 - MANA_COST);",
  "spells/Janna_W.test.ts:x1:target.stats.mana.baseValue = 100;",
  "spells/Janna_W.test.ts:x2:result.stats.mana.baseValue = 100;",
  "spells/JarvanIV.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Jhin.test.ts:x1:expect(owner.stats.mana.value).toBe(100);",
  "spells/Jhin.test.ts:x2:owner.stats.mana.baseValue = 100;",
  "spells/Jhin.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Katarina.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Leblanc_R.test.ts:x1:owner.stats.mana.baseValue = 500;",
  "spells/Leblanc_R.test.ts:x1:const manaAfterQ = owner.stats.mana.value;",
  "spells/Leblanc_R.test.ts:x1:expect(owner.stats.mana.value).toBe(manaAfterQ);",
  "spells/Lux_R.test.ts:x1:expect(owner.stats.mana.value).toBe(200 - MANA_COST);",
  "spells/Malphite_E.test.ts:x1:expect(owner.stats.mana.value).toBe(100 - spell.manaCost);",
  "spells/Malphite_E.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Malphite_Q.test.ts:x1:owner.stats.mana.baseValue = 500;",
  "spells/Malphite_Q.test.ts:x1:expect(owner.stats.mana.value).toBe(100);",
  "spells/Malphite_Q.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Malphite_W.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Malzahar.test.ts:x1:const manaBefore = malzahar.stats.mana.value;",
  "spells/Malzahar.test.ts:x1:expect(malzahar.stats.mana.value - manaBefore).toBe(MANA_ON_KILL);",
  "spells/Malzahar.test.ts:x1:champion.stats.mana.baseValue = 500;",
  "spells/MasterYi.test.ts:x1:champion.stats.mana.baseValue = 500;",
  "spells/Morgana_W.test.ts:x1:expect(owner.stats.mana.value).toBe(500 - MANA_COST);",
  "spells/Nautilus.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Pantheon_Q.test.ts:x1:expect(caster.stats.mana.value).toBe(75);",
  "spells/Pantheon_Q.test.ts:x1:expect(caster.stats.mana.value).toBe(87.5);",
  "spells/Pantheon_Q.test.ts:x1:stats.mana.baseValue = 100;",
  "spells/Pantheon_Q.test.ts:x1:expect(stats.mana.baseValue).toBe(87.5);",
  "spells/Rammus_WE.test.ts:x1:unit.stats.mana.baseValue = 500;",
  "spells/Riven.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Sett.test.ts:x1:unit.stats.mana.baseValue = 100;",
  "spells/Soraka.test.ts:x1:result.stats.mana.baseValue = 200;",
  "spells/Syndra.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Teemo_E.test.ts:x1:expect(caster.stats.mana.value).toBe(200 - MANA_COST);",
  "spells/Teemo_W.test.ts:x1:expect(caster.stats.mana.value).toBe(200 - MANA_COST);",
  "spells/Varus_Q.test.ts:x2:expect(caster.stats.mana.value).toBe(100 - MANA_COST / 2);",
  "spells/Varus_Q.test.ts:x1:stats.mana.baseValue = 100;",
  "spells/Varus_Q.test.ts:x1:expect(stats.mana.baseValue).toBe(100 - MANA_COST / 2);",
  "spells/Vayne.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Veigar_Q.test.ts:x1:caster.stats.mana.baseValue = 200;",
  "spells/Veigar_Q.test.ts:x1:expect(caster.stats.mana.value).toBe(200 + spell.manaPerStack);",
  "spells/Veigar_Q.test.ts:x1:expect(caster.stats.mana.value).toBe(caster.stats.maxMana.value);",
  "spells/Veigar_Q.test.ts:x1:unit.stats.mana.baseValue = 500;",
  "spells/Veigar_R.test.ts:x1:expect(owner.stats.mana.value).toBe(200); // committed at release, not start",
  "spells/Veigar_R.test.ts:x1:expect(owner.stats.mana.value).toBe(200);",
  "spells/Veigar_R.test.ts:x1:expect(owner.stats.mana.value).toBe(200 - MANA_COST);",
  "spells/Veigar_R.test.ts:x1:result.stats.mana.baseValue = 200;",
  "spells/Veigar_W.test.ts:x1:expect(caster.stats.mana.value).toBe(200 - MANA_COST);",
  "spells/Vi.test.ts:x1:result.stats.mana.baseValue = 100;",
  "spells/Warwick_R.test.ts:x1:owner.stats.mana.baseValue = 500;",
  "spells/XinZhao.test.ts:x1:unit.stats.mana.baseValue = 200;",
  "spells/Ziggs.test.ts:x1:result.stats.mana.baseValue = 100;",
]);

/**
 * `spell-runtime-drive`: these tests call a lifecycle hook (`.onSpellCast(`,
 * `.onActivate(`, `.onRecast(`, ...) directly rather than through `pressSpell`/
 * `releaseSpell` — a pre-existing pattern in Task 5's own rewrite, carried
 * over rather than rewritten here: this task moves the tests and wires the
 * seam that first sees them, it does not re-author 29 spell tests' own
 * driving style (27 from the original directory move, plus
 * `Pantheon_Q.test.ts`/`Varus_Q.test.ts` once fix round 2 gave them a real
 * exemption instead of `SKIP` — see this file's own header). A future pass
 * narrowing this list is real work, not a byproduct of a directory move.
 */
const GRANDFATHERED_TESTS = new Set([
  "Annie_QE.test.ts",
  "Caitlyn.test.ts",
  "Camille.test.ts",
  "Darius.test.ts",
  "Diana.test.ts",
  "Ekko.test.ts",
  "Ezreal.test.ts",
  "JarvanIV.test.ts",
  "Jinx_R.test.ts",
  "Malzahar.test.ts",
  "MasterYi.test.ts",
  "Nautilus.test.ts",
  "Nocturne_Q.test.ts",
  "Pantheon.test.ts",
  // Real .onChargeUpdate(/.onCancel( calls at lines 254, 322, 331, 334, 347.
  // Fix round 1 of task 6's review found this file (and Varus_Q.test.ts,
  // below) had this debt silently untracked by SKIP; fix round 2 is what
  // actually restores tracking -- see this file's own header -- by giving
  // stat-resource-modifier and unit-target-team their own exemption fields
  // so this file no longer needs SKIP at all, and this entry is consumed
  // and stale-checked again like every other one in this set.
  "Pantheon_Q.test.ts",
  "Rammus_R.test.ts",
  "Rammus_WE.test.ts",
  "Renekton.test.ts",
  "Riven.test.ts",
  "Sett.test.ts",
  "Singed_E.test.ts",
  "Syndra.test.ts",
  "Thresh_WE.test.ts",
  "Tryndamere.test.ts",
  // Real .onChargeUpdate(/.onCancel( calls at lines 212, 221, 223, 225, 286.
  // Same history as Pantheon_Q.test.ts above.
  "Varus_Q.test.ts",
  "Vayne.test.ts",
  "Vi.test.ts",
  "XinZhao.test.ts",
  "Ziggs.test.ts",
]);

/**
 * `target-vision`: `Ashe_E.vision.test.ts` reads `visibleToPlayerTeam` to assert
 * the flag itself behaves correctly — the seam exists to stop a spell using
 * it to *decide targeting*, not to stop a test from checking what the flag
 * is set to.
 */
const GRANDFATHERED_FOG_READS = new Set([
  "Ashe_E.vision.test.ts",
  "Lux_R.test.ts",
  // `representative-spells.test.ts`'s makeOwner() sets `visibleToPlayerTeam:
  // true` on its fixture owner — a fixture field, not a spell reading the
  // flag to decide targeting. Content-pack-and-repo-split batch 6 task 10.
  "representative-spells.test.ts",
]);

/**
 * `stat-resource-modifier`: each of these constructs a plain
 * `{ mana: ..., health: { value } }`-shaped stats double, which the seam's
 * `(?:health|mana)\s*:\s*\{` pattern cannot distinguish from a real `Buff`
 * bonus config treating a resource as a plain stat — a fixture, never a
 * declaration. Same per-line, stale-checked shape as `PINNED_MANA_LINES`
 * above (`src/seams/statResourceModifier.ts`'s `pinnedResourceLines`, fix
 * round 2 of task 6's own review).
 */
const PINNED_RESOURCE_LINES = new Set([
  // Same fix round as PINNED_MANA_LINES above: `makeOwner()`'s plain
  // `{ mana: { value: mana }, health: { value: 100 } }` stats double.
  "representative-spells.test.ts:x1:mana: { value: mana },",
  "representative-spells.test.ts:x1:health: { value: 100 },",
  "spells/Anivia_R.test.ts:x1:stats: { mana: manaStat, health: { value: 100 } },",
  "spells/Ashe_R.test.ts:x1:stats: { mana: { value: 100 }, health: { value: 100 } },",
  "spells/Janna_Q.test.ts:x1:stats: { mana: { value: 100 }, health: { value: 100 } },",
  "spells/Janna_R.test.ts:x1:stats: { mana: { value: 200 }, health: { value: 100 } },",
  "spells/Lux_R.test.ts:x3:stats: { mana: { value: 200 }, health: { value: 100 } },",
  "spells/Lux_R.test.ts:x1:stats: { mana: { value: 500 }, health: { value: 100 } },",
  "spells/Pantheon_Q.test.ts:x1:health: { value: health },",
  "spells/Pantheon_Q.test.ts:x1:stats: { mana, health: { value: 100 }, addModifier: vi.fn(), removeModifier: vi.fn() },",
  "spells/Teemo_E.test.ts:x1:stats: { mana: manaStat, health: { value: 100 } },",
  "spells/Teemo_W.test.ts:x1:stats: { mana: manaStat, health: { value: 100 } },",
  "spells/Varus_Q.test.ts:x1:stats: { mana, health: { value: 100 }, addModifier: vi.fn(), removeModifier: vi.fn() },",
  "spells/Veigar_W.test.ts:x1:stats: { mana: manaStat, health: { value: 100 } },",
]);

/**
 * `unit-target-team`: `Leblanc_Q.test.ts` asserts the real spell's
 * `castSpec` is `targeting: 'UNIT'` and separately calls
 * `TargetResolver.resolve('UNIT', { targetTeam: 'ENEMY', ... })` directly —
 * neither is the file *declaring* a `UNIT`-targeted spell class, so the
 * literal string `targetingRequest` never appears even though the real
 * spell supplies one. **Not** `noPressOverride`, which is a different check
 * (`src/seams/unitTargetTeam.ts`'s own header explains why they cannot be
 * conflated) — this file has real `press()` calls, so `noPressOverride`
 * would never even be consulted for it.
 */
const NO_TARGETING_REQUEST_OVERRIDE = new Set([
  "Leblanc_Q.test.ts",
]);

/**
 * Whole files left out of every seam's walk entirely — empty today.
 * `stat-resource-modifier` and `unit-target-team` used to force everything
 * above into this set wholesale (fix round 1's own history, in this file's
 * header); fix round 2 gave both seams a real exemption field instead, so
 * nothing currently needs the blunt instrument. Kept, not deleted: the
 * next file that is genuinely not spell-shaped code — a barrel, a
 * scaffolding template, the same reason `./spells/seam-debt.mjs`'s own
 * `SKIP` is not empty — still has nowhere else to go.
 */
const SKIP = new Set([]);

export const seamDebt = {
  skip: SKIP,
  pinnedManaLines: PINNED_MANA_LINES,
  pinnedResourceLines: PINNED_RESOURCE_LINES,
  grandfatheredTests: GRANDFATHERED_TESTS,
  grandfatheredFogReads: GRANDFATHERED_FOG_READS,
  noTargetingRequestOverride: NO_TARGETING_REQUEST_OVERRIDE,
};
