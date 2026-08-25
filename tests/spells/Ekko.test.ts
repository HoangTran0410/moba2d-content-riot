import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Ekko_Q from '../../spells/Ekko_Q';
import Ekko_W from '../../spells/Ekko_W';
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
