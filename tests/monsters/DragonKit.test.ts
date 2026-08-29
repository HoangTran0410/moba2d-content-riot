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
  ELDER,
  ELEMENTS,
  RITE,
  ROTATION,
  WINGBEAT,
  elementFor,
  resetDragonRotation,
} from '../../monsters/Dragon';
import { assetManifest } from '../../generated/assetManifest';

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

  /** Rotates the shared pit forward to the drake with this id. */
  const rotateTo = (id: string): void => {
    resetDragonRotation(PIT);
    for (let step = 0; step < ROTATION.length; step += 1) {
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

  it('chains to the three nearest and no further, when it is the hextech drake', () => {
    // The wiki's own "up to 3 of the closest nearby targets". Four in range,
    // one far away: the far one is out because of the range, and the fourth
    // near one is out because of the count — two different refusals, and a
    // test that only had three candidates could not tell them apart.
    rotateTo('hextech');
    const boss = dragon();
    const near = [champion(60), champion(90), champion(120), champion(150)];
    const far = champion(2_000);
    indexObjects(game as never, [boss, ...near, far] as never);

    rite(boss, near[0]);

    const struck = near.filter(one => one.buffs.some(buff => buff instanceof api.buffs.Slow));
    expect(struck).toHaveLength(RITE.hextech.arcs);
    // Nearest first, so the fourth-closest is the one left out.
    expect(struck).not.toContain(near[3]);
    expect(far.buffs.some(buff => buff instanceof api.buffs.Slow)).toBe(false);
  });

  it('gasses the pit and works itself into a frenzy, when it is the chemtech drake', () => {
    rotateTo('chemtech');
    const boss = dragon();
    const victim = champion(150);
    indexObjects(game as never, [boss, victim] as never);

    rite(boss, victim);

    expect(victim.buffs.some(buff => buff instanceof api.buffs.DamageOverTime)).toBe(true);
    // The wiki's drake gets faster as its health falls; the frenzy is that,
    // in the form this engine can express without a per-frame hook.
    const frenzy = boss.buffs.find(buff => buff instanceof api.buffs.StatAmp);
    expect(frenzy, 'the chemtech drake never sped up').toBeTruthy();
    expect(boss.stats.attackSpeed.value).toBeGreaterThan(0);
  });

  it('drags its target down as well as healing, when it is the water drake', () => {
    // Both halves of the wiki's line — "a ranged attacker that slows its
    // target" — not only the heal this rite started as.
    rotateTo('ocean');
    const boss = dragon();
    const victim = champion(200);
    indexObjects(game as never, [boss, victim] as never);

    rite(boss, victim);

    expect(victim.buffs.some(buff => buff instanceof api.buffs.Slow)).toBe(true);
  });

  it('burns everything in the pit, when it is the Elder', () => {
    rotateTo('elder');
    const boss = dragon();
    const near = champion(150);
    const far = champion(2_000);
    indexObjects(game as never, [boss, near, far] as never);

    rite(boss, near);

    expect(near.buffs.some(buff => buff instanceof api.buffs.DamageOverTime)).toBe(true);
    expect(far.buffs.some(buff => buff instanceof api.buffs.DamageOverTime)).toBe(false);
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

describe('the body is the drake, not one creature in seven costumes', () => {
  /** Rotates the shared pit forward to the drake with this id. */
  const rotateTo = (id: string): void => {
    resetDragonRotation(PIT);
    for (let step = 0; step < ROTATION.length; step += 1) {
      if (elementFor(PIT).id === id) return;
      const boss = dragon();
      boss.takeDamage(9_999, champion(0, 0) as never);
    }
    expect(elementFor(PIT).id, `never reached ${id}`).toBe(id);
  };

  it('writes its name, art, swing and rate on the frame it spawns', () => {
    // `onSpawn` fires on the first `update()` of every life, so a pit that has
    // rotated is a different creature before anyone reaches it — which is the
    // point of showing the ring at all.
    rotateTo('cloud');
    const boss = dragon();
    tick(boss, 1);

    const cloud = ELEMENTS.find(drake => drake.id === 'cloud')!;
    expect(boss.name).toBe(cloud.name);
    expect(boss.attackStyle).toBe(cloud.attackStyle);
    expect(boss.attackInterval).toBe(cloud.attackInterval);
    expect(boss.attackColor).toEqual(cloud.attackColor);
  });

  it('and writes a different one after the pit has turned over', () => {
    // The half that catches a `dressFor` guarded the way the ring is: dressing
    // has to run on *every* life, and only the ring is once per camp.
    //
    // **One body across two lives, not two bodies.** `dragon()` builds a fresh
    // `makeDragonAbilities(api)` each call, so two of them carry two separate
    // `ringed` sets and a mis-guarded `dressFor` would go on passing. Killing
    // and respawning the same camp is what puts the guard under test — the
    // same reason the ring cases below drive one boss through a death.
    rotateTo('mountain');
    const boss = dragon();
    indexObjects(game as never, [boss] as never);
    tick(boss, 1);
    expect(boss.attackStyle).toBe('breath');
    const first = { name: boss.name, interval: boss.attackInterval };

    boss.takeDamage(9_999, champion(0, 0) as never);
    tick(boss, framesFor(400));
    expect(boss.isDead, 'the drake never came back, so nothing here is tested').toBe(false);

    expect(boss.name).not.toBe(first.name);
    expect(boss.attackInterval).not.toBe(first.interval);
  });

  it('gives every drake in the rotation art this pack actually ships', () => {
    // A mistyped key is a blank body rather than a crash: `api.asset` answers
    // for a name nothing shipped and the draw silently paints nothing.
    for (const drake of ROTATION) {
      expect(Object.keys(assetManifest), drake.id).toContain(drake.avatar);
    }
  });

  it('spreads the swing rate rather than repainting one creature', () => {
    // Every drake looking different and fighting identically would be a skin
    // rotation. The wiki's own spread is the check: the wind drake is the
    // fastest thing in the pit and the earth drake the slowest.
    const rates = ELEMENTS.map(drake => drake.attackInterval);
    expect(Math.min(...rates)).toBe(ELEMENTS.find(d => d.id === 'cloud')!.attackInterval);
    expect(Math.max(...rates)).toBe(ELEMENTS.find(d => d.id === 'mountain')!.attackInterval);
    expect(new Set(rates).size).toBeGreaterThan(2);
  });
});

describe('the seventh, which is not an element', () => {
  const rotateTo = (id: string): void => {
    resetDragonRotation(PIT);
    for (let step = 0; step < ROTATION.length; step += 1) {
      if (elementFor(PIT).id === id) return;
      const boss = dragon();
      boss.takeDamage(9_999, champion(0, 0) as never);
    }
    expect(elementFor(PIT).id, `never reached ${id}`).toBe(id);
  };

  it('arrives only after all six elementals have been taken', () => {
    resetDragonRotation(PIT);
    for (let kill = 0; kill < ELEMENTS.length; kill += 1) {
      expect(elementFor(PIT).id, `kill ${kill}`).toBe(ELEMENTS[kill].id);
      const boss = dragon();
      boss.takeDamage(9_999, champion(0, 0) as never);
    }
    expect(elementFor(PIT).id).toBe(ELDER.id);
  });

  it('and the pit goes back to the first drake after it', () => {
    rotateTo('elder');
    const boss = dragon();
    boss.takeDamage(9_999, champion(0, 0) as never);

    expect(elementFor(PIT).id).toBe(ELEMENTS[0].id);
  });

  it('is a harder body than the six, and says so on spawn', () => {
    rotateTo('elder');
    const elder = dragon();
    tick(elder, 1);

    resetDragonRotation(PIT);
    const drake = dragon();
    tick(drake, 1);

    expect(elder.stats.armor.value).toBeGreaterThan(drake.stats.armor.value);
    expect(elder.stats.attackDamage.value).toBeGreaterThan(drake.stats.attackDamage.value);
    // Health deliberately untouched: raising `maxHealth` would not raise
    // `health`, so the Elder would arrive wounded and heal in front of you.
    expect(elder.stats.health.value).toBe(drake.stats.health.value);
  });

  it('pays a burn on every hit rather than a stat, and pays it briefly', () => {
    rotateTo('elder');
    const killer = champion(200);
    game.setPlayer(killer as never);
    const before = killer.stats.onHitDamage.value;

    const boss = dragon();
    indexObjects(game as never, [boss, killer] as never);
    boss.takeDamage(9_999, killer as never);

    const blessed = killer.buffs.find(buff => buff instanceof api.buffs.StatAmp);
    expect(blessed, 'the Elder paid nothing').toBeTruthy();
    expect(killer.stats.onHitDamage.value).toBeGreaterThan(before);
    // Shorter than an elemental buff: a window to win a game inside, not a
    // phase of the match.
    expect(blessed!.duration).toBe(ELDER.durationMs);
    expect(ELDER.durationMs).toBeLessThan(180_000);
  });
});
