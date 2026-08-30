import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import type { MonsterAbility } from '@moba2d/core/content/types';
import makeKrugAbilities, { KRUG } from '../../monsters/Krugs';
import makeDragonAbilities, { DRAGON, ELEMENTS, elementFor } from '../../monsters/Dragon';
import makeScuttleAbilities, { SCUTTLE } from '../../monsters/ScuttleCrab';
import makeVilemawAbilities, { VILEMAW, WEB } from '../../monsters/Vilemaw';

/**
 * The four camps added on top of Baron and the two buff pits.
 *
 * Every case drives the real seam — `Monster.die` reaching
 * `MonsterAbility.onKilled` — by hitting the camp for more than it has, never
 * by calling `onKilled` by hand. A reward that does not survive the death path
 * is not a reward, it is a function nobody calls. Tuning arrives as imported
 * constants so retuning is not editing a test.
 */

const api = buildTestApi();
const { Champion, Monster } = api.units;

type ChampionInstance = InstanceType<typeof Champion>;
type MonsterInstance = InstanceType<typeof Monster>;

const champion = (game: TestGame, x: number, teamId: string): ChampionInstance =>
  new Champion({ game, position: createVector(x, 0), teamId } as never);

const camp = (
  game: TestGame,
  abilities: MonsterAbility[],
  overrides: Record<string, unknown> = {}
): MonsterInstance =>
  new Monster({
    game,
    preset: {
      name: 'Camp',
      avatar: 'monster_Ancient_Krug',
      camp: { x: 0, y: -300, r: 100 },
      speed: 2,
      size: 80,
      attackRange: 50,
      reviveTime: 60_000,
      health: 300,
      abilities,
      ...overrides,
    },
  } as never);

const slay = (
  game: TestGame,
  abilities: MonsterAbility[],
  killer: { teamId: string },
  overrides: Record<string, unknown> = {}
): MonsterInstance => {
  const monster = camp(game, abilities, overrides);
  monster.takeDamage(9_999, killer as never);
  expect(monster.isDead, 'the camp survived the hit, so nothing was granted').toBe(true);
  return monster;
};

const named = (unit: ChampionInstance, name: string) =>
  unit.buffs.find(buff => buff.name === name);

/**
 * Everything in the world, including what has been added but not yet settled.
 *
 * `ObjectManager.addObject` pushes to `_objectToBeAdd` and only moves it into
 * `objects` on the manager's own `update()`. A camp that spawns something on
 * death therefore has nothing in `objects` on the frame it dies, and a test
 * reading only that list reports "nothing was spawned" for code that works —
 * the same trap `CLAUDE.md` records for the match-config panel.
 */
const everything = (): unknown[] => {
  const manager = game.objectManager as unknown as {
    objects: unknown[];
    _objectToBeAdd: unknown[];
  };
  return [...manager.objects, ...manager._objectToBeAdd];
};

let game: TestGame;

beforeEach(() => {
  installSpellObjectGlobals();
  installSketchMathGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame();
});

describe('Krug', () => {
  const bodies = (): MonsterInstance[] =>
    everything().filter(o => o instanceof Monster) as MonsterInstance[];

  it('hands the children the fight the parent was in', () => {
    // They spawn in IDLE, camps do not wake on proximity, and `alertCamp` only
    // runs from a hit — so without this the split produced six rocks standing
    // around a jungler waiting to be struck one at a time. The file said they
    // joined the fight for as long as the split existed; nothing did it.
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);

    slay(game, makeKrugAbilities(api), killer);

    const children = bodies().filter(body => !body.isDead);
    expect(children.length, 'nothing split, so nothing here is tested').toBe(2);
    for (const child of children) {
      expect(child.phase).toBe(Monster.PHASES.ATTACK);
      expect(child.targetLock).toBe(killer);
    }
  });

  it('but not to a thief it never saw, and not to nobody', () => {
    // `aggroOn` is the gate rather than a phase assignment, so what a child
    // does about the killer is still a question about the killer.
    const thief = camp(game, []);
    slay(game, makeKrugAbilities(api), thief as never);

    const children = bodies().filter(body => !body.isDead && body !== thief);
    expect(children.length).toBe(2);
    for (const child of children) expect(child.targetLock).toBe(thief);
  });

  it('splits into two on death', () => {
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);

    slay(game, makeKrugAbilities(api), killer);

    // The corpse is in the list too, so the two children are the live ones.
    const alive = bodies().filter(body => !body.isDead);
    expect(alive).toHaveLength(2);
    expect(alive[0].stats.maxHealth.value).toBe(KRUG.krug.health);
  });

  it('and those two split again, for six bodies out of one', () => {
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);
    slay(game, makeKrugAbilities(api), killer);

    for (const child of bodies().filter(b => !b.isDead)) child.takeDamage(9_999, killer as never);

    const alive = bodies().filter(body => !body.isDead);
    expect(alive).toHaveLength(4);
    expect(alive[0].stats.maxHealth.value).toBe(KRUG.small.health);
  });

  it('stops at the smallest tier', () => {
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);
    slay(game, makeKrugAbilities(api), killer);
    for (const child of bodies().filter(b => !b.isDead)) child.takeDamage(9_999, killer as never);
    const smalls = bodies().filter(b => !b.isDead);

    for (const small of smalls) small.takeDamage(9_999, killer as never);

    expect(bodies().filter(body => !body.isDead)).toHaveLength(0);
  });

  it('hands children the parent\'s own camp object, not a copy of it', () => {
    // `Monster.alertCamp` matches packmates by `mate.camp === this.camp`, with
    // no id anywhere. A copied `{x, y, r}` would make a child a stranger
    // standing in the middle of its own family.
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);
    const parent = slay(game, makeKrugAbilities(api), killer);

    for (const child of bodies().filter(b => !b.isDead)) {
      expect(child.camp).toBe(parent.camp);
    }
  });

  it('makes children ephemeral, so the camp does not double every cycle', () => {
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);
    slay(game, makeKrugAbilities(api), killer);
    const [child] = bodies().filter(b => !b.isDead);

    child.takeDamage(9_999, killer as never);
    for (let i = 0; i < 60; i++) child.update();

    expect(child.isDead).toBe(true);
    expect(child.toRemove).toBe(true);
  });
});

describe('Dragon', () => {
  it('blesses the whole of the killer\'s team', () => {
    const killer = champion(game, 0, 'blue');
    const ally = champion(game, 200, 'blue');
    const enemy = champion(game, 400, 'red');
    game.setPlayer(killer);
    indexObjects(game as never, [killer, ally, enemy] as never);

    slay(game, makeDragonAbilities(api), killer);

    expect(named(killer, ELEMENTS[0].name)).toBeTruthy();
    expect(named(ally, ELEMENTS[0].name)).toBeTruthy();
    expect(named(enemy, ELEMENTS[0].name)).toBeUndefined();
  });

  it('ends on its own clock rather than lasting for ever', () => {
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);

    slay(game, makeDragonAbilities(api), killer);

    expect(named(killer, ELEMENTS[0].name)!.duration).toBe(DRAGON.durationMs);
  });

  it('rotates its element with each kill', () => {
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);
    const abilities = makeDragonAbilities(api);
    const shared = { x: 0, y: -300, r: 100 };

    slay(game, abilities, killer, { camp: shared });
    slay(game, abilities, killer, { camp: shared });

    expect(elementFor(shared).id).toBe(ELEMENTS[2].id);
  });

  it('replaces the previous blessing instead of stacking a second one', () => {
    // The whole design decision, and the one a wrong `stackId` would undo
    // silently: four separate classes default to four separate slots.
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);
    const abilities = makeDragonAbilities(api);
    const shared = { x: 0, y: -300, r: 100 };

    slay(game, abilities, killer, { camp: shared });
    slay(game, abilities, killer, { camp: shared });

    const held = killer.buffs.filter(buff => buff.stackId === DRAGON.stackId && !buff.toRemove);
    expect(held).toHaveLength(1);
    expect(held[0].name).toBe(ELEMENTS[1].name);
  });

  it('two pits rotate independently of each other', () => {
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);
    const abilities = makeDragonAbilities(api);
    const east = { x: 0, y: -300, r: 100 };
    const west = { x: 900, y: -300, r: 100 };

    slay(game, abilities, killer, { camp: east });

    expect(elementFor(east).id).toBe(ELEMENTS[1].id);
    expect(elementFor(west).id).toBe(ELEMENTS[0].id);
  });
});

describe('Scuttle Crab', () => {
  /** Anything in the world carrying a fog radius — the eye or the shrine. */
  const eyes = (): { fogRevealRadius: number; teamId?: string }[] =>
    everything().filter(
      o => typeof (o as { fogRevealRadius?: number }).fogRevealRadius === 'number'
    ) as { fogRevealRadius: number; teamId?: string }[];

  const shrine = () => eyes().find(o => o.fogRevealRadius === SCUTTLE.radius);
  const eye = () => eyes().find(o => o.fogRevealRadius === SCUTTLE.eyeRevealRadius);

  it('leaves an eye on its corpse, owned by the killer\'s team', () => {
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);

    slay(game, makeScuttleAbilities(api), killer);

    expect(eye(), 'no eye was left behind').toBeTruthy();
    // The crab is neutral; whatever it leaves has to belong to the team that
    // earned it, or the fog lights for nobody.
    expect(eye()!.teamId).toBe('blue');
    // And the reward itself is not here yet — it is still being carried.
    expect(shrine()).toBeUndefined();
  });

  it('flies the reward to the camp point rather than dropping it where it fell', () => {
    // The whole reason the eye exists. The crab wanders now, so "where it
    // died" is nowhere in particular; what a team contests is the crossing.
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);

    const crab = camp(game, makeScuttleAbilities(api));
    const home = { x: crab.home.x, y: crab.home.y };
    // Killed a long way down the river from its own spot.
    crab.position.set(home.x + 900, home.y + 700);
    crab.takeDamage(9_999, killer as never);
    expect(crab.isDead).toBe(true);

    const flier = eye() as unknown as { update(): void; position: { x: number; y: number } };
    expect(flier, 'no eye was left behind').toBeTruthy();
    // It starts at the corpse, not at the camp.
    expect(flier.position.x).toBeCloseTo(home.x + 900, 0);

    // Flown, not teleported: stepping the object is the only thing that moves
    // it, and the number of steps is a consequence of its own speed.
    const travel = Math.hypot(900, 700);
    for (let step = 0; step < Math.ceil(travel / SCUTTLE.eyeSpeed) + 2; step++) flier.update();

    expect(shrine(), 'the eye never planted anything').toBeTruthy();
    const planted = shrine() as unknown as { center: { x: number; y: number } };
    expect(planted.center.x).toBeCloseTo(home.x, 0);
    expect(planted.center.y).toBeCloseTo(home.y, 0);
  });

  it('lights fog the whole way, which is how it grants vision at all', () => {
    // `FogOfWar` asks two questions of a candidate revealer — my team, and a
    // `fogRevealRadius` above zero — and never asks whether it is a unit. Both
    // halves carry one, so the flight is watchable and the crossing is lit.
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);

    slay(game, makeScuttleAbilities(api), killer);

    expect(eye()!.fogRevealRadius).toBeGreaterThan(0);
    // Smaller than the shrine's: a trail, not the reward arriving early.
    expect(SCUTTLE.eyeRevealRadius).toBeLessThan(SCUTTLE.radius);
  });

  it('grants nothing when something that is not a champion steals the kill', () => {
    // A real unit rather than a stub: `takeDamage` writes to the attacker's
    // own `tally`, so a hand-rolled object has to grow engine internals to
    // get through the death path at all — and a test that mocks the path it
    // is testing proves nothing. Another camp is the cheapest non-champion
    // killer the pack can build.
    const thief = camp(game, []);

    slay(game, makeScuttleAbilities(api), thief as never);

    // Asserted on the eye specifically, not on the object count: a death
    // legitimately adds other things to the world (combat text, for one), so
    // "nothing at all appeared" would be a claim about the wrong thing and
    // would fail for a reason that has nothing to do with this camp.
    expect(eye()).toBeUndefined();
    expect(shrine()).toBeUndefined();
  });
});

describe('Vilemaw', () => {
  /**
   * Casts the web and runs the object it spawns for `ms`.
   *
   * The ability used to apply its `Dash` inside `cast` and draw nothing at
   * all: a champion at the end of a 520px reach was simply somewhere else, and
   * the creature that did it had visibly not moved. Everything it does now
   * lives in the spell object, which is why every case below has to run one.
   */
  const spray = (boss: MonsterInstance, victim: ChampionInstance, ms: number) => {
    makeVilemawAbilities(api)[0].cast(boss as never, victim as never);
    const web = everything().find(
      object => (object as { target?: unknown })?.target === victim
    ) as { update(): void };
    expect(web, 'the cast spawned no web').toBeTruthy();
    for (let elapsed = 0; elapsed < ms; elapsed += 16) web.update();
    return web;
  };

  it('throws its strands before anything moves', () => {
    // The whole point of the rewrite: half a second of web crossing the ground
    // is the part of this ability a player gets to see.
    const victim = champion(game, 600, 'blue');
    game.setPlayer(victim);
    const boss = camp(game, makeVilemawAbilities(api), { speed: 0 });

    spray(boss, victim, WEB.sprayMs - 100);

    expect(victim.buffs.some(buff => buff instanceof api.buffs.Dash)).toBe(false);
    expect(victim.stats.health.value).toBe(victim.stats.maxHealth.value);
  });

  it('does not yank a champion that died during the spray', () => {
    // Half a second is long enough to die in, and dragging a corpse across the
    // map is worse than missing.
    const victim = champion(game, 600, 'blue');
    game.setPlayer(victim);
    const boss = camp(game, makeVilemawAbilities(api), { speed: 0 });

    makeVilemawAbilities(api)[0].cast(boss as never, victim as never);
    const web = everything().find(
      object => (object as { target?: unknown })?.target === victim
    ) as { update(): void };
    victim.takeDamage(999_999, boss as never);
    expect(victim.isDead, 'the victim did not actually die').toBe(true);
    for (let elapsed = 0; elapsed < WEB.sprayMs + 100; elapsed += 16) web.update();

    expect(victim.buffs.some(buff => buff instanceof api.buffs.Dash)).toBe(false);
  });

  it('yanks a champion toward its pit', () => {
    const killer = champion(game, 600, 'blue');
    game.setPlayer(killer);
    const boss = camp(game, makeVilemawAbilities(api), { speed: 0 });

    spray(boss, killer, WEB.sprayMs + 100);

    const dash = killer.buffs.find(buff => buff instanceof api.buffs.Dash);
    expect(dash, 'nothing pulled the champion').toBeTruthy();
    const destination = (dash as unknown as { dashDestination: { x: number; y: number } })
      .dashDestination;
    // Toward the boss, and stopping short of it rather than inside it. The
    // distance is the real one, not its x component: the pit is off-axis from
    // the champion, so comparing x alone would pass for the wrong reason.
    const reach = Math.hypot(
      destination.x - boss.position.x,
      destination.y - boss.position.y
    );
    expect(reach).toBeCloseTo(WEB.landing, 0);
    expect(destination.x).toBeLessThan(killer.position.x);
  });

  it('blesses the killer\'s team on its own finite clock', () => {
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);

    slay(game, makeVilemawAbilities(api), killer);

    const blessing = named(killer, VILEMAW.blessingName);
    expect(blessing).toBeTruthy();
    expect(blessing!.duration).toBe(VILEMAW.durationMs);
  });

  it('keeps its blessing in its own slot, not the dragon\'s', () => {
    // The two never share a map, so this costs nothing — but a shared
    // `stackId` would mean taking one erased the other on a map that did.
    const killer = champion(game, 0, 'blue');
    game.setPlayer(killer);

    slay(game, makeVilemawAbilities(api), killer);

    expect(named(killer, VILEMAW.blessingName)!.stackId).toBe(VILEMAW.stackId);
    expect(VILEMAW.stackId).not.toBe(DRAGON.stackId);
  });
});
