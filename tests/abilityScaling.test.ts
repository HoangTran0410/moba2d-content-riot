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
 */
describe('an item in this shop makes this pack’s abilities hit harder', () => {
  let game: TestGame;

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 16);
    game = createGame();
  });

  /** Casts W once and returns what the victim's health actually lost. */
  const burst = (abilityPower: number): number => {
    const riven = createUnit(game, 0, 'blue');
    const victim = createUnit(game, 40, 'red');
    victim.stats.maxHealth.baseValue = 10_000;
    victim.stats.health.baseValue = 10_000;
    riven.stats.abilityPower.baseValue = abilityPower;
    game.setPlayer(riven);
    indexObjects(game, [riven, victim]);

    const spell = new Riven_W(riven);
    expect(pressSpell(spell, { at: { x: 40, y: 0 } })).toBe(true);
    for (let tick = 0; tick < 60 && victim.recentDamageLog.length === 0; tick++) spell.update();

    const hit = victim.recentDamageLog[0];
    expect(hit, 'the burst never landed, so this proves nothing').toBeDefined();
    return hit.amount;
  };

  it('deals its authored number to a champion who has bought nothing', () => {
    // The migration guarantee: the day the stat landed, every tuning number in
    // this pack still meant exactly what it said.
    expect(burst(0)).toBe(W_DAMAGE);
  });

  it('deals more once ability power is on the caster', () => {
    // 1.5 is one item — Đồng Hồ Cát Zhonya.
    expect(burst(1.5)).toBe(Math.round(W_DAMAGE * 2.5));
  });

  it('roughly ninefolds on a full ability build', () => {
    // 7.9 is the six best ability items in the shop, which `items.test.ts`
    // holds the table to — the 2026-08-28 rebalance's magnitude, sized so the
    // ability path's value per gold keeps pace with the attack path's
    // (`balanceReport.test.ts` owns that ratio).
    expect(burst(7.9)).toBe(Math.round(W_DAMAGE * 8.9));
  });
});
