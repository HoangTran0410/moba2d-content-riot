import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Item_StatikkShiv, {
  CHAIN_RADIUS,
  CHAIN_TARGETS,
  ENERGIZE_PER_HIT,
  ENERGIZED_AT,
  SHIV_DAMAGE,
} from '../../spells/Item_StatikkShiv';
import Item_DeadMansPlate, {
  IMPACT_DAMAGE_AT_FULL,
  MAX_MOMENTUM,
  MOMENTUM_DECAY_PER_SECOND,
  MOMENTUM_PER_SECOND,
  MOVEMENT_EPSILON,
  SLOW_MS,
  SLOW_PERCENT,
  SPEED_AT_FULL,
} from '../../spells/Item_DeadMansPlate';

/**
 * The two items on the shop's new shelf that are **meters** rather than
 * one-shot procs: Móc Sét Statikk charges off swings, Giáp Người Chết charges
 * off distance walked, and both spend the whole meter on one attack.
 *
 * A meter is the thing a proc test usually cannot see. Every case here drives
 * the real `Buff.onHit` pipeline through `api.combat.applyOnHitEffects` rather
 * than calling the hook by hand, because the echo rule and the buff-list walk
 * are part of what is under test.
 */

const api = buildTestApi();
const { Champion } = api.units;
const { Slow } = api.buffs;

type AnyBuff = InstanceType<typeof api.buffs.Buff>;
const live = (unit: { buffs: AnyBuff[] }): AnyBuff[] => unit.buffs.filter(b => !b.toRemove);

const swing = (attacker: unknown, victim: unknown, echo = false) =>
  api.combat.applyOnHitEffects({
    attacker,
    victim,
    damage: 10,
    ranged: false,
    crit: false,
    echo,
  } as never);

describe('Móc Sét Statikk', () => {
  let game: TestGame;

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    game = createGame();
  });

  const armed = (holder: ReturnType<typeof createUnit>) => {
    expect(pressSpell(new Item_StatikkShiv(holder))).toBe(true);
    return live(holder)[0] as AnyBuff & { charge: number };
  };

  it('arms one permanent buff on the holder and nobody else', () => {
    const holder = createUnit(game, 0);
    const enemy = createUnit(game, 200, 'red');
    game.setPlayer(holder);

    const charge = armed(holder);

    expect(charge.duration).toBe(0);
    expect(live(enemy)).toHaveLength(0);
  });

  it('banks charge per swing and fires only once the meter is full', () => {
    const holder = createUnit(game, 0);
    const enemy = createUnit(game, 120, 'red');
    game.setPlayer(holder);
    indexObjects(game, [holder, enemy]);
    armed(holder);

    const hurt = vi.spyOn(enemy, 'takeDamage');
    // Three swings at 34 each is 102 — the first two must bank and do nothing.
    const swingsToCharge = Math.ceil(ENERGIZED_AT / ENERGIZE_PER_HIT);
    for (let i = 0; i < swingsToCharge - 1; i++) swing(holder, enemy);
    expect(hurt, 'the shiv fired before the meter was full').not.toHaveBeenCalled();

    swing(holder, enemy);
    expect(hurt).toHaveBeenCalledTimes(1);
    expect(hurt.mock.calls[0][0]).toBe(SHIV_DAMAGE);
  });

  it('empties the meter when it fires, so the next bolt costs full price again', () => {
    const holder = createUnit(game, 0);
    const enemy = createUnit(game, 120, 'red');
    game.setPlayer(holder);
    indexObjects(game, [holder, enemy]);
    const charge = armed(holder);

    const swingsToCharge = Math.ceil(ENERGIZED_AT / ENERGIZE_PER_HIT);
    for (let i = 0; i < swingsToCharge; i++) swing(holder, enemy);

    expect(charge.charge).toBe(0);
  });

  it('arcs to nearby enemies, capped, and never to an ally', () => {
    const holder = createUnit(game, 0);
    const victim = createUnit(game, 300, 'red');
    // Four more enemies inside the arc's reach of the victim — one more than
    // the cap, so the cap is doing work.
    const others = [0, 1, 2, 3].map(i => {
      const unit = new Champion({
        game,
        position: createVector(300 + 30 * (i + 1), 40),
        teamId: 'red',
      } as never);
      return unit;
    });
    const ally = new Champion({ game, position: createVector(320, 20), teamId: 'blue' } as never);
    game.setPlayer(holder);
    indexObjects(game, [holder, victim, ally, ...others]);

    armed(holder);
    const spies = others.map(unit => vi.spyOn(unit, 'takeDamage'));
    const allySpy = vi.spyOn(ally, 'takeDamage');

    const swingsToCharge = Math.ceil(ENERGIZED_AT / ENERGIZE_PER_HIT);
    for (let i = 0; i < swingsToCharge; i++) swing(holder, victim);

    const struck = spies.filter(spy => spy.mock.calls.length > 0);
    expect(struck).toHaveLength(CHAIN_TARGETS);
    expect(allySpy).not.toHaveBeenCalled();
    // The probe's own geometry: every candidate above sits well inside the arc.
    expect(CHAIN_RADIUS).toBeGreaterThan(150);
  });

  it('banks nothing from an echoed application', () => {
    const holder = createUnit(game, 0);
    const enemy = createUnit(game, 120, 'red');
    game.setPlayer(holder);
    indexObjects(game, [holder, enemy]);
    const charge = armed(holder);

    for (let i = 0; i < 10; i++) swing(holder, enemy, true);

    expect(charge.charge).toBe(0);
  });
});

describe('Giáp Người Chết', () => {
  let game: TestGame;

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 16);
    game = createGame();
  });

  const armed = (holder: ReturnType<typeof createUnit>) => {
    expect(pressSpell(new Item_DeadMansPlate(holder))).toBe(true);
    return live(holder)[0] as AnyBuff & { momentum: number };
  };

  /** Walk `steps` frames of `perFrame` units, ticking the buff each frame. */
  const walk = (
    holder: ReturnType<typeof createUnit>,
    momentum: AnyBuff,
    steps: number,
    perFrame: number,
    frameMs = 100
  ) => {
    vi.stubGlobal('deltaTime', frameMs);
    for (let i = 0; i < steps; i++) {
      holder.position.set(holder.position.x + perFrame, holder.position.y);
      momentum.update();
    }
  };

  it('builds momentum while the holder walks', () => {
    const holder = createUnit(game, 0);
    game.setPlayer(holder);
    const momentum = armed(holder);

    walk(holder, momentum, 10, 5);

    // Ten frames of 100ms is one second of walking.
    expect(momentum.momentum).toBeCloseTo(MOMENTUM_PER_SECOND, 1);
    expect(MOVEMENT_EPSILON).toBeLessThan(5);
  });

  it('bleeds it away again while the holder stands still', () => {
    const holder = createUnit(game, 0);
    game.setPlayer(holder);
    const momentum = armed(holder);
    walk(holder, momentum, 20, 5);
    const peak = momentum.momentum;

    vi.stubGlobal('deltaTime', 100);
    for (let i = 0; i < 5; i++) momentum.update();

    expect(momentum.momentum).toBeLessThan(peak);
    expect(momentum.momentum).toBeCloseTo(peak - MOMENTUM_DECAY_PER_SECOND * 0.5, 1);
  });

  it('never banks past the cap', () => {
    const holder = createUnit(game, 0);
    game.setPlayer(holder);
    const momentum = armed(holder);

    walk(holder, momentum, 200, 5);

    expect(momentum.momentum).toBe(MAX_MOMENTUM);
  });

  it('makes the holder faster the more of it they carry', () => {
    const holder = createUnit(game, 0);
    game.setPlayer(holder);
    const momentum = armed(holder);
    const still = holder.stats.speed.value;

    walk(holder, momentum, 200, 5);

    expect(holder.stats.speed.value).toBeGreaterThan(still);
    expect(holder.stats.speed.value).toBeCloseTo(still * (1 + SPEED_AT_FULL), 3);
  });

  it('spends the whole meter on one swing, and slows at full charge', () => {
    const holder = createUnit(game, 0);
    const enemy = createUnit(game, 120, 'red');
    game.setPlayer(holder);
    const momentum = armed(holder);
    walk(holder, momentum, 200, 5);

    const hurt = vi.spyOn(enemy, 'takeDamage');
    swing(holder, enemy);

    expect(hurt).toHaveBeenCalledTimes(1);
    expect(hurt.mock.calls[0][0]).toBeCloseTo(IMPACT_DAMAGE_AT_FULL, 3);
    const slow = live(enemy).find(b => b instanceof Slow) as InstanceType<typeof Slow>;
    expect(slow, 'nothing slowed the victim').toBeTruthy();
    expect(slow.percent).toBe(SLOW_PERCENT);
    expect(slow.duration).toBe(SLOW_MS);
    expect(momentum.momentum).toBe(0);
  });

  it('gives back the speed once the meter is spent', () => {
    const holder = createUnit(game, 0);
    const enemy = createUnit(game, 120, 'red');
    game.setPlayer(holder);
    const momentum = armed(holder);
    const still = holder.stats.speed.value;
    walk(holder, momentum, 200, 5);

    swing(holder, enemy);

    expect(holder.stats.speed.value).toBe(still);
  });

  it('adds nothing to a swing thrown from a standstill', () => {
    const holder = createUnit(game, 0);
    const enemy = createUnit(game, 120, 'red');
    game.setPlayer(holder);
    armed(holder);

    const hurt = vi.spyOn(enemy, 'takeDamage');
    swing(holder, enemy);

    expect(hurt).not.toHaveBeenCalled();
    expect(live(enemy)).toHaveLength(0);
  });
});
