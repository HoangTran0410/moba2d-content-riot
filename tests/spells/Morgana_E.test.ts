import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Morgana_E, { Morgana_E_BlackShield, SHIELD_AMOUNT } from '../../spells/Morgana_E';

const __api = buildTestApi();
type AnyUnit = InstanceType<typeof __api.units.AttackableUnit>;

/**
 * Black Shield stops magic, and only magic.
 *
 * It shipped absorbing all three damage types, and its own description said so
 * — "hấp thụ mọi loại sát thương, kể cả sát thương chuẩn" — because the engine
 * had no way to say otherwise. That made it strictly the best shield in the
 * game while wearing an anti-magic name, and it made the buff tooltip useless
 * in the other direction: a player hovering the icon read "hấp thụ 35 sát
 * thương" and could not tell whether it would still be there when the physical
 * damage arrived. `Shield.absorbs` is core's answer, and this is the ability
 * that asked for it.
 */
describe('Morgana E (Black Shield)', () => {
  let game: TestGame;
  let morgana: AnyUnit;
  let attacker: AnyUnit;

  const shielded = (): Morgana_E_BlackShield => {
    const spell = new Morgana_E(morgana);
    spell.onSpellCast();
    const shield = morgana.buffs.find(
      buff => buff instanceof Morgana_E_BlackShield
    ) as Morgana_E_BlackShield;
    expect(shield, 'the cast left no shield to test').toBeDefined();
    return shield;
  };

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    game = createGame();
    morgana = createUnit(game, 0, 'blue');
    attacker = createUnit(game, 200, 'red');
    morgana.stats.maxHealth.baseValue = 500;
    morgana.stats.health.baseValue = 500;
    game.setPlayer(morgana);
    indexObjects(game, [morgana, attacker]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('eats magic damage out of its own pool', () => {
    const shield = shielded();
    const before = morgana.stats.health.value;

    morgana.takeDamage(20, attacker, 'MAGIC');

    expect(morgana.stats.health.value, 'magic damage reached health').toBe(before);
    expect(shield.amount).toBe(SHIELD_AMOUNT - 20);
  });

  it('lets physical damage through without spending the pool', () => {
    const shield = shielded();
    const before = morgana.stats.health.value;

    morgana.takeDamage(20, attacker, 'PHYSICAL');

    expect(morgana.stats.health.value).toBe(before - 20);
    expect(shield.amount, 'the anti-magic shield paid for a physical hit').toBe(SHIELD_AMOUNT);
  });

  it('lets true damage through too, which is the half its old text bragged about', () => {
    const shield = shielded();
    const before = morgana.stats.health.value;

    morgana.takeDamage(20, attacker, 'TRUE');

    expect(morgana.stats.health.value).toBe(before - 20);
    expect(shield.amount).toBe(SHIELD_AMOUNT);
  });

  it('says so on the buff, so the icon is not just a number', () => {
    const shield = shielded();
    expect(shield.description).toContain('sát thương phép');
  });

  it('still blocks crowd control whatever the damage did', () => {
    const shield = shielded();
    const stun = new __api.buffs.Stun(2_000, attacker, morgana);
    morgana.addBuff(stun);
    shield.onUpdate();

    // The immunity is the other half of the ability and is untouched by the
    // damage-type filter — it was never about damage in the first place.
    expect(stun.toRemove).toBe(true);
  });
});
