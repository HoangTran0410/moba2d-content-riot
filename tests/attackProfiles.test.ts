import { describe, expect, it } from 'vitest';

import { ATTACK, data } from '../data';
import { buildTestApi, MAX_ATTACK_SPEED, MELEE_RANGE_THRESHOLD } from '@moba2d/core/testing';
const __api = buildTestApi();
const { DEFAULT_CHAMPION_ATTACK } = __api.units;

/**
 * Roles have to actually differ.
 *
 * Moved out of `tests/game/combat/AttackProfiles.test.ts` in a fix round: that
 * file imported `ATTACK` off `@/game/preset`'s re-export of
 * `src/game/config/spellCatalog.ts`'s own copy — the table core carried and
 * this test guarded. The table a match actually ships was always
 * `packs/riot/data.ts`'s own duplicate, unguarded by anything. A pack file may
 * not reach into core for a *value* (`tests/content/packBoundary.test.ts`
 * allows only `@/content/ContentApi`/`ContentPack`/`types`, type-only), but
 * that rule scans `packs/**` source, not the test tree, so a test under
 * `tests/packs/` can still import core's mechanism constants
 * (`MELEE_RANGE_THRESHOLD`, `MAX_ATTACK_SPEED`, `DEFAULT_CHAMPION_ATTACK`) to
 * check the pack's own numbers against them — confirmed against that scan's
 * `PACKS_DIR` (`join(__dirname, '../../packs')`, `tests/content/`-relative,
 * never walks `tests/`) before relying on it here.
 *
 * Every champion in the game once shared one profile — 16 damage at 0.8/s
 * from 300 range — which made "marksman" a word in a description rather than
 * anything the game modelled, and left kits designed around attack speed with
 * none. The failure mode this guards is not a typo, it is drift: someone
 * retunes one archetype toward another until the roster is uniform again and
 * nothing looks broken, because nothing is. So the assertions are about
 * *gaps* and *ordering*, not about the specific numbers, which are meant to
 * be retuned freely.
 */
const dps = (a: { damage: number; attacksPerSecond: number }) => a.damage * a.attacksPerSecond;

describe("the riot pack's basic-attack profiles", () => {
  it('melee roles are actually under the melee threshold', () => {
    // 140 is what BasicAttackController reads to decide swing-vs-bolt. Every
    // champion sat at 300 before, so Garen and Malphite were firing projectiles.
    for (const role of ['ASSASSIN', 'BRUISER', 'TANK'] as const) {
      expect(ATTACK[role].range, role).toBeLessThan(MELEE_RANGE_THRESHOLD);
    }
    for (const role of ['MARKSMAN', 'MAGE', 'SUPPORT'] as const) {
      expect(ATTACK[role].range, role).toBeGreaterThan(MELEE_RANGE_THRESHOLD);
    }
  });

  it('reach is paid for in damage per swing', () => {
    // the cheapest melee swing still hits harder than the hardest ranged one
    const melee = Math.min(ATTACK.ASSASSIN.damage, ATTACK.BRUISER.damage, ATTACK.TANK.damage);
    const ranged = Math.max(ATTACK.MARKSMAN.damage, ATTACK.MAGE.damage, ATTACK.SUPPORT.damage);
    expect(melee).toBeGreaterThan(ranged);
  });

  it('the marksman swings fastest, which is the whole role', () => {
    for (const role of ['MAGE', 'SUPPORT', 'ASSASSIN', 'BRUISER', 'TANK'] as const) {
      expect(ATTACK.MARKSMAN.attacksPerSecond, role).toBeGreaterThan(ATTACK[role].attacksPerSecond);
    }
    // and far enough ahead that an attack-speed buff is worth building around
    expect(ATTACK.MARKSMAN.attacksPerSecond).toBeGreaterThan(ATTACK.TANK.attacksPerSecond * 1.5);
  });

  it('leaves headroom above the fastest base for buffs to matter', () => {
    // a marksman under one big attack-speed buff must not be sitting on the cap,
    // or a second source of attack speed buys nothing
    expect(ATTACK.MARKSMAN.attacksPerSecond * 1.45).toBeLessThan(MAX_ATTACK_SPEED);
  });

  it('no archetype is a rounding error away from the default', () => {
    // the default is the fallback for anything unassigned; an archetype that
    // matches it is not an archetype
    for (const [role, profile] of Object.entries(ATTACK)) {
      const same =
        profile.damage === DEFAULT_CHAMPION_ATTACK.damage &&
        profile.attacksPerSecond === DEFAULT_CHAMPION_ATTACK.attacksPerSecond &&
        profile.range === DEFAULT_CHAMPION_ATTACK.range;
      expect(same, role).toBe(false);
    }
  });

  it('keeps every profile inside a sane dps band', () => {
    // wide on purpose: this catches a fat finger, not a balance opinion
    for (const [role, profile] of Object.entries(ATTACK)) {
      expect(dps(profile), role).toBeGreaterThan(8);
      expect(dps(profile), role).toBeLessThan(25);
    }
  });
});


/**
 * Missile speed — the delivery half of a ranged auto, and the half every
 * champion in the source game tunes individually (a 3800 buckshot and a 1000
 * healer's lob are different weapons). The mapping this pack ships is **the
 * live wiki's own missile speeds at half scale, rounded to 25**, pinned here
 * exactly the way the item SPEC pins the shop: a table that asks the data
 * what the data says would agree with any typo.
 */
describe("the riot pack's basic-attack missile speeds", () => {
  /** wiki missile speed / 2, rounded to 25 — see ATTACK's own doc comment. */
  const WIKI_HALVED: Record<string, number> = {
    Ahri: 875,
    Lux: 800,
    Ashe: 1250,
    Leblanc: 850,
    Teemo: 750,
    Veigar: 750,
    Graves: 1900,
    Anivia: 800,
    Varus: 1000,
    Morgana: 800,
    Janna: 900,
    Twitch: 1250,
    Cassiopeia: 750,
    Annie: 750,
    Malzahar: 1000,
    Ezreal: 1000,
    Caitlyn: 1250,
    Soraka: 500,
    Brand: 1000,
    Vayne: 1000,
    Jhin: 1300,
    Syndra: 900,
    Ziggs: 750,
  };

  const champions = data.champions ?? [];
  const byName = new Map(champions.map(entry => [entry.name, entry]));

  it('carries the halved wiki speed on every champion the wiki lists one for', () => {
    for (const [name, speed] of Object.entries(WIKI_HALVED)) {
      const entry = byName.get(name);
      expect(entry, name).toBeDefined();
      expect(entry?.attack?.boltUnitsPerSecond, name).toBe(speed);
    }
  });

  it('gives every ranged champion a speed and no melee champion one', () => {
    for (const entry of champions) {
      if (!entry.attack) continue;
      if (entry.attack.range > MELEE_RANGE_THRESHOLD) {
        expect(entry.attack.boltUnitsPerSecond, entry.name).toBeGreaterThan(0);
      } else {
        expect(entry.attack.boltUnitsPerSecond, entry.name).toBeUndefined();
      }
    }
  });

  it('keeps every speed inside the half-scale band the source game spans', () => {
    // wiki ranged autos run ~1000-3800, so halved they run 500-1900; a value
    // outside that is a fat finger, not a tuning opinion
    for (const entry of champions) {
      const speed = entry.attack?.boltUnitsPerSecond;
      if (speed === undefined) continue;
      expect(speed, entry.name).toBeGreaterThanOrEqual(500);
      expect(speed, entry.name).toBeLessThanOrEqual(1900);
    }
  });

  it('orders the role fallbacks the way the classes actually shoot', () => {
    // a marksman's auto is their weapon, a mage's is filler between spells
    expect(ATTACK.MARKSMAN.boltUnitsPerSecond).toBeGreaterThan(ATTACK.MAGE.boltUnitsPerSecond);
  });

  it('the two named identities the mapping exists for actually differ', () => {
    // the report that produced this table: every ranged auto flew at one
    // speed, and a buckshot read exactly like an arrow
    const graves = byName.get('Graves')?.attack?.boltUnitsPerSecond ?? 0;
    const varus = byName.get('Varus')?.attack?.boltUnitsPerSecond ?? 0;
    expect(graves).toBeGreaterThan(varus * 1.5);
  });
});
