import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamId, buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import makeHealthRelic, {
  RELIC_HEAL_SHARE,
  RELIC_PICKUP_RADIUS,
  RELIC_RESPAWN_MS,
  RELIC_ZONE_MS,
  RELIC_ZONE_RADIUS,
  RELIC_ZONE_TICK_MS,
} from '../../structures/HealthRelic';

/**
 * **Cổ Vật Hồi Máu**, and the four things about it that are invisible from the
 * file.
 *
 * It is the first thing this pack stands on the map that is not a body to
 * fight, so every claim here is about a seam rather than a number: that a
 * champion *walking over* it is what takes it, that what it leaves is for that
 * champion's whole side, that it heals through the door a wound can reach, and
 * that it goes away and comes back rather than paying for ever.
 */

const api = buildTestApi();
const makeRelic = makeHealthRelic(api);

let game: TestGame;

/** The relic, on the origin, built the way `Game.spawnJungle` builds one. */
const relicAt = (x = 0, y = 0, r = 0) =>
  makeRelic({ role: 'relic', x, y, r }, game as never) as unknown as {
    update(): void;
    draw(): void;
  };

/**
 * A real `Champion`, because "a champion walks over it" is the rule and the
 * shared `createUnit` fixture builds a bare `AttackableUnit` — a minion is not
 * supposed to be able to take one.
 */
const champion = (teamId: string, x: number) =>
  new api.units.Champion({ game, teamId, position: createVector(x, 0) } as never);

const capture = () => {
  const built: { update(): void; toRemove: boolean }[] = [];
  vi.spyOn(game.objectManager, 'addObject').mockImplementation(object => {
    built.push(object as never);
  });
  return built;
};

/** Run an object for `ms`, at the stubbed frame. */
const run = (object: { update(): void }, ms: number, step = 100): void => {
  vi.stubGlobal('deltaTime', step);
  for (let elapsed = 0; elapsed < ms; elapsed += step) object.update();
};

beforeEach(() => {
  installSpellObjectGlobals();
  installSketchMathGlobals();
  vi.stubGlobal('deltaTime', 100);
  game = createGame() as TestGame;
  // `AttackableUnit.isAllied` asks the world who the player is, and every
  // heal below goes through a unit method that reads it. Parked far off the
  // map and never indexed, so it is in no query here.
  game.setPlayer(createUnit(game, -5_000, TeamId.BLUE));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('taking the relic', () => {
  it('is a champion walking over it, and it leaves a pool behind', () => {
    const relic = relicAt();
    const taker = champion(TeamId.BLUE, 30);
    indexObjects(game as never, [taker] as never);
    const built = capture();

    relic.update();

    expect(built).toHaveLength(1);
  });

  it('is not taken by a body standing just outside it', () => {
    const relic = relicAt();
    const passerby = champion(TeamId.BLUE, RELIC_PICKUP_RADIUS + 60);
    indexObjects(game as never, [passerby] as never);
    const built = capture();

    relic.update();

    expect(built).toHaveLength(0);
  });

  /**
   * A slot carries its own `r` and the map drew that circle for a reason, so a
   * relic on a wide slot is takeable from the edge of it. The constant is only
   * the floor, for a slot drawn as a point.
   */
  it('is takeable from anywhere inside a slot drawn wider than the floor', () => {
    const wide = RELIC_PICKUP_RADIUS + 200;
    const relic = relicAt(0, 0, wide);
    const taker = champion(TeamId.BLUE, wide - 20);
    indexObjects(game as never, [taker] as never);
    const built = capture();

    relic.update();

    expect(built).toHaveLength(1);
  });

  /**
   * And then it is gone. Before this the relic re-fired every frame a champion
   * stood on it, which is not a pickup — it is a fountain.
   */
  it('goes away and comes back on its own clock', () => {
    const relic = relicAt();
    const taker = champion(TeamId.BLUE, 30);
    indexObjects(game as never, [taker] as never);
    const built = capture();

    relic.update();
    expect(built).toHaveLength(1);

    run(relic, RELIC_RESPAWN_MS - 1_000);
    expect(built).toHaveLength(1);

    run(relic, 2_000);
    expect(built).toHaveLength(2);
  });
});

describe('the pool it leaves', () => {
  /** Takes the relic and hands back what it dropped. */
  const poolFrom = (takerTeam: string = TeamId.BLUE) => {
    const relic = relicAt();
    const taker = champion(takerTeam, 30);
    indexObjects(game as never, [taker] as never);
    const built = capture();
    relic.update();
    vi.restoreAllMocks();
    return { pool: built[0], taker };
  };

  const wounded = (x: number, teamId: string) => {
    const unit = createUnit(game, x, teamId);
    unit.stats.maxHealth.baseValue = 1_000;
    unit.stats.health.baseValue = 200;
    return unit;
  };

  it('heals the taker’s whole side, not only the taker', () => {
    const { pool, taker } = poolFrom();
    const ally = wounded(120, TeamId.BLUE);
    taker.stats.maxHealth.baseValue = 1_000;
    taker.stats.health.baseValue = 200;
    indexObjects(game as never, [taker, ally] as never);

    run(pool, 100); // the pool pays on the frame it opens

    // A share of each body's own maximum, which is the point of a share: the
    // ally and the taker are different sizes in this pack's roster.
    expect(ally.stats.health.value).toBe(200 + Math.round(1_000 * RELIC_HEAL_SHARE));
    expect(taker.stats.health.value).toBeGreaterThan(200);
  });

  it('leaves the other side standing in it with nothing', () => {
    const { pool } = poolFrom();
    const enemy = wounded(120, TeamId.RED);
    indexObjects(game as never, [enemy] as never);

    run(pool, 100); // the pool pays on the frame it opens

    expect(enemy.stats.health.value).toBe(200);
  });

  it('does not reach a body standing outside it', () => {
    const { pool } = poolFrom();
    const far = wounded(RELIC_ZONE_RADIUS + 200, TeamId.BLUE);
    indexObjects(game as never, [far] as never);

    run(pool, 100); // the pool pays on the frame it opens

    expect(far.stats.health.value).toBe(200);
  });

  /**
   * Through `takeHeal`, never `stats.health.baseValue`. A relic that put the
   * points back by hand would heal exactly the same and be the one heal in the
   * game that no Vết Thương Sâu in the shop can argue with — invisibly.
   */
  it('heals through the door a wound can reach', () => {
    const { pool } = poolFrom();
    const cut = wounded(120, TeamId.BLUE);
    const enemy = createUnit(game, 400, TeamId.RED);
    const wound = new api.buffs.HealCut(10_000, enemy, cut);
    wound.healCut = 0.5;
    cut.addBuff(wound);
    indexObjects(game as never, [cut, enemy] as never);

    run(pool, 100); // the pool pays on the frame it opens

    const full = Math.round(1_000 * RELIC_HEAL_SHARE);
    expect(cut.stats.health.value - 200).toBeLessThan(full);
    expect(cut.stats.health.value).toBeGreaterThan(200);
  });

  it('pays once per tick, and stops when it is spent', () => {
    const { pool } = poolFrom();
    const ally = wounded(120, TeamId.BLUE);
    indexObjects(game as never, [ally] as never);

    run(pool, RELIC_ZONE_MS + 1_000);

    const perTick = Math.round(1_000 * RELIC_HEAL_SHARE);
    const ticks = Math.floor(RELIC_ZONE_MS / RELIC_ZONE_TICK_MS);
    expect(ally.stats.health.value).toBe(200 + perTick * ticks);
    expect(pool.toRemove).toBe(true);
  });
});
