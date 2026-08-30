import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Heal, { HEAL_PERCENT, HEAL_RADIUS } from '../../spells/Heal';

const __api = buildTestApi();
const { Speedup } = __api.buffs;
type AnyUnit = InstanceType<typeof __api.units.AttackableUnit>;

/**
 * Heal was self-only, which is not what the summoner spell is.
 *
 * League's version picks up an ally as well, and the moment it exists for is a
 * team being collapsed on together. Self-only made it a worse Barrier with a
 * longer cooldown — and made the one summoner spell whose whole point is
 * grouping into the one that rewarded standing apart.
 */
describe('Heal (summoner)', () => {
  let game: TestGame;
  let caster: AnyUnit;

  const ally = (x: number, maxHealth = 100): AnyUnit => {
    const unit = createUnit(game, x, 'blue');
    unit.stats.maxHealth.baseValue = maxHealth;
    unit.stats.health.baseValue = maxHealth / 2;
    unit.stats.healthRegen.baseValue = 0;
    return unit;
  };

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    game = createGame();
    caster = ally(0);
    game.setPlayer(caster);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('heals every ally standing in the circle, not only the caster', () => {
    const near = ally(200);
    const far = ally(HEAL_RADIUS - 50);
    indexObjects(game, [caster, near, far]);

    new Heal(caster).onSpellCast();

    for (const unit of [caster, near, far]) {
      expect(unit.stats.health.value, 'an ally in range was not healed').toBe(
        50 + 100 * HEAL_PERCENT
      );
    }
  });

  it('pays each of them a share of their own pool, not of the caster’s', () => {
    // The point of a percentage heal is that it is worth the same to the tank
    // and to the carry. Reading the caster's maximum would make it worth twice
    // as much to whoever stood next to the biggest champion.
    const tank = ally(400, 400);
    indexObjects(game, [caster, tank]);

    new Heal(caster).onSpellCast();

    expect(tank.stats.health.value).toBe(200 + 400 * HEAL_PERCENT);
  });

  it('speeds up everyone it healed', () => {
    const mate = ally(200);
    indexObjects(game, [caster, mate]);

    new Heal(caster).onSpellCast();

    for (const unit of [caster, mate]) {
      expect(unit.buffs.some(buff => buff instanceof Speedup)).toBe(true);
    }
  });

  it('leaves enemies and out-of-range allies alone', () => {
    const enemy = createUnit(game, 150, 'red');
    enemy.stats.maxHealth.baseValue = 100;
    enemy.stats.health.baseValue = 50;
    enemy.stats.healthRegen.baseValue = 0;
    const distant = ally(HEAL_RADIUS + 400);
    indexObjects(game, [caster, enemy, distant]);

    new Heal(caster).onSpellCast();

    expect(enemy.stats.health.value, 'the enemy was healed').toBe(50);
    expect(distant.stats.health.value, 'an ally outside the circle was healed').toBe(50);
  });

  it('still blesses a caster standing entirely alone', () => {
    // The one case that has to work whatever the quadtree says.
    indexObjects(game, []);

    new Heal(caster).onSpellCast();

    expect(caster.stats.health.value).toBe(50 + 100 * HEAL_PERCENT);
  });
});
