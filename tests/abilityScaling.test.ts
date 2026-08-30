import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import { indexObjects } from '@moba2d/core/testing';
import Riven_W, { W_DAMAGE } from '../spells/Riven_W';
import Amumu_R, { DAMAGE as AMUMU_R_DAMAGE } from '../spells/Amumu_R';

/**
 * An item bought in this pack's shop makes this pack's abilities hit harder,
 * and **not one spell file knows it**.
 *
 * `items.test.ts` checks the shop sells enough ability power for a full build
 * to roughly triple a kit; that is a table read, and a table can be right while
 * the number never reaches a champion. This is the other end: a real ability,
 * driven the way a player casts it, against a caster whose only difference is
 * the stat an item grants.
 *
 * `Riven_W` because it is already the spell `damageAttribution.test.ts` drives
 * for the same reason — a plain burst with a windup, no missile, no stacks, so
 * a changed number can only have come from the scaling.
 *
 * ## Two abilities, because there are now two stats
 *
 * Ability power used to amplify every ability whatever it dealt, so one spell
 * proved the whole rule. It does not any more: a magic ability reads ability
 * power and a physical one reads the attack damage its holder bought
 * (core's `combat/Amplification.ts`). Riven W is physical and `Amumu_R` is the
 * magic twin — also a plain self-centred burst with no missile and no stacks.
 *
 * Driving only one of them would leave half the shop unproven, and it is the
 * half that was broken: every attack-damage item in this shop bought a
 * champion's abilities a multiplier of exactly 1.00.
 */
describe('an item in this shop makes this pack’s abilities hit harder', () => {
  let game: TestGame;

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 16);
    game = createGame();
  });

  interface Build {
    abilityPower?: number;
    /** Points of *bought* attack damage, over a base this fixture pins at zero. */
    attackDamage?: number;
  }

  /** Casts one burst and returns what the victim's health actually lost. */
  const burst = (
    Spell: typeof Riven_W | typeof Amumu_R,
    { abilityPower = 0, attackDamage = 0 }: Build
  ): number => {
    const caster = createUnit(game, 0, 'blue');
    const victim = createUnit(game, 40, 'red');
    victim.stats.maxHealth.baseValue = 10_000;
    victim.stats.health.baseValue = 10_000;
    caster.stats.abilityPower.baseValue = abilityPower;
    // `flatBonus`, never `baseValue`: only the bought half scales an ability,
    // so writing this into the base would prove nothing at all.
    caster.stats.attackDamage.flatBonus = attackDamage;
    game.setPlayer(caster);
    indexObjects(game, [caster, victim]);

    const spell = new Spell(caster);
    expect(pressSpell(spell, { at: { x: 40, y: 0 } })).toBe(true);
    for (let tick = 0; tick < 60 && victim.recentDamageLog.length === 0; tick++) spell.update();

    const hit = victim.recentDamageLog[0];
    expect(hit, 'the burst never landed, so this proves nothing').toBeDefined();
    return hit.amount;
  };

  it('deals its authored number to a champion who has bought nothing', () => {
    // The migration guarantee: the day the stat landed, every tuning number in
    // this pack still meant exactly what it said.
    expect(burst(Amumu_R, {})).toBe(AMUMU_R_DAMAGE);
    expect(burst(Riven_W, {})).toBe(W_DAMAGE);
  });

  it('deals more once ability power is on the caster', () => {
    // 1.5 is one item — Đồng Hồ Cát Zhonya.
    expect(burst(Amumu_R, { abilityPower: 1.5 })).toBe(Math.round(AMUMU_R_DAMAGE * 2.5));
  });

  it('roughly ninefolds on a full ability build', () => {
    // 7.9 is the six best ability items in the shop, which `items.test.ts`
    // holds the table to — the 2026-08-28 rebalance's magnitude, sized so the
    // ability path's value per gold keeps pace with the attack path's
    // (`balanceReport.test.ts` owns that ratio).
    expect(burst(Amumu_R, { abilityPower: 7.9 })).toBe(Math.round(AMUMU_R_DAMAGE * 8.9));
  });

  it('and an attack-damage item does the same for a physical ability', () => {
    // 18 points is one item — Vô Cực Kiếm, the shop's biggest single grant.
    // At core's 5% a point that is +90%, which is the whole of what every
    // attack build in this pack used to buy its own abilities: nothing.
    expect(burst(Riven_W, { attackDamage: 18 })).toBe(Math.round(W_DAMAGE * 1.9));
  });

  it('and neither stat reaches across into the other kind of ability', () => {
    // The bug this split exists for, from the shop's end: magic power used to
    // make a physical ability hit harder, so one purchase bought two halves of
    // a champion.
    expect(burst(Riven_W, { abilityPower: 7.9 })).toBe(W_DAMAGE);
    expect(burst(Amumu_R, { attackDamage: 18 })).toBe(AMUMU_R_DAMAGE);
  });
});
