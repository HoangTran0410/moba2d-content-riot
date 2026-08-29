import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import { data } from '../../pack';
import makeDragonAbilities, {
  ELEMENTS,
  RITE,
  WINGBEAT,
  elementFor,
  resetDragonRotation,
} from '../../monsters/Dragon';

/**
 * The dragon's kit — the wingbeat every drake has, and the rite each element
 * does instead of the others.
 *
 * Driven through the real `Monster` wherever the timing matters: the wingbeat
 * has to fire on the *first frame of the fight* (which it gets for free from
 * `_abilityCooldowns` starting at zero), and it has to throw only after its
 * telegraph. Calling `cast` by hand would prove neither. Tuning arrives as
 * imported constants so retuning is not editing a test.
 */

const api = buildTestApi();
const { Champion, Monster } = api.units;

type ChampionInstance = InstanceType<typeof Champion>;
type MonsterInstance = InstanceType<typeof Monster>;

const PIT = { x: 0, y: 0, r: 100 };

let game: TestGame;

/**
 * The camp object is the pit's *identity*: `elementFor`/`rotation` key on it
 * by reference, exactly as `Monster.alertCamp` matches packmates. A spread
 * copy here would give every drake its own private rotation and quietly make
 * half this file test nothing.
 */
const dragon = (camp: { x: number; y: number; r: number } = PIT): MonsterInstance =>
  new Monster({
    game,
    preset: {
      // The shipped body, not a hand-rolled copy of it: speed, reach and the
      // leash are exactly what this file is about, and a local fixture would
      // go on passing after `data.ts` moved any of them. Only `camp` and
      // `abilities` are supplied here — a slot's position is the map's, and a
      // kit is the pack's code half, neither of which lives in `data.ts`.
      ...data.monsters!.dragon.members[0],
      camp,
      reviveTime: 100,
      abilities: makeDragonAbilities(api),
    },
  } as never);

const champion = (x: number, y = 0, teamId = 'blue'): ChampionInstance =>
  new Champion({ game, position: createVector(x, y), teamId } as never);

/** Everything in the world, settled or not — `addObject` parks in the queue. */
const everything = (): { update?(): void; draw?(): void }[] => {
  const manager = game.objectManager as unknown as {
    objects: unknown[];
    _objectToBeAdd: unknown[];
  };
  return [...manager.objects, ...manager._objectToBeAdd] as { update?(): void }[];
};

/** One frame of the whole world: the camp, then everything it has spawned. */
const tick = (monster: MonsterInstance, frames = 1): void => {
  for (let frame = 0; frame < frames; frame += 1) {
    monster.update();
    for (const object of everything()) if (object !== monster) object.update?.();
  }
};

/** Frames needed to cover `ms` at the stubbed 16ms per frame. */
const framesFor = (ms: number): number => Math.ceil(ms / 16) + 2;

const engage = (monster: MonsterInstance, target: ChampionInstance): void => {
  indexObjects(game as never, [monster, target] as never);
  monster.aggroOn(target as never);
};

beforeEach(() => {
  installSpellObjectGlobals();
  installSketchMathGlobals();
  vi.stubGlobal('deltaTime', 16);
  vi.stubGlobal('frameCount', 0);
  // The pit ring is drawn in one case below, to pin that it paints from the
  // *camp* and never from the body — a ring reading `owner.animatedValues`
  // would throw over a corpse, which is the one moment it has to work.
  for (const name of ['push', 'pop', 'noFill', 'stroke', 'strokeWeight', 'circle', 'arc']) {
    vi.stubGlobal(name, () => {});
  }
  vi.stubGlobal('TWO_PI', Math.PI * 2);
  game = createGame();
  // `Monster.update` reaches for the player; every camp in this pack's suites
  // is driven with one seated.
  game.setPlayer(champion(5_000, 5_000, 'player-uuid') as never);
  resetDragonRotation(PIT);
});

describe('the wingbeat', () => {
  it('answers the very first frame of the fight, without being scheduled', () => {
    // `Monster._abilityCooldowns` starts at zero and `castAbility` runs before
    // the reach check, so "hit it and it rears up" costs no trigger of its own.
    const boss = dragon();
    const victim = champion(200);
    const health = victim.stats.health.value;
    engage(boss, victim);

    tick(boss, 1);

    // Nothing has landed — the opener is a telegraph, not a hit — but the pit
    // already holds something besides its own ring. Asserted on behaviour
    // rather than on the cast object's fields, so renaming one does not
    // rewrite the claim.
    expect(victim.stats.health.value, 'the fight opened with damage').toBe(health);
    expect(everything().filter(object => object instanceof api.SpellObject)).toHaveLength(2);
  });

  it('throws only after its telegraph, not on the frame it starts', () => {
    const boss = dragon();
    const victim = champion(200);
    engage(boss, victim);

    // Asserted on where the champion *is*, not on whether a `Dash` is still
    // attached: the dash ends as soon as it arrives, so a buff check is a race
    // against its own travel time and would flip on any retune of `landing`.
    const start = victim.position.x;

    tick(boss, framesFor(WINGBEAT.telegraphMs - 60));
    expect(victim.position.x, 'the beat landed during its own wind-up').toBe(start);

    tick(boss, framesFor(400));
    expect(victim.position.x).toBeGreaterThan(start);
  });

  it('lands them inside its own reach, so a rooted boss keeps fighting', () => {
    // The beat used to throw to 560 while the dragon reaches about 390, which
    // made its signature ability the thing that ended its own fight.
    const boss = dragon();
    const victim = champion(150);
    engage(boss, victim);
    const reach = boss.attackRange + boss.stats.size.value / 2 + victim.stats.size.value / 2;

    expect(WINGBEAT.landing).toBeLessThan(reach);
    // And outward for everyone it can catch, never dragged in.
    expect(WINGBEAT.landing).toBeGreaterThan(WINGBEAT.radius);
  });

  it('throws them out of the pit rather than up in the air', () => {
    // Baron's `SLAM` already owns airborne. The dragon's price is the walk
    // back, so what has to be true is the destination, not a status flag.
    const boss = dragon();
    const victim = champion(200);
    engage(boss, victim);

    tick(boss, framesFor(WINGBEAT.telegraphMs + 60));

    const dash = victim.buffs.find(buff => buff instanceof api.buffs.Dash);
    expect(dash, 'nothing threw the champion').toBeTruthy();
    const landing = (dash as unknown as { dashDestination: { x: number; y: number } })
      .dashDestination;
    expect(Math.hypot(landing.x - PIT.x, landing.y - PIT.y)).toBeCloseTo(WINGBEAT.landing, 0);
    // Outward: further from the pit than where they were standing.
    expect(landing.x).toBeGreaterThan(victim.position.x);
    expect(victim.buffs.some(buff => buff instanceof api.buffs.Airborne)).toBe(false);
  });

  it('costs health as well as position', () => {
    const boss = dragon();
    const victim = champion(200);
    const health = victim.stats.health.value;
    engage(boss, victim);

    tick(boss, framesFor(WINGBEAT.telegraphMs + 60));

    expect(victim.stats.health.value).toBeLessThan(health);
  });

  it('throws a champion standing on its exact centre somewhere real', () => {
    // A direction is never allowed to be (0, 0) — the normalise would hand
    // `Dash` a NaN destination and the champion would simply stop existing
    // anywhere the camera could find.
    const boss = dragon();
    const victim = champion(0, 0);
    engage(boss, victim);

    tick(boss, framesFor(WINGBEAT.telegraphMs + 60));

    const dash = victim.buffs.find(buff => buff instanceof api.buffs.Dash);
    const landing = (dash as unknown as { dashDestination: { x: number; y: number } })
      .dashDestination;
    expect(Number.isFinite(landing.x)).toBe(true);
    expect(Number.isFinite(landing.y)).toBe(true);
  });
});

describe('the drake walks', () => {
  it('follows a target that steps out of reach, unlike the pack\'s other bosses', () => {
    // Baron and Vilemaw are `speed: 0` scenery. This one is the objective a
    // match rotates around every minute, and standing still made backing off
    // one step a way to leave the fight.
    const boss = dragon();
    const victim = champion(200);
    engage(boss, victim);
    const start = boss.position.x;

    victim.position.set(600, 0);
    tick(boss, 20);

    expect(boss.hasLegs, 'the drake is still scenery').toBe(true);
    expect(boss.position.x).toBeGreaterThan(start);
  });

  it('but cannot be pulled out of the pit it is guarding', () => {
    // Legs used to mean hookable — `isImmovable` was `speed === 0` and
    // nothing else. A boss any grab can relocate is not guarding anything.
    const boss = dragon();
    const thresh = champion(400, 0, 'red');
    indexObjects(game as never, [boss, thresh] as never);
    const start = boss.position.x;

    const grab = new api.buffs.Dash(1_000, thresh as never, boss as never);
    grab.dashDestination = createVector(2_000, 0);
    grab.showTrail = false;
    boss.addBuff(grab as never);
    boss.updateBuffs();

    expect(boss.isImmovable).toBe(true);
    expect(boss.position.x).toBe(start);
  });

  it('but holds a shorter leash than the jungle around it', () => {
    // `max(camp.r, aggroRange) + chaseMargin`. On the default margin a body
    // with legs and 400 of aggro would follow you 750px off its pit, which on
    // this map is into a lane.
    const boss = dragon();

    expect(boss.chaseLeashRange()).toBeLessThan(600);
  });
});

describe('the rite each drake performs', () => {
  /** Casts the second ability by hand: which element is up is the subject. */
  const rite = (boss: MonsterInstance, target: ChampionInstance): void => {
    const abilities = makeDragonAbilities(api);
    abilities[1].cast(boss as never, target as never);
  };

  /** Rotates the shared pit forward to the element with this id. */
  const rotateTo = (id: string): void => {
    resetDragonRotation(PIT);
    for (let step = 0; step < ELEMENTS.length; step += 1) {
      if (elementFor(PIT).id === id) return;
      // The rotation only advances on a kill, which is the seam that owns it.
      const boss = dragon();
      boss.takeDamage(9_999, champion(0, 0) as never);
    }
    expect(elementFor(PIT).id, `never reached ${id}`).toBe(id);
  };

  it('burns, when it is the fire drake', () => {
    rotateTo('infernal');
    const boss = dragon();
    const victim = champion(200);

    rite(boss, victim);

    const burn = victim.buffs.find(buff => buff instanceof api.buffs.DamageOverTime);
    expect(burn, 'the fire drake left no brand').toBeTruthy();
    expect(burn!.duration).toBe(RITE.infernal.durationMs);
  });

  it('heals itself, when it is the water drake', () => {
    // Nothing else in this pack heals. It turns the pit into a damage check,
    // which is the whole reason four fights beats four damage numbers.
    rotateTo('ocean');
    const boss = dragon();
    boss.takeDamage(300, champion(0, 0) as never);
    const wounded = boss.stats.health.value;

    rite(boss, champion(200));

    expect(boss.stats.health.value).toBeGreaterThan(wounded);
  });

  it('slows everyone in the pit, when it is the wind drake', () => {
    rotateTo('cloud');
    const boss = dragon();
    const near = champion(150);
    const far = champion(2_000);
    indexObjects(game as never, [boss, near, far] as never);

    rite(boss, near);

    expect(near.buffs.some(buff => buff instanceof api.buffs.Slow)).toBe(true);
    expect(far.buffs.some(buff => buff instanceof api.buffs.Slow)).toBe(false);
  });

  it('hardens itself, when it is the earth drake', () => {
    rotateTo('mountain');
    const boss = dragon();

    rite(boss, champion(200));

    const shell = boss.buffs.find(buff => buff instanceof api.buffs.Shield);
    expect(shell, 'the earth drake put up nothing').toBeTruthy();
    expect((shell as unknown as { amount: number }).amount).toBe(RITE.mountain.shield);
  });

  it('never does two elements at once', () => {
    rotateTo('mountain');
    const boss = dragon();
    const victim = champion(200);
    indexObjects(game as never, [boss, victim] as never);

    rite(boss, victim);

    expect(victim.buffs.some(buff => buff instanceof api.buffs.Slow)).toBe(false);
    expect(victim.buffs.some(buff => buff instanceof api.buffs.DamageOverTime)).toBe(false);
  });
});

describe('the pit wears the element it is holding', () => {
  const rings = (): { camp?: { r: number } }[] =>
    everything().filter(
      object => (object as { camp?: unknown }).camp !== undefined && object instanceof api.SpellObject
    ) as { camp?: { r: number } }[];

  it('is marked from the moment the drake exists, not once someone fights it', () => {
    // The point of the ring: a rotation you can only read by engaging is not
    // a decision. `onSpawn` is the seam that makes it readable from range.
    const boss = dragon();
    indexObjects(game as never, [boss] as never);

    tick(boss, 1);

    expect(rings()).toHaveLength(1);
  });

  it('wears exactly one ring however many times the drake dies', () => {
    const boss = dragon();
    indexObjects(game as never, [boss] as never);
    tick(boss, 1);

    boss.takeDamage(9_999, champion(0, 0) as never);
    tick(boss, framesFor(400));

    expect(boss.isDead, 'the drake never came back, so nothing here is tested').toBe(false);
    expect(rings()).toHaveLength(1);
  });

  it('and the ring outlives the corpse, which is when it matters most', () => {
    // The sixty seconds the pit stands empty are exactly when a team decides
    // whether to contest the next drake.
    const boss = dragon();
    indexObjects(game as never, [boss] as never);
    tick(boss, 1);
    const ring = rings()[0] as { toRemove?: boolean; draw?(): void };

    boss.takeDamage(9_999, champion(0, 0) as never);
    ring.draw?.();

    expect(boss.isDead).toBe(true);
    expect(ring.toRemove).toBeFalsy();
  });
});
