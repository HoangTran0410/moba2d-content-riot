import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Ekko_Q, { Ekko_Q_Object } from '../../spells/Ekko_Q';
import Ekko_W, { Ekko_W_Object } from '../../spells/Ekko_W';
import Ekko_E from '../../spells/Ekko_E';
import Ekko_R from '../../spells/Ekko_R';
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

describe('Ekko Spells', () => {
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

  it('casts Ekko Q and creates Q projectile', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    vi.stubGlobal('frameCount', 1);
    const q = new Ekko_Q(owner);
    q.onSpellCast();
    expect(game.objectManager._objectToBeAdd.length).toBeGreaterThan(0);
  });

  it('casts Ekko W zone', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    const w = new Ekko_W(owner);
    w.onSpellCast();
    expect(game.objectManager._objectToBeAdd.length).toBeGreaterThan(0);
  });

  /**
   * Reported live: standing in Q's field (or W's sphere) pinned the victim in
   * place outright. Both applied a fresh `Slow` every frame, and `Slow`'s
   * default is STACKS_AND_CONTINUE with maxStacks 10 — ten 40% slows is a
   * standstill. The aura pattern is Anivia R's / Singed W's: RENEW_EXISTING,
   * one slow whose clock keeps being wound.
   */
  it('Q’s field renews one slow instead of stacking a fresh one every frame', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    const victim = unit(game, 40, 'red');
    game.objectManager.queryObjects = vi.fn(() => [victim]) as never;

    vi.stubGlobal('frameCount', 1);
    const q = new Ekko_Q(owner);
    q.onSpellCast();
    const field = game.objectManager._objectToBeAdd.find(
      (o: unknown) => o instanceof Ekko_Q_Object
    ) as InstanceType<typeof Ekko_Q_Object>;
    field.expanded = true;
    field.expandedDuration = 10_000;
    for (let frame = 0; frame < 5; frame++) field.update();

    const slows = victim.buffs.filter(b => b instanceof __api.buffs.Slow);
    expect(slows).toHaveLength(1);
  });

  it('Q hits the same body once going out and once again on the return', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    const victim = unit(game, 40, 'red');
    game.objectManager.queryObjects = vi.fn(() => []) as never;
    vi.stubGlobal('frameCount', 1);

    const q = new Ekko_Q(owner);
    q.onSpellCast();
    const disc = game.objectManager._objectToBeAdd.find(
      (o: unknown) => o instanceof Ekko_Q_Object
    ) as InstanceType<typeof Ekko_Q_Object>;

    const before = victim.stats.health.value;
    disc.hitTargets.push(victim);
    disc.onHit(victim);
    const afterOut = victim.stats.health.value;
    expect(afterOut).toBeLessThan(before);

    // the bloom runs out; the snap-back must be allowed a second pass
    disc.expanded = true;
    disc.expandedTimer = disc.expandedDuration;
    disc.update();
    expect(disc.returning).toBe(true);
    expect(disc.hitTargets).toHaveLength(0);

    disc.hitTargets.push(victim);
    disc.onHit(victim);
    expect(victim.stats.health.value).toBeLessThan(afterOut);
  });

  it('W’s sphere renews one slow the same way', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const victim = unit(game, 500, 'red');
    game.objectManager.queryObjects = vi.fn(() => [victim]) as never;

    const sphere = new Ekko_W_Object(owner);
    sphere.position = createVector(500, 0);
    sphere.isArmed = true;
    for (let frame = 0; frame < 5; frame++) sphere.update();

    const slows = victim.buffs.filter(b => b instanceof __api.buffs.Slow);
    expect(slows).toHaveLength(1);
  });

  it('casts Ekko E dash and buff', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    const e = new Ekko_E(owner);
    e.onSpellCast();
    expect(owner.buffs.length).toBeGreaterThan(0);
  });

  it('casts Ekko R chronobreak teleport & heal', () => {
    const game = createGame();
    (game as any).worldMouse = createVector(200, 0);
    const owner = unit(game, 0, 'blue');
    owner.stats.health.baseValue = 50;
    const r = new Ekko_R(owner);
    r.onSpellCast();
    expect(owner.stats.health.value).toBeGreaterThan(50);
  });
});
