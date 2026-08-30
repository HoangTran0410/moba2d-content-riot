import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Pantheon_E, { BLOCK_HALF_ANGLE, Pantheon_E_Guard } from '../../spells/Pantheon_E';

const __api = buildTestApi();
type AnyUnit = InstanceType<typeof __api.units.AttackableUnit>;

/**
 * Aegis Assault is a wall, and it shipped as a pool.
 *
 * A 60-point `Shield` is a completely different ability: it absorbs the first
 * 60 damage from wherever it arrives and then he is standing in the open,
 * while the real thing stops everything coming from the direction he planted
 * it and nothing at all from behind him. The pool made the ability weakest
 * exactly when it should be strongest — into a barrage — and handed it a
 * benefit it should never have, which is cover from the man walking round
 * behind him.
 */
describe('Pantheon E (Aegis Assault)', () => {
  let game: TestGame;
  let pantheon: AnyUnit;

  const body = (x: number, y: number, teamId: string): AnyUnit => {
    const unit = createUnit(game, x, teamId);
    unit.position.y = y;
    unit.destination.y = y;
    unit.stats.maxHealth.baseValue = 500;
    unit.stats.health.baseValue = 500;
    unit.stats.healthRegen.baseValue = 0;
    return unit;
  };

  /** Planted facing +x. */
  const plant = (): Pantheon_E_Guard => {
    (game as unknown as { worldMouse: unknown }).worldMouse = createVector(1_000, 0);
    expect(pressSpell(new Pantheon_E(pantheon), { at: { x: 1_000, y: 0 } })).toBe(true);
    const guard = pantheon.buffs.find(
      buff => buff instanceof Pantheon_E_Guard
    ) as Pantheon_E_Guard;
    expect(guard, 'the cast planted no shield').toBeDefined();
    return guard;
  };

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 16);
    game = createGame();
    pantheon = body(0, 0, 'blue');
    game.setPlayer(pantheon);
    indexObjects(game, [pantheon]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses damage from the side it was planted, however much of it there is', () => {
    const front = body(400, 0, 'red');
    plant();
    const before = pantheon.stats.health.value;

    // A pool would have stopped the first 60 and let the rest through. Five
    // hits of 100 is exactly the barrage a wall is for.
    for (let i = 0; i < 5; i++) pantheon.takeDamage(100, front, 'PHYSICAL');

    expect(pantheon.stats.health.value, 'the wall let a barrage through').toBe(before);
  });

  it('does nothing at all about the man behind him', () => {
    const behind = body(-400, 0, 'red');
    plant();
    const before = pantheon.stats.health.value;

    pantheon.takeDamage(40, behind, 'PHYSICAL');

    // The open back is the counterplay to a block with no pool behind it. A
    // shield that covered it would be the old ability wearing a new name.
    expect(pantheon.stats.health.value).toBe(before - 40);
  });

  it('blocks every damage type, because it is bronze and not a resistance', () => {
    const front = body(400, 0, 'red');
    plant();
    const before = pantheon.stats.health.value;

    pantheon.takeDamage(30, front, 'MAGIC');
    pantheon.takeDamage(30, front, 'TRUE');

    expect(pantheon.stats.health.value).toBe(before);
  });

  it('covers the flanks up to its own arc and not one degree past it', () => {
    const guard = plant();
    const at = (radians: number) => {
      const unit = body(Math.cos(radians) * 400, Math.sin(radians) * 400, 'red');
      return guard.covers(unit);
    };

    expect(at(0), 'straight ahead is not covered').toBe(true);
    expect(at(BLOCK_HALF_ANGLE - 0.05)).toBe(true);
    expect(at(-(BLOCK_HALF_ANGLE - 0.05))).toBe(true);
    expect(at(BLOCK_HALF_ANGLE + 0.05), 'the arc reaches past where it is drawn').toBe(false);
    expect(at(Math.PI)).toBe(false);
  });

  it('lets through damage whose attacker it cannot place', () => {
    plant();
    const before = pantheon.stats.health.value;

    // A burn with no source, a map hazard. Refusing what it cannot locate
    // would make the ability quietly immune to a whole class of damage, which
    // is the failure a total block has to avoid most.
    pantheon.takeDamage(25, undefined, 'MAGIC');

    expect(pantheon.stats.health.value).toBe(before - 25);
  });

  it('counts what it stopped, so the shield can flinch on the hit', () => {
    const front = body(400, 0, 'red');
    const guard = plant();
    expect(guard.blockedCount).toBe(0);

    pantheon.takeDamage(10, front, 'PHYSICAL');

    // The block is otherwise invisible — a number simply fails to appear — and
    // "nothing happened" is the one thing a defensive ability must not look like.
    expect(guard.blockedCount).toBe(1);
  });
});
