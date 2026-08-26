import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Camille_Q from '../../spells/Camille_Q';
import Camille_W from '../../spells/Camille_W';
import Camille_E, {
  CAMILLE_E_DIVE_RANGE,
  CAMILLE_E_PERCH_MS,
  Camille_E_TetherObject,
} from '../../spells/Camille_E';
import Camille_R from '../../spells/Camille_R';
const __api = buildTestApi();
const { AttackableUnit } = __api.units;
type AttackableUnit = InstanceType<typeof __api.units.AttackableUnit>;

function unit(game: TestGame, x: number, teamId: string): AttackableUnit {
  const result = createUnit(game, x, teamId);
  result.collisionRadius = 1;
  result.stats.speed.baseValue = 10;
  result.stats.mana.baseValue = 100;
  result.stats.health.baseValue = 100;
  result.stats.maxHealth.baseValue = 100;
  result.animatedValues.displaySize = 20;
  return result;
}

describe('Camille Spells', () => {
  beforeEach(() => {
    installSpellObjectGlobals();
    vi.stubGlobal('deltaTime', 250);
    vi.stubGlobal('random', () => 0.5);
    vi.stubGlobal('TWO_PI', Math.PI * 2);
    vi.stubGlobal('HALF_PI', Math.PI / 2);
    vi.stubGlobal('PI', Math.PI);
    vi.stubGlobal('createVector', (x = 0, y = 0) => new (p5 as any).Vector(x, y));
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('casts Camille Q empowered attack', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    const q = new Camille_Q(owner);
    q.onSpellCast();
    expect(owner.buffs.length).toBeGreaterThan(0);
  });

  it('casts Camille W sweep', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    const w = new Camille_W(owner);
    w.onSpellCast();
    expect(game.objectManager._objectToBeAdd.length).toBeGreaterThan(0);
  });

  it('casts Camille E hookshot', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    const e = new Camille_E(owner);
    e.onSpellCast();
  });

  /**
   * The perch. Reported live: never recast E and the hook stayed bitten into
   * the wall forever — through her death, the respawn after it, even a roster
   * swap. The perch now carries a clock, releases on death and on removal,
   * and a move order while perched *is* the dive.
   */
  describe('the perch', () => {
    const perchWorld = () => {
      const game = createGame();
      (game as any).worldMouse = createVector(200, 0);
      const owner = unit(game, 0, 'blue');
      const e = new Camille_E(owner);
      e.attachedToWall = true;
      e.wallAttachPoint = createVector(60, 0);
      e.perchMsLeft = CAMILLE_E_PERCH_MS;
      const tether = new Camille_E_TetherObject(owner, createVector(60, 0), e);
      e.tetherObj = tether;
      return { game, owner, e, tether };
    };
    const diveOf = (owner: AttackableUnit) =>
      owner.buffs.find(buff => (buff as { dashDestination?: unknown }).dashDestination) as
        | { dashDestination: { x: number; y: number } }
        | undefined;

    it('lets go when she dies, instead of pinning the wall forever', () => {
      const { owner, e, tether } = perchWorld();
      owner.die({ reviveAfter: 1_000 });
      e.onUpdate();

      expect(e.attachedToWall).toBe(false);
      expect(tether.toRemove).toBe(true);
      expect(e.currentCooldown).toBeGreaterThan(0);
    });

    it('turns a move order into the dive, toward where she tried to go', () => {
      const { owner, e } = perchWorld();
      owner.moveTo(0, 500);
      e.onUpdate();

      expect(e.attachedToWall).toBe(false);
      const dive = diveOf(owner);
      expect(dive).toBeDefined();
      expect(dive!.dashDestination.y).toBeGreaterThan(0);
      expect(e.currentCooldown).toBeGreaterThan(0);
    });

    it('caps the dive at its shortened range, measured from the wall', () => {
      const { owner, e } = perchWorld();
      owner.moveTo(2_000, 0);
      e.onUpdate();

      const dive = diveOf(owner)!;
      const launched = Math.hypot(dive.dashDestination.x - 60, dive.dashDestination.y);
      expect(launched).toBeCloseTo(CAMILLE_E_DIVE_RANGE, 0);
    });

    it('times out rather than holding forever, and spends the ability', () => {
      const { e, tether } = perchWorld();
      for (let frame = 0; frame < 11; frame++) e.onUpdate();

      expect(e.attachedToWall).toBe(false);
      expect(tether.toRemove).toBe(true);
      expect(e.currentCooldown).toBeGreaterThan(0);
    });

    it('releases when the spell itself is removed — a roster swap', () => {
      const { e, tether } = perchWorld();
      e.onRemoved();

      expect(e.attachedToWall).toBe(false);
      expect(tether.toRemove).toBe(true);
    });
  });

  it('casts Camille R hextech ultimatum', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    const r = new Camille_R(owner);
    r.onSpellCast();
    expect(owner.buffs.length).toBeGreaterThan(0);
  });
});
