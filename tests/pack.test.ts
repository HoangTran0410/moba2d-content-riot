import { describe, expect, it } from 'vitest';
import riotCode, { data } from '../pack';
import { buildTestApi, PackRegistry } from '@moba2d/core/testing';
import { spellModules as riotSpellModules } from '../generated/spellModules';
import type { ContentPack } from '@moba2d/core/content/types';

/**
 * `packs/riot/pack.ts` — the replacement for `src/content/bundledPack.ts`
 * (batch 4 task 7). Moved from `tests/content/bundledPack.test.ts`, whose own
 * assertions leaned on `CHAMPION_KITS` — gone along with the file it was
 * declared in — so every check below reads the pack's own exported `data`
 * instead of a second, independent source to compare it against.
 *
 * `pack.ts` itself is just a re-export (`./pack.ts`'s own header explains
 * why): `data` from `./data.ts`, the default code factory from `./code.ts`.
 *
 * **This pack, on its own, is not installable — deliberately, and the last
 * test below pins that.** `data.champions` names `'BasicAttack'` (the "Đánh
 * Thường" shelf) and gives every champion a `'Recall'`; `code.ts` supplies
 * neither — both are core's own spells (`Recall` came back to
 * `src/game/gameObject/coreSpells/` in batch 5 task 1, beside `BasicAttack`)
 * — which `tests/content/packBoundary.test.ts` refuses this pack any direct
 * reach for. `src/content/install.ts` is what folds both core spells onto
 * this pack's data and code before installing either half
 * (`tests/content/install.test.ts` covers that composed, actually-installed
 * shape); a bare `{ ...data, ...riotCode(api) }` was never meant to stand
 * alone, which the old `bundledPack.ts` obscured by doing that folding
 * internally, in the same file its `data`/`code` were declared in.
 */
describe('the riot pack', () => {
  const api = buildTestApi();

  it('carries a real roster', () => {
    expect(data.champions?.length).toBeGreaterThan(30);
  });

  it("carries exactly the generated spell modules — core's BasicAttack and Recall are install.ts's to add", () => {
    const code = riotCode(api);
    expect(Object.keys(riotSpellModules).length).toBeGreaterThan(200);
    expect(Object.keys(code.spells ?? {})).toHaveLength(Object.keys(riotSpellModules).length);
    expect(code.spells?.BasicAttack).toBeUndefined();
    expect(code.spells?.Recall).toBeUndefined();
  });

  it('hands every spell over lazily — each one is a loader, not a resolved class', () => {
    const code = riotCode(api);
    const entries = Object.entries(code.spells ?? {});
    expect(entries.length).toBeGreaterThan(200);
    for (const [id, source] of entries) {
      expect(typeof source, id).toBe('function');
      // A class has a `prototype`; an arrow-function loader (the shape every
      // `spellModules` entry uses) never does — see `isSpellLoader`'s own
      // doc comment for this exact discriminator.
      expect((source as { prototype?: unknown }).prototype, id).toBeUndefined();
    }
  });

  it('really can load one', async () => {
    const code = riotCode(api);
    const loader = code.spells?.Yasuo_Q as (() => Promise<unknown>) | undefined;
    expect(loader).toBeTypeOf('function');
    const loaded = await loader!();
    expect(loaded).toBeTypeOf('function');
  });

  it('marks playable exactly the champions with a real portrait, a full kit and an attack profile', () => {
    // The predicate `packs/riot/data.ts`'s `championEntries()` applies,
    // restated here so a regression in that function (not just in this
    // pack's own roster data) would still be visible: `playable` is not an
    // opinion this test takes on faith.
    const wasPlayable = (champion: NonNullable<typeof data.champions>[number]) =>
      Boolean(champion.image?.startsWith('champ_')) &&
      champion.spells.length === 4 &&
      Boolean(champion.attack);
    const expected = (data.champions ?? [])
      .filter(wasPlayable)
      .map(c => c.name)
      .sort();
    expect(expected.length).toBeGreaterThan(20);

    const actual = (data.champions ?? []).filter(c => c.playable).map(c => c.name);
    expect(actual.sort()).toEqual(expected);
  });

  it('declares Recall on every champion by name, but supplies neither the class nor display data', () => {
    // The class half moved to core (batch 5 task 1 — `tests/content/install.test.ts`
    // covers the folded, actually-loadable `'lol:Recall'`); this pack keeps
    // only the data-half promise, `recall: 'Recall'`, and — like `BasicAttack`
    // — no display entry, so a random loadout roll can never draw it.
    const code = riotCode(api);
    expect(code.spells?.Recall).toBeUndefined();
    expect(data.spellDisplay?.Recall).toBeUndefined();
    for (const champion of data.champions ?? []) expect(champion.recall).toBe('Recall');
  });

  it('overrides the drawn attack style for exactly one camp — the dragon', () => {
    /*
     * Core derives a camp's attack style from its reach (melee under
     * `MONSTER_MELEE_REACH`, a spat projectile past it), which is right for
     * every body in this pack but one: at reach 320 the dragon would spit,
     * and a dragon that does not breathe was the whole complaint.
     *
     * Pinned as the complete list rather than one lookup, so a body that
     * quietly grows an override — or the dragon quietly losing its — shows up
     * here. An older core simply ignores the field (`checkMonsterBody` does
     * not reject unknown keys), so the failure mode without this test is a
     * silent revert nobody sees until they walk into the pit.
     */
    const overrides = Object.entries(data.monsters ?? {}).flatMap(([id, monster]) =>
      monster.members
        .filter(body => body.attackStyle !== undefined)
        .map(body => [id, body.attackStyle] as const)
    );
    expect(overrides).toEqual([['dragon', 'breath']]);
  });

  it('gives every declared attack colour three channels', () => {
    // `fill(r, g, b, alpha)` with a two-entry array reads as a greyscale call
    // in p5, so a short array turns a camp's art grey rather than failing.
    const colours = Object.values(data.monsters ?? {}).flatMap(monster =>
      monster.members.map(body => body.attackColor).filter(colour => colour !== undefined)
    );
    expect(colours.length).toBeGreaterThan(0);
    for (const colour of colours) expect(colour).toHaveLength(3);
  });

  it("supplies Baron's abilities", () => {
    const code = riotCode(api);
    expect(code.monsterAbilities?.baron?.length).toBeGreaterThan(0);
  });

  it("is not independently installable — it depends on core's own BasicAttack and Recall", () => {
    // `src/content/install.ts` folds `BasicAttack` and `Recall` onto this
    // pack before installing it (`riotDataWithCore`/`riotCodeWithCore`); a
    // bare `{ ...data, ...riotCode(api) }`, installed on its own, is missing
    // both — every champion's `recall: 'Recall'` unresolved on top of the
    // "Đánh Thường" champion's one ability. This pins the *reason* the
    // install still throws — `/BasicAttack/` is one of several errors the
    // rejection message now joins, not the whole of it — so a future reader
    // who hits this throw does not mistake it for a bug in the pack.
    const pack: ContentPack = { ...data, ...riotCode(api) };
    expect(() => new PackRegistry().install(pack)).toThrow(/BasicAttack/);
  });

  it('is the pack `manifest.id` names — the composed, installable shape lives in tests/content/install.test.ts', () => {
    // The one place this pack states its own id. Core's barrel
    // (`scripts/generate-installed-packs.mjs`) reads it from here too, so a
    // rename here renames the pack everywhere rather than half of it.
    expect(data.manifest.id).toBe('lol');
    expect(data.manifest.assets).toBe('lol');
  });
});
