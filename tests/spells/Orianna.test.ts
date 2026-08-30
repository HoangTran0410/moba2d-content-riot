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

import Orianna_Q, {
  BALL_FLIGHT_SPEED,
  BALL_ORBIT_RADIUS,
  BALL_PASS_DAMAGE,
  COOLDOWN_MS as Q_COOLDOWN_MS,
  MANA_COST as Q_MANA_COST,
  LEASH_RANGE,
  MAX_REACH,
  Orianna_Ball,
  ballFor,
} from '../../spells/Orianna_Q';
import Orianna_W, {
  COOLDOWN_MS as W_COOLDOWN_MS,
  DAMAGE as W_DAMAGE,
  FIELD_DURATION_MS,
  MANA_COST as W_MANA_COST,
  Orianna_W_Field,
  RADIUS as W_RADIUS,
  SLOW_DURATION_MS,
  SLOW_PERCENT,
  SLOW_STACK_ID,
  SPEEDUP_DURATION_MS,
  SPEEDUP_PERCENT,
  SPEEDUP_STACK_ID,
} from '../../spells/Orianna_W';
import Orianna_E, {
  COOLDOWN_MS as E_COOLDOWN_MS,
  MANA_COST as E_MANA_COST,
  RANGE as E_RANGE,
  SHIELD_AMOUNT,
  SHIELD_DURATION_MS,
  SHIELD_STACK_ID,
} from '../../spells/Orianna_E';
import Orianna_R, {
  AIRBORNE_DURATION_MS,
  COOLDOWN_MS as R_COOLDOWN_MS,
  DAMAGE as R_DAMAGE,
  MANA_COST as R_MANA_COST,
  Orianna_R_Shockwave,
  PULL_STOP_DISTANCE,
  RADIUS as R_RADIUS,
  WINDUP_MS,
} from '../../spells/Orianna_R';

const testApi = buildTestApi();
const { Airborne, Dash, Shield, Slow, Speedup } = testApi.buffs;

type Unit = ReturnType<typeof createUnit>;
type AnyBuff = Unit['buffs'][number];

const live = (target: Unit): AnyBuff[] => target.buffs.filter(buff => !buff.toRemove);

/** A bare unit with the pack's ~100 point pool, placed on the x axis. */
function unit(game: TestGame, x: number, teamId: string): Unit {
  const result = createUnit(game, x, teamId);
  result.collisionRadius = 5;
  result.stats.maxHealth.baseValue = 100;
  result.stats.health.baseValue = 100;
  result.animatedValues.displaySize = 40;
  return result;
}

/** Tick an object until it says it is done, or give up so a bug cannot hang the suite. */
function tickUntil(object: { update: () => void }, done: () => boolean, limit = 500): void {
  for (let i = 0; i < limit && !done(); i++) object.update();
}

function ballsInWorld(game: TestGame): Orianna_Ball[] {
  const seen: Orianna_Ball[] = [];
  for (const object of [...game.objectManager._objectToBeAdd, ...game.objectManager.objects]) {
    if (object instanceof Orianna_Ball) seen.push(object);
  }
  return seen;
}

/** `Array.filter` only narrows through a predicate, and the assertions read fields. */
const buffsOfType = <T extends AnyBuff>(
  target: Unit,
  Kind: abstract new (...args: never[]) => T
): T[] => live(target).filter(buff => buff instanceof Kind) as T[];

const findField = (game: TestGame): Orianna_W_Field | undefined =>
  game.objectManager._objectToBeAdd.find(
    (object): object is Orianna_W_Field => object instanceof Orianna_W_Field
  );

const findShockwave = (game: TestGame): Orianna_R_Shockwave | undefined =>
  game.objectManager._objectToBeAdd.find(
    (object): object is Orianna_R_Shockwave => object instanceof Orianna_R_Shockwave
  );

describe('Orianna — Quả Cầu (the Ball)', () => {
  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 250);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is created once on the first command and reused by every command after it', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const ally = unit(game, 120, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner, ally]);

    expect(ballsInWorld(game)).toHaveLength(0);

    expect(pressSpell(new Orianna_Q(owner), { at: { x: 200, y: 0 } })).toBe(true);
    const ball = ballFor(owner);
    expect(ballsInWorld(game)).toHaveLength(1);

    expect(pressSpell(new Orianna_W(owner))).toBe(true);
    expect(pressSpell(new Orianna_E(owner), { target: ally })).toBe(true);
    expect(pressSpell(new Orianna_Q(owner), { at: { x: -200, y: 0 } })).toBe(true);

    expect(ballsInWorld(game)).toHaveLength(1);
    expect(ballFor(owner)).toBe(ball);
  });

  it('starts carried by Orianna, orbiting her body rather than sitting on it', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner]);

    const ball = ballFor(owner);
    expect(ball.isCarried).toBe(true);
    expect(ball.carrier).toBe(owner);

    ball.update();
    expect(ball.position.dist(owner.position)).toBeCloseTo(BALL_ORBIT_RADIUS, 5);

    owner.position.set(400, 0);
    ball.update();
    expect(ball.position.dist(owner.position)).toBeCloseTo(BALL_ORBIT_RADIUS, 5);
    expect(ball.position.x).toBeGreaterThan(300);
  });

  /**
   * The leash was dropped once, on the grounds that a Ball teleporting home
   * mid-fight is an invisible rule for a player to lose a duel to. That was
   * right about the danger and wrong about the cure: without one, walking away
   * from a placed Ball left Orianna with *no abilities at all* and nothing on
   * screen to say why, since W, E and R all fire from the Ball. The cure is a
   * drawn tether, not an absent rule.
   */
  describe('the leash', () => {
    const placed = (game: TestGame, owner: Unit, x: number) => {
      const ball = ballFor(owner);
      ball.carrier = null;
      ball.position.set(x, 0);
      return ball;
    };

    it('comes home when she walks past the limit', () => {
      const game = createGame();
      const owner = unit(game, 0, 'blue');
      game.setPlayer(owner);
      indexObjects(game, [owner]);

      const ball = placed(game, owner, LEASH_RANGE + 10);
      ball.update();

      expect(ball.isCarried, 'the Ball stayed out past its tether').toBe(true);
      expect(ball.carrier).toBe(owner);
      expect(ball.position.dist(owner.position)).toBeCloseTo(BALL_ORBIT_RADIUS, 5);
    });

    it('stays put anywhere inside it, including at full Q range', () => {
      const game = createGame();
      const owner = unit(game, 0, 'blue');
      game.setPlayer(owner);
      indexObjects(game, [owner]);

      // Placing the Ball at maximum throw and standing still must never snap
      // it — the leash is about walking away, not about throwing far.
      const ball = placed(game, owner, MAX_REACH);
      ball.update();

      expect(ball.isPlaced).toBe(true);
      expect(ball.position.x).toBe(MAX_REACH);
    });

    it('does not sweep damage on the way back', () => {
      const game = createGame();
      const owner = unit(game, 0, 'blue');
      const victim = unit(game, LEASH_RANGE / 2, 'red');
      game.setPlayer(owner);
      indexObjects(game, [owner, victim]);
      const before = victim.stats.health.value;

      const ball = placed(game, owner, LEASH_RANGE + 10);
      ball.update();

      // A flight home would deal Q's pass-through damage to everything in
      // between: a free line of damage for walking backwards.
      expect(victim.stats.health.value, 'the recall hurt somebody').toBe(before);
    });

    it('leaves a Ball an ally is carrying alone, however far she walks', () => {
      const game = createGame();
      const owner = unit(game, 0, 'blue');
      const ally = unit(game, 2_000, 'blue');
      game.setPlayer(owner);
      indexObjects(game, [owner, ally]);

      const ball = ballFor(owner);
      ball.carrier = ally;
      ball.update();

      // She sent it there on purpose. Only a *placed* Ball is leashed.
      expect(ball.carrier).toBe(ally);
    });

    it('reports how stretched the tether is, which is what the drawing reads', () => {
      const game = createGame();
      const owner = unit(game, 0, 'blue');
      game.setPlayer(owner);
      indexObjects(game, [owner]);

      const ball = placed(game, owner, LEASH_RANGE / 2);
      expect(ball.leashStrain()).toBeCloseTo(0.5, 5);

      ball.carrier = owner;
      expect(ball.leashStrain(), 'a carried Ball has nothing to stretch').toBe(0);
    });
  });

  it('leaves the world when Orianna dies, instead of drawing on her corpse', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner]);

    const ball = ballFor(owner);
    ball.update();
    expect(ball.toRemove).toBe(false);

    owner.deathData = { reviveAfter: 5_000 };
    ball.update();

    expect(ball.toRemove).toBe(true);
    expect(ball.isCarried).toBe(false);
  });
});

describe('Orianna Q — Lệnh: Tấn Công', () => {
  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 250);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ships the tuning the catalogue reads', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);

    const spell = new Orianna_Q(owner);
    expect(spell.coolDown).toBe(Q_COOLDOWN_MS);
    expect(spell.manaCost).toBe(Q_MANA_COST);
    expect(spell.range).toBe(MAX_REACH);
  });

  it('flies the Ball to the aim point and leaves it standing there', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner]);

    expect(pressSpell(new Orianna_Q(owner), { at: { x: 300, y: 0 } })).toBe(true);
    const ball = ballFor(owner);

    // a real travel, not a teleport: it is in the air the frame after the cast
    ball.update();
    expect(ball.isFlying).toBe(true);
    expect(ball.position.x).toBeLessThan(300);

    tickUntil(ball, () => ball.isPlaced);
    expect(ball.isPlaced).toBe(true);
    expect(ball.carrier).toBe(null);
    expect(ball.position.x).toBeCloseTo(300, 5);
    expect(ball.position.y).toBeCloseTo(0, 5);
  });

  it('clamps the destination to the Ball reach from Orianna', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner]);

    expect(pressSpell(new Orianna_Q(owner), { at: { x: 4_000, y: 0 } })).toBe(true);
    const ball = ballFor(owner);
    tickUntil(ball, () => ball.isPlaced);

    expect(ball.position.dist(owner.position)).toBeCloseTo(MAX_REACH, 5);
  });

  it('damages each enemy the flight passes exactly once, and never an ally', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const enemy = unit(game, 150, 'red');
    const ally = unit(game, 220, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner, enemy, ally]);

    const hurt = vi.spyOn(enemy, 'takeDamage');
    const spared = vi.spyOn(ally, 'takeDamage');
    const self = vi.spyOn(owner, 'takeDamage');

    expect(pressSpell(new Orianna_Q(owner), { at: { x: 400, y: 0 } })).toBe(true);
    const ball = ballFor(owner);
    tickUntil(ball, () => ball.isPlaced);

    expect(hurt).toHaveBeenCalledTimes(1);
    expect(hurt.mock.calls[0]!.slice(0, 3)).toEqual([BALL_PASS_DAMAGE, owner, 'MAGIC']);
    expect(hurt.mock.calls[0]![3]).toEqual(expect.any(String));
    expect(spared).not.toHaveBeenCalled();
    expect(self).not.toHaveBeenCalled();
  });

  it('covers the whole path: a step is never wider than the Ball it moves', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const enemy = unit(game, 200, 'red');
    game.setPlayer(owner);
    indexObjects(game, [owner, enemy]);

    const hurt = vi.spyOn(enemy, 'takeDamage');
    expect(pressSpell(new Orianna_Q(owner), { at: { x: 400, y: 0 } })).toBe(true);
    const ball = ballFor(owner);

    let steps = 0;
    let previous = ball.position.copy();
    tickUntil(ball, () => {
      const moved = ball.position.dist(previous);
      if (moved > 0) steps += 1;
      expect(moved).toBeLessThanOrEqual(BALL_FLIGHT_SPEED + 0.001);
      previous = ball.position.copy();
      return ball.isPlaced;
    });

    expect(steps).toBeGreaterThan(10);
    expect(hurt).toHaveBeenCalledTimes(1);
  });
});

describe('Orianna W — Lệnh: Phát Sóng', () => {
  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 250);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ships the tuning the catalogue reads', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);

    const spell = new Orianna_W(owner);
    expect(spell.coolDown).toBe(W_COOLDOWN_MS);
    expect(spell.manaCost).toBe(W_MANA_COST);
  });

  it('pulses at the Ball, not at Orianna', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const byTheBall = unit(game, 330, 'red');
    const byOrianna = unit(game, -50, 'red');
    game.setPlayer(owner);
    indexObjects(game, [owner, byTheBall, byOrianna]);

    expect(pressSpell(new Orianna_Q(owner), { at: { x: 300, y: 0 } })).toBe(true);
    const ball = ballFor(owner);
    tickUntil(ball, () => ball.isPlaced);

    const hurt = vi.spyOn(byTheBall, 'takeDamage');
    const spared = vi.spyOn(byOrianna, 'takeDamage');

    expect(pressSpell(new Orianna_W(owner))).toBe(true);
    const field = findField(game);
    expect(field).toBeTruthy();
    expect(field!.position.x).toBeCloseTo(300, 5);
    expect(field!.radius).toBe(W_RADIUS);

    field!.update();
    expect(hurt).toHaveBeenCalledTimes(1);
    expect(hurt.mock.calls[0]!.slice(0, 3)).toEqual([W_DAMAGE, owner, 'MAGIC']);
    expect(spared).not.toHaveBeenCalled();
  });

  it('slows enemies inside without the slow compounding over the linger', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const enemy = unit(game, 60, 'red');
    game.setPlayer(owner);
    indexObjects(game, [owner, enemy]);

    const hurt = vi.spyOn(enemy, 'takeDamage');
    expect(pressSpell(new Orianna_W(owner))).toBe(true);
    const field = findField(game);
    expect(field).toBeTruthy();

    tickUntil(field!, () => field!.toRemove);

    const slows = buffsOfType(enemy, Slow);
    expect(slows).toHaveLength(1);
    expect(slows[0]!.percent).toBe(SLOW_PERCENT);
    expect(slows[0]!.duration).toBe(SLOW_DURATION_MS);
    expect(slows[0]!.stackId).toBe(SLOW_STACK_ID);
    expect(slows[0]!.buffAddType).toBe(testApi.enums.BuffAddType.RENEW_EXISTING);

    // the damage is a pulse, not a damage-over-time zone
    expect(hurt).toHaveBeenCalledTimes(1);
  });

  it('hastes allies standing in it, Orianna included, without stacking', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const ally = unit(game, 80, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner, ally]);

    const spared = vi.spyOn(ally, 'takeDamage');
    const self = vi.spyOn(owner, 'takeDamage');

    expect(pressSpell(new Orianna_W(owner))).toBe(true);
    const field = findField(game);
    expect(field).toBeTruthy();
    tickUntil(field!, () => field!.toRemove);

    for (const friend of [owner, ally]) {
      const hastes = buffsOfType(friend, Speedup);
      expect(hastes).toHaveLength(1);
      expect(hastes[0]!.percent).toBe(SPEEDUP_PERCENT);
      expect(hastes[0]!.duration).toBe(SPEEDUP_DURATION_MS);
      expect(hastes[0]!.stackId).toBe(SPEEDUP_STACK_ID);
      expect(hastes[0]!.buffAddType).toBe(testApi.enums.BuffAddType.RENEW_EXISTING);
      expect(buffsOfType(friend, Slow)).toHaveLength(0);
    }

    expect(spared).not.toHaveBeenCalled();
    expect(self).not.toHaveBeenCalled();
  });

  it('closes the field once its linger is spent', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner]);

    expect(pressSpell(new Orianna_W(owner))).toBe(true);
    const field = findField(game);
    expect(field).toBeTruthy();

    let elapsed = 0;
    while (elapsed < FIELD_DURATION_MS - 250) {
      field!.update();
      elapsed += 250;
      expect(field!.toRemove).toBe(false);
    }
    tickUntil(field!, () => field!.toRemove, 8);
    expect(field!.toRemove).toBe(true);
  });
});

describe('Orianna E — Lệnh: Bảo Vệ', () => {
  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 250);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ships the tuning the catalogue reads and only ever aims at allies', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);

    const spell = new Orianna_E(owner);
    expect(spell.coolDown).toBe(E_COOLDOWN_MS);
    expect(spell.manaCost).toBe(E_MANA_COST);
    expect(spell.range).toBe(E_RANGE);
    expect(spell.targetingRequest.targetTeam).toBe('ALLY');
    expect(spell.castSpec.targeting).toBe('UNIT');
  });

  it('refuses an enemy target', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const enemy = unit(game, 120, 'red');
    game.setPlayer(owner);
    indexObjects(game, [owner, enemy]);

    expect(pressSpell(new Orianna_E(owner), { target: enemy })).toBe(false);
  });

  it('flies the Ball to the ally and then rides that ally', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const ally = unit(game, 300, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner, ally]);

    expect(pressSpell(new Orianna_E(owner), { target: ally })).toBe(true);
    const ball = ballFor(owner);

    ball.update();
    expect(ball.isFlying).toBe(true);

    tickUntil(ball, () => ball.isCarried && ball.carrier === ally);
    expect(ball.carrier).toBe(ally);
    expect(ball.isCarried).toBe(true);
    expect(ball.position.dist(ally.position)).toBeCloseTo(BALL_ORBIT_RADIUS, 5);

    // and from then on the Ball is wherever that ally is
    ally.position.set(-500, 40);
    ball.update();
    expect(ball.position.dist(ally.position)).toBeCloseTo(BALL_ORBIT_RADIUS, 5);
    expect(ball.position.dist(owner.position)).toBeGreaterThan(400);
  });

  it('shields the ally when the Ball arrives, in its own stack pool', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const ally = unit(game, 300, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner, ally]);

    expect(pressSpell(new Orianna_E(owner), { target: ally })).toBe(true);
    const ball = ballFor(owner);

    ball.update();
    expect(buffsOfType(ally, Shield)).toHaveLength(0);

    tickUntil(ball, () => ball.carrier === ally);

    const shields = buffsOfType(ally, Shield);
    expect(shields).toHaveLength(1);
    expect(shields[0]!.amount).toBe(SHIELD_AMOUNT);
    expect(shields[0]!.duration).toBe(SHIELD_DURATION_MS);
    expect(shields[0]!.stackId).toBe(SHIELD_STACK_ID);
  });

  it('damages enemies the flight passes, once each, and never the ally it protects', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const enemy = unit(game, 180, 'red');
    const ally = unit(game, 360, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner, enemy, ally]);

    const hurt = vi.spyOn(enemy, 'takeDamage');
    const spared = vi.spyOn(ally, 'takeDamage');

    expect(pressSpell(new Orianna_E(owner), { target: ally })).toBe(true);
    const ball = ballFor(owner);
    tickUntil(ball, () => ball.carrier === ally);

    expect(hurt).toHaveBeenCalledTimes(1);
    expect(hurt.mock.calls[0]!.slice(0, 3)).toEqual([BALL_PASS_DAMAGE, owner, 'MAGIC']);
    expect(spared).not.toHaveBeenCalled();
  });
});

describe('Orianna R — Lệnh: Sóng Âm', () => {
  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 250);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ships the tuning the catalogue reads, inside the seam ceiling', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);

    const spell = new Orianna_R(owner);
    expect(spell.coolDown).toBe(R_COOLDOWN_MS);
    expect(spell.coolDown).toBeLessThanOrEqual(10_000);
    expect(spell.manaCost).toBe(R_MANA_COST);
  });

  it('telegraphs before it lands, so the radius can be walked out of', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const enemy = unit(game, 120, 'red');
    game.setPlayer(owner);
    indexObjects(game, [owner, enemy]);

    const hurt = vi.spyOn(enemy, 'takeDamage');
    expect(pressSpell(new Orianna_R(owner))).toBe(true);
    const wave = findShockwave(game);
    expect(wave).toBeTruthy();
    expect(wave!.radius).toBe(R_RADIUS);

    let elapsed = 0;
    while (elapsed + 250 < WINDUP_MS) {
      wave!.update();
      elapsed += 250;
      expect(hurt).not.toHaveBeenCalled();
    }

    wave!.update();
    expect(hurt).toHaveBeenCalledTimes(1);
    expect(hurt.mock.calls[0]!.slice(0, 3)).toEqual([R_DAMAGE, owner, 'MAGIC']);
  });

  it('detonates around the Ball, not around Orianna, and hits each enemy once', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const byTheBall = unit(game, 450, 'red');
    const byOrianna = unit(game, -100, 'red');
    game.setPlayer(owner);
    indexObjects(game, [owner, byTheBall, byOrianna]);

    expect(pressSpell(new Orianna_Q(owner), { at: { x: 300, y: 0 } })).toBe(true);
    const ball = ballFor(owner);
    tickUntil(ball, () => ball.isPlaced);

    const hurt = vi.spyOn(byTheBall, 'takeDamage');
    const spared = vi.spyOn(byOrianna, 'takeDamage');

    expect(pressSpell(new Orianna_R(owner))).toBe(true);
    const wave = findShockwave(game);
    expect(wave).toBeTruthy();
    expect(wave!.position.x).toBeCloseTo(300, 5);

    tickUntil(wave!, () => wave!.toRemove);

    expect(hurt).toHaveBeenCalledTimes(1);
    expect(spared).not.toHaveBeenCalled();
  });

  it('hauls its victims inward, ending them a fixed distance from the Ball', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const victim = unit(game, 450, 'red');
    game.setPlayer(owner);
    indexObjects(game, [owner, victim]);

    expect(pressSpell(new Orianna_Q(owner), { at: { x: 300, y: 0 } })).toBe(true);
    const ball = ballFor(owner);
    tickUntil(ball, () => ball.isPlaced);

    expect(pressSpell(new Orianna_R(owner))).toBe(true);
    const wave = findShockwave(game);
    expect(wave).toBeTruthy();
    tickUntil(wave!, () => victim.buffs.some(buff => buff instanceof Dash));

    const haul = buffsOfType(victim, Dash)[0];
    expect(haul).toBeTruthy();
    expect(haul!.dashDestination).toBeTruthy();

    const startGap = victim.position.dist(ball.position);
    const endGap = haul!.dashDestination!.dist(ball.position);
    expect(endGap).toBeCloseTo(PULL_STOP_DISTANCE, 5);
    expect(endGap).toBeLessThan(startGap);

    const lifted = buffsOfType(victim, Airborne)[0];
    expect(lifted).toBeTruthy();
    expect(lifted!.duration).toBe(AIRBORNE_DURATION_MS);
  });

  it('leaves allies and Orianna herself alone', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    const ally = unit(game, 90, 'blue');
    game.setPlayer(owner);
    indexObjects(game, [owner, ally]);

    const spared = vi.spyOn(ally, 'takeDamage');
    const self = vi.spyOn(owner, 'takeDamage');

    expect(pressSpell(new Orianna_R(owner))).toBe(true);
    const wave = findShockwave(game);
    expect(wave).toBeTruthy();
    tickUntil(wave!, () => wave!.toRemove);

    expect(spared).not.toHaveBeenCalled();
    expect(self).not.toHaveBeenCalled();
    expect(buffsOfType(ally, Airborne)).toHaveLength(0);
  });
});
