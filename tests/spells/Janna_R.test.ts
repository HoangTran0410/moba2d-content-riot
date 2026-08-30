import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, EventManager, withWalls } from '@moba2d/core/testing';
import { loadSpellsForTests, resolveSpellBarrel } from '@moba2d/core/testing/spells';
import type { CastContext } from '@moba2d/core/content/types';
import { setPackApi } from '../../packApi';
import { data } from '../../data';

/**
 * The replacement for `vi.mock('.../src/managers/AssetManager')` +
 * `vi.mock('.../src/game/vfx/CastTelegraph')`: neither `vi.mock()` call
 * survives the pack becoming its own repository — the module specifier it
 * would name does not resolve there. `buildTestApi({ vfx: { CastTelegraph:
 * SpyTelegraph } } })` (Task 2's own replacement, `src/testing/api.ts`)
 * intercepts what `packs/riot/spells/Janna_R.ts` constructs internally by
 * swapping the class the injected `api` hands out, rather than the module
 * import site — the pack's own spell code always reaches for
 * `api.vfx.CastTelegraph`, never a bare import, so this is the same
 * interception the mock gave, at the seam the pack actually uses.
 *
 * The asset lookup itself needs no double any more (batch 5's
 * `installPackForTests` registers the pack's real manifest for every test
 * file's environment; content-pack-extraction batch 6 task 6 moved this
 * file into the pack, so it is `packs/riot/vitest.setup.ts` that calls it
 * now, not core's `tests/setup.ts` — see that file's own doc comment).
 */
const loopDispose = vi.fn();
const telegraphContexts: CastContext[] = [];
const telegraphCenters: Array<() => { x: number; y: number }> = [];

class SpyTelegraph {
  constructor(
    context: CastContext,
    _radius: number,
    _render: unknown,
    getCenter: () => { x: number; y: number }
  ) {
    telegraphContexts.push(context);
    telegraphCenters.push(getCenter);
  }
  update() {}
  draw() {}
  dispose() {
    loopDispose();
  }
}

/**
 * The api goes in **before** the spell module is imported, and the import is
 * dynamic for exactly that reason.
 *
 * A spell is a module-scope class now — `Janna_R.ts` opens with `const
 * CastTelegraph = api.vfx.CastTelegraph;` — so it reads what it needs the
 * moment its module evaluates, and a static import at the top of this file
 * evaluates it before any line here runs. That was fine when the file called
 * `makeJanna_R(__api)` and could hand a doubled api to one spell; it is not
 * fine now, and the failure is quiet: the real `CastTelegraph` is captured,
 * the spy records nothing, and four assertions look at an empty array.
 *
 * `vitest.setup.ts` has already set the pack's real api; replacing it here is
 * this file's own environment, and vitest isolates a test file's module graph,
 * so no other file sees the double.
 */
const __api = buildTestApi({ vfx: { CastTelegraph: SpyTelegraph as never } });
setPackApi(__api);

const { default: Janna_R, Janna_R_Object } = await import('../../spells/Janna_R');
const {
  CHANNEL_DURATION_MS,
  HEAL_PER_TICK,
  KNOCKBACK_DISTANCE,
  KNOCKBACK_DURATION_MS,
  MANA_COST,
  RADIUS,
  TICK_EVERY_MS,
} = await import('../../spells/Janna_R');
const { default: Ghost } = await import('../../spells/Ghost');
const { default: Heal } = await import('../../spells/Heal');
const { default: Ignite } = await import('../../spells/Ignite');
const AllSpellFactories = await import('../../spells/index');

/**
 * The one place an alias is still needed, and it earns it: a *dynamic* import
 * binds a value, not a type, so `Janna_R_Object` cannot be written in a type
 * position without this. A static `import { Janna_R_Object }` carries both,
 * which is why no other test file has one.
 */
type Janna_R_Object = InstanceType<typeof Janna_R_Object>;

const { EventType, StatusFlags } = __api.enums;
const { Spell, AreaSpellObject } = __api;
type AreaSpellObject = InstanceType<typeof __api.AreaSpellObject>;
const { AttackableUnit } = __api.units;
type AttackableUnit = InstanceType<typeof __api.units.AttackableUnit>;
const AllSpells = resolveSpellBarrel(AllSpellFactories);

/**
 * How far the terrain seam's answer may sit from geometry written out by hand.
 *
 * `TerrainField` is a distance field on a 16px grid, read back bilinearly, so a
 * wall face is located to about a pixel rather than exactly — measured at
 * 1.20px worst case over the shipped map in tests/game/nav/SignedField.test.ts.
 */
const FIELD_PIXEL = 2;

// Spell classes arrive by dynamic import in the game (`spellRegistry.ts`);
// this fills the registry synchronously so a test can read the whole
// catalogue without awaiting 238 of them.
beforeAll(() => loadSpellsForTests(AllSpellFactories));

const stubDrawGlobals = () => {
  const spies = {
    image: vi.fn(),
    circle: vi.fn(),
    beginShape: vi.fn(),
    vertex: vi.fn(),
    endShape: vi.fn(),
  };
  for (const [name, spy] of Object.entries(spies)) vi.stubGlobal(name, spy);
  for (const name of [
    'push',
    'pop',
    'translate',
    'fill',
    'stroke',
    'noFill',
    'noStroke',
    'strokeWeight',
  ]) {
    vi.stubGlobal(name, vi.fn());
  }
  vi.stubGlobal('sin', Math.sin);
  vi.stubGlobal('cos', Math.cos);
  vi.stubGlobal('TWO_PI', Math.PI * 2);
  return spies;
};

class TestVector {
  constructor(
    public x = 0,
    public y = 0
  ) {}
  copy() {
    return new TestVector(this.x, this.y);
  }
  set(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
}

interface TestUnit {
  position: TestVector;
  destination: TestVector;
  collisionRadius: number;
  teamId: string;
  isDead: boolean;
  canCast: boolean;
  stopMovement: () => void;
  addBuff: (buff: unknown) => void;
  takeHeal: (amount: number, healer: unknown) => void;
}

const context = (caster: unknown): CastContext =>
  Object.freeze({
    spellId: 'janna-r',
    activationId: 'cast',
    startedAtMs: 0,
    caster,
    origin: Object.freeze({ x: 0, y: 0 }),
    cursorWorld: Object.freeze({ x: 300, y: 200 }),
    direction: Object.freeze({ x: 0, y: 0 }),
  });

const makeOwner = (candidates: TestUnit[] = []) => {
  const added: unknown[] = [];
  const owner = {
    position: new TestVector(0, 0),
    destination: new TestVector(0, 0),
    collisionRadius: 20,
    teamId: 'blue',
    isDead: false,
    canCast: true,
    addBuff: vi.fn(),
    takeHeal: vi.fn(),
    stopMovement() {
      this.destination.set(this.position.x, this.position.y);
    },
    game: {
      eventManager: new EventManager(),
      terrainMap: { getObstaclesInArea: vi.fn(() => []) },
      objectManager: {
        addObject: (object: unknown) => added.push(object),
        queryObjects: () => [owner, ...candidates],
      },
    },
    stats: { mana: { value: 200 }, health: { value: 100 } },
  };
  return { owner, added };
};

describe('Janna R', () => {
  beforeEach(() => {
    vi.stubGlobal('createVector', (x = 0, y = 0) => new TestVector(x, y));
    vi.stubGlobal('deltaTime', 16);
    loopDispose.mockClear();
    telegraphContexts.length = 0;
    telegraphCenters.length = 0;
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('exports and registers Monsoon in Janna’s spell group', () => {
    // This pack's own data (`data.ts`), not `spellGroups()`/core's global
    // `contentRegistry()` — that registry is filled solely from core's own
    // generated `installedPacks.ts`, which correctly has zero entries for a
    // pack under test standalone, so a champion lookup through it silently
    // finds nothing and answers empty rather than failing loudly. Found by
    // running this suite from outside the checkout
    // (`npm run verify:pack-standalone`), the only place it was visible: in
    // this monorepo `packs/riot/` is installed in core's own tree, so
    // `contentRegistry()` happened to include it too, and the mismatch
    // between "the pack's own claim" and "core's global answer" never
    // showed. A pack knows its own champions — asking core's registry was
    // asking the wrong object. `group.image` here is `data.ts`'s own
    // pack-relative asset key (`ChampionEntry.image`'s own doc comment:
    // `'champ_janna'`, never `'lol:champ_janna'`); the `lol:` qualifier is
    // `PackRegistry.writeData`'s own rewrite, core's install-time behaviour
    // to test, not this pack's declaration to repeat.
    const group = data.champions?.find(candidate => candidate.name === 'Janna');

    expect(AllSpells.Janna_R).toBeTypeOf('function');
    expect(group?.spells).toContain('Janna_R');
    expect(group?.image).toBe('champ_janna');
  });

  it('keeps gameplay origin frozen while its channel telegraph follows Janna', () => {
    const { owner } = makeOwner();

    new Janna_R(owner).press(context(owner));

    owner.position.set(90, 40);
    expect(telegraphContexts[0].origin).toEqual({ x: 0, y: 0 });
    expect(telegraphCenters[0]()).toEqual({ x: 90, y: 40 });
  });

  it('spends its resource cost on cast', () => {
    const { owner } = makeOwner();
    const spell = new Janna_R(owner);

    spell.press(context(owner));

    expect(owner.stats.mana.value).toBe(200 - MANA_COST);
  });

  it('pushes a champion on the rim outward, never back towards Janna', () => {
    // Reported from a real match, and visible only from the rim, which is why
    // it survived: the destination used to be `origin + direction * 260` — a
    // radius rather than a displacement. `RADIUS` is 420, so anybody standing
    // in the outer 160px of the storm was *dragged in* by an ability whose
    // whole description is blowing people away, and the further out they
    // stood the harder they were pulled.
    const buffs: unknown[] = [];
    const start = RADIUS - 20;
    const enemy: TestUnit = {
      position: new TestVector(start, 0),
      destination: new TestVector(start, 0),
      collisionRadius: 20,
      teamId: 'red',
      isDead: false,
      canCast: true,
      stopMovement() {
        this.destination.set(this.position.x, this.position.y);
      },
      addBuff: buff => buffs.push(buff),
      takeHeal: vi.fn(),
    };
    const { owner } = makeOwner([enemy]);

    new Janna_R(owner).press(context(owner));

    expect(buffs).toHaveLength(1);
    const landing = (buffs[0] as { dashDestination: { x: number; y: number } }).dashDestination;
    expect(landing.x).toBeGreaterThan(start);
    expect(landing.x).toBeCloseTo(start + KNOCKBACK_DISTANCE, 5);
  });

  it('knocks enemies back once then heals allies on runtime channel ticks', () => {
    const enemyBuffs: unknown[] = [];
    const enemy: TestUnit = {
      position: new TestVector(100, 0),
      destination: new TestVector(100, 0),
      collisionRadius: 20,
      teamId: 'red',
      isDead: false,
      canCast: true,
      stopMovement() {
        this.destination.set(this.position.x, this.position.y);
      },
      addBuff: buff => enemyBuffs.push(buff),
      takeHeal: vi.fn(),
    };
    const ally: TestUnit = {
      position: new TestVector(200, 0),
      destination: new TestVector(200, 0),
      collisionRadius: 20,
      teamId: 'blue',
      isDead: false,
      canCast: true,
      stopMovement() {
        this.destination.set(this.position.x, this.position.y);
      },
      addBuff: vi.fn(),
      takeHeal: vi.fn(),
    };
    const { owner } = makeOwner([ally, enemy]);
    const spell = new Janna_R(owner);

    spell.press(context(owner));

    expect(spell.state).toBe('CHANNELING');
    expect(enemyBuffs).toHaveLength(1);
    const knockback = enemyBuffs[0] as {
      dashDestination: { x: number; y: number };
      dashSpeed: number;
    };
    // 100 out, pushed 260 further out. The knockback is a *displacement* from
    // where the target stands, not a radius it is snapped to — see the case
    // below for the bug that distinction fixes.
    expect(knockback.dashDestination).toEqual({ x: 100 + KNOCKBACK_DISTANCE, y: 0 });
    expect(knockback.dashSpeed).toBeCloseTo(
      KNOCKBACK_DISTANCE / (KNOCKBACK_DURATION_MS / (1000 / 60))
    );

    vi.stubGlobal('deltaTime', TICK_EVERY_MS);
    spell.update();
    spell.update();

    expect(ally.takeHeal).toHaveBeenCalledTimes(2);
    expect(ally.takeHeal).toHaveBeenLastCalledWith(HEAL_PER_TICK, owner);
    expect(enemy.takeHeal).not.toHaveBeenCalled();
  });

  it.each([
    [
      'movement command',
      (owner: ReturnType<typeof makeOwner>['owner']) => owner.destination.set(10, 0),
    ],
    ['displacement', (owner: ReturnType<typeof makeOwner>['owner']) => owner.position.set(10, 0)],
    [
      'cast-blocking CC',
      (owner: ReturnType<typeof makeOwner>['owner']) => {
        owner.canCast = false;
      },
    ],
    [
      'another spell cast',
      (owner: ReturnType<typeof makeOwner>['owner']) => {
        owner.game.eventManager.emit(EventType.ON_POST_CAST_SPELL, { owner });
      },
    ],
    [
      'an attack',
      (owner: ReturnType<typeof makeOwner>['owner']) => {
        owner.game.eventManager.emit(EventType.ON_ATTACK, owner);
      },
    ],
  ] as const)('gameplay %s cancels ticks and loop VFX', (_name, interrupt) => {
    const { owner, added } = makeOwner();
    const spell = new Janna_R(owner);

    spell.press(context(owner));
    const area = added.find(
      (object): object is AreaSpellObject => object instanceof AreaSpellObject
    );
    if (!area) throw new Error('Janna R must create its channel area.');
    interrupt(owner);
    spell.update();

    expect(spell.state).toBe('COOLDOWN');
    expect(area.toRemove).toBe(true);
    expect(owner.takeHeal).not.toHaveBeenCalled();
    expect(loopDispose).toHaveBeenCalledOnce();
  });

  it('keeps channeling after rejected casts and imported-permitted summoner casts', () => {
    class RejectedSpell extends Spell {
      targetingMode = 'DIRECTION' as const;
      checkCastCondition(): boolean {
        return false;
      }
    }

    const { owner } = makeOwner();
    const spell = new Janna_R(owner);
    spell.press(context(owner));

    const rejected = new RejectedSpell(owner);
    expect(rejected.press(context(owner))).toBe(false);
    expect(spell.state).toBe('CHANNELING');

    for (const SummonerSpell of [Ghost, Heal, Ignite]) {
      const permitted = Object.assign(Object.create(SummonerSpell.prototype), { owner });
      owner.game.eventManager.emit(EventType.ON_POST_CAST_SPELL, permitted);
      expect(spell.state).toBe('CHANNELING');
    }
  });

  it('cancels only after a prohibited spell successfully casts', () => {
    class ProhibitedSpell extends Spell {
      targetingMode = 'DIRECTION' as const;
    }

    const { owner } = makeOwner();
    const spell = new Janna_R(owner);
    spell.press(context(owner));

    const prohibited = new ProhibitedSpell(owner);
    expect(prohibited.press(context(owner))).toBe(true);
    expect(spell.state).toBe('COOLDOWN');
  });

  it('ticks the heal once per interval across the full channel duration', () => {
    const ally: TestUnit = {
      position: new TestVector(200, 0),
      destination: new TestVector(200, 0),
      collisionRadius: 20,
      teamId: 'blue',
      isDead: false,
      canCast: true,
      stopMovement() {
        this.destination.set(this.position.x, this.position.y);
      },
      addBuff: vi.fn(),
      takeHeal: vi.fn(),
    };
    const { owner } = makeOwner([ally]);
    const spell = new Janna_R(owner);

    spell.press(context(owner));
    vi.stubGlobal('deltaTime', CHANNEL_DURATION_MS);
    spell.update();

    expect(ally.takeHeal).toHaveBeenCalledTimes(CHANNEL_DURATION_MS / TICK_EVERY_MS);
    expect(spell.state).toBe('COOLDOWN');
  });

  it('clamps knockback before walls, suppresses actions, and freezes normal movement', () => {
    const enemyBuffs: unknown[] = [];
    const enemy: TestUnit = {
      position: new TestVector(100, 0),
      destination: new TestVector(100, 0),
      collisionRadius: 20,
      teamId: 'red',
      isDead: false,
      canCast: true,
      stopMovement() {
        this.destination.set(this.position.x, this.position.y);
      },
      addBuff: buff => enemyBuffs.push(buff),
      takeHeal: vi.fn(),
    };
    const { owner } = makeOwner([enemy]);
    // The wall face is placed 50 short of where the knockback wants to end, so
    // the clamp is exercised whatever KNOCKBACK_DISTANCE is retuned to. The
    // enemy is then stopped a collisionRadius (20) shy of the face.
    const wallFaceX = KNOCKBACK_DISTANCE - 50;
    const clampedX = wallFaceX - 20;
    // `owner.game` is this file's own minimal double, not the real
    // `createGame()` fixture — `withWalls` only ever reaches it as
    // `game as never` internally, so the cast here just states at the call
    // site what is already true one level down.
    withWalls(owner.game as never, [
      [
        { x: wallFaceX, y: -100 },
        { x: wallFaceX + 100, y: -100 },
        { x: wallFaceX + 100, y: 100 },
        { x: wallFaceX, y: 100 },
      ],
    ]);
    const spell = new Janna_R(owner);

    spell.press(context(owner));

    expect(enemyBuffs).toHaveLength(1);
    const knockback = enemyBuffs[0] as {
      activateBuff(): void;
      deactivateBuff(): void;
      dashDestination: TestVector;
      statusFlagsToEnable: number;
    };
    // Within a pixel rather than exactly, and the pixel is the point. The wall
    // is no longer a set of polygon edges the knockback line is intersected
    // against; it is `TerrainField`, a distance field sampled on a 16px grid and
    // read back bilinearly, which answers to about a pixel by construction
    // (`tests/game/nav/SignedField.test.ts` measures its worst disagreement with
    // the polygons at 1.20px). Asserting an exact 190 would be asserting
    // something the seam does not promise. `clampedX` is still written by the
    // test — face minus the enemy's own 20px radius — not read back out of it.
    expect(knockback.dashDestination.y).toBe(0);
    expect(Math.abs(knockback.dashDestination.x - clampedX)).toBeLessThanOrEqual(FIELD_PIXEL);
    expect(knockback.statusFlagsToEnable & StatusFlags.Immovable).toBeTruthy();
    expect(knockback.statusFlagsToEnable & StatusFlags.Silenced).toBeTruthy();
    expect(knockback.statusFlagsToEnable & StatusFlags.Ghosted).toBeFalsy();

    enemy.destination.set(999, 999);
    knockback.activateBuff();
    expect(enemy.destination).toEqual({ x: 100, y: 0 });

    knockback.deactivateBuff();
    // Same pixel of slack as the destination above, and for the same reason:
    // `onDeactivate` writes the destination straight onto the victim, so both
    // land wherever the field put the wall face.
    expect(Math.abs(enemy.position.x - clampedX)).toBeLessThanOrEqual(FIELD_PIXEL);
    expect(enemy.position.y).toBe(0);
    expect(enemy.destination.x).toBe(enemy.position.x);
    expect(enemy.destination.y).toBe(0);
  });

  it('draws a procedural monsoon vortex out to the real spell radius', () => {
    const draw = stubDrawGlobals();
    const { owner } = makeOwner();
    const area = new Janna_R_Object(owner as never, { x: 0, y: 0 }, RADIUS);
    area.elapsedMs = 1_234;

    area.draw();

    // procedural, not a blitted ability icon
    expect(draw.image).not.toHaveBeenCalled();
    // the boundary ring is sized to the spell's own tuning constant, not an
    // invented display-only number
    expect(draw.circle).toHaveBeenCalledWith(0, 0, RADIUS * 2);
    // four curling spiral arms, each its own shape
    expect(draw.beginShape).toHaveBeenCalledTimes(4);
    expect(draw.endShape).toHaveBeenCalledTimes(4);
    // wash + boundary rings + gust rings + drifting flecks
    expect(draw.circle.mock.calls.length).toBeGreaterThan(20);
  });

  it('grows a heal-pulse ring around every ally caught in the monsoon', () => {
    const draw = stubDrawGlobals();
    const { owner } = makeOwner();
    const area = new Janna_R_Object(owner as never, { x: 0, y: 0 }, RADIUS);
    area.elapsedMs = 500;
    area.draw();
    const baseline = draw.circle.mock.calls.length;

    const ally = Object.assign(Object.create(AttackableUnit.prototype), {
      position: { x: 40, y: 0 },
      collisionRadius: 25,
    }) as AttackableUnit;
    area.members.add(ally);
    draw.circle.mockClear();

    area.draw();

    // two concentric rings drawn per ally inside the vortex
    expect(draw.circle.mock.calls.length).toBe(baseline + 2);
  });

  it('sizes its display bounding box to the full monsoon radius so it cannot be culled', () => {
    const { owner, added } = makeOwner();
    const spell = new Janna_R(owner);

    spell.press(context(owner));

    const area = added.find((object): object is Janna_R_Object => object instanceof Janna_R_Object);
    if (!area) throw new Error('Janna R must create its channel area.');
    const box = area.getDisplayBoundingBox();

    expect(box).toMatchObject({ x: -RADIUS, y: -RADIUS, w: RADIUS * 2, h: RADIUS * 2 });
  });
});
