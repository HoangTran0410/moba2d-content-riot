import { describe, expect, it, vi } from 'vitest';

import { buildTestApi } from '@moba2d/core/testing';
import { createGame, createUnit, installSpellObjectGlobals } from '@moba2d/core/testing/spell';
import { HALF_LENGTH, HALF_WIDTH, SWEEP_DISTANCE } from '../../spells/Thresh_E';
import Thresh_E, { Thresh_E_Object } from '../../spells/Thresh_E';
import { RADIUS, SHIELD_DURATION_MS } from '../../spells/Thresh_W';
import Thresh_W, { Thresh_W_Lantern_Throw, Thresh_W_Object } from '../../spells/Thresh_W';
const __api = buildTestApi();
const { Dash, Shield } = __api.buffs;
type Dash = InstanceType<typeof __api.buffs.Dash>;

installSpellObjectGlobals();

const at = (x: number, y: number, team: string, game: ReturnType<typeof createGame>) => {
  const unit = createUnit(game, 0, team);
  unit.position.set(x, y);
  unit.stats.maxHealth.baseValue = 200;
  unit.stats.health.baseValue = 200;
  return unit;
};

const aimAt = (game: ReturnType<typeof createGame>, x: number, y: number) => {
  (game as unknown as { worldMouse: unknown }).worldMouse = createVector(x, y);
};

/**
 * Flay is a *sweep*: a rectangle centred on Thresh, turned to face the cursor,
 * and everyone it catches goes the same way. It used to be a circle around him
 * that shoved each victim from wherever they happened to stand.
 */
describe('Thresh E sweeps a box, in one direction', () => {
  const cast = () => {
    const game = createGame();
    const thresh = at(0, 0, 'blue', game);
    aimAt(game, 1000, 0); // due east
    return { game, thresh, spell: new Thresh_E(thresh) };
  };

  /**
   * The chain is what hits, and it takes SWEEP_DURATION to cross the box, so a
   * cast on its own lands nothing — the swing has to be driven. That is the
   * point of the ability: the art and the damage are the same line.
   */
  const swingThrough = (game: ReturnType<typeof createGame>) => {
    const swing = game.objectManager._objectToBeAdd.find(
      (object: unknown): object is Thresh_E_Object => object instanceof Thresh_E_Object
    )!;
    vi.stubGlobal('deltaTime', 40);
    for (let i = 0; i < 12; i++) swing.update(); // 480ms: well past the far edge
    vi.stubGlobal('deltaTime', 16);
    return swing;
  };

  it('catches what is in the box and misses what is beside it', () => {
    const { game, spell } = cast();
    const inFront = at(HALF_LENGTH - 20, 0, 'red', game);
    const behind = at(-(HALF_LENGTH - 20), 0, 'red', game); // the box is centred on him
    const beside = at(0, HALF_WIDTH + 120, 'red', game); // square to the swing
    const far = at(HALF_LENGTH + 200, 0, 'red', game);
    game.objectManager.queryObjects = vi.fn(() => [inFront, behind, beside, far]) as never;

    const caught = spell.enemiesInBox(0);

    expect(caught).toContain(inFront);
    expect(caught, 'the box reaches behind him too').toContain(behind);
    expect(caught, 'a circle would have caught this one').not.toContain(beside);
    expect(caught).not.toContain(far);
  });

  it('sends everyone it catches the same way, along player → cursor', () => {
    const { game, spell } = cast();
    // Two victims on opposite sides of Thresh: a radial push would send them
    // apart, which is what this looked like.
    const north = at(30, -60, 'red', game);
    const south = at(30, 60, 'red', game);
    game.objectManager.queryObjects = vi.fn(() => [north, south]) as never;

    spell.onSpellCast();
    // The chain starts behind him and has to get there: casting alone hits
    // nobody, which is the difference between the swing and a flash of art.
    expect(
      north.buffs.some(buff => buff instanceof Dash),
      'not on the cast frame'
    ).toBe(false);
    swingThrough(game);

    for (const victim of [north, south]) {
      const dash = victim.buffs.find(buff => buff instanceof Dash) as Dash | undefined;
      expect(dash, 'swept, not shoved').toBeTruthy();
      // Due east of where they stood, by exactly the sweep distance.
      expect(dash!.dashDestination!.x - victim.position.x).toBeCloseTo(SWEEP_DISTANCE, 3);
      expect(dash!.dashDestination!.y - victim.position.y).toBeCloseTo(0, 3);
    }
  });

  it('turns the box with the cursor', () => {
    const { game, thresh } = cast();
    aimAt(game, 0, 1000); // due south
    const spell = new Thresh_E(thresh);
    const south = at(0, HALF_LENGTH - 20, 'red', game);
    const east = at(HALF_LENGTH - 20, 0, 'red', game);
    game.objectManager.queryObjects = vi.fn(() => [south, east]) as never;

    spell.onSpellCast();
    const swing = swingThrough(game);

    expect(swing.heading).toBeCloseTo(Math.PI / 2, 3);
    expect(south.buffs.some(buff => buff instanceof Dash)).toBe(true);
    expect(
      east.buffs.some(buff => buff instanceof Dash),
      'now out of the box'
    ).toBe(false);
  });
});

/**
 * The lantern is thrown and *then* hangs. Spawning it at the destination gave
 * the ability no travel and no tell.
 */
describe('Thresh W is thrown before it is a lantern', () => {
  const throwIt = () => {
    const game = createGame();
    const thresh = at(0, 0, 'blue', game);
    aimAt(game, 300, 0);
    game.objectManager.queryObjects = vi.fn(() => []) as never;
    new Thresh_W(thresh).onSpellCast();
    const flight = game.objectManager._objectToBeAdd.find(
      (object: unknown): object is Thresh_W_Lantern_Throw =>
        object instanceof Thresh_W_Lantern_Throw
    );
    return { game, thresh, flight: flight! };
  };

  it('puts a missile in the air, not a lantern on the ground', () => {
    const { thresh, flight } = throwIt();

    expect(flight, 'the throw is an object of its own').toBeTruthy();
    expect(flight.position.dist(thresh.position)).toBeCloseTo(0, 3);
    expect(flight.maxHitCount, 'lobbed over the fight, not into it').toBe(0);
  });

  it('becomes the lantern only on arrival', () => {
    const { game, flight } = throwIt();

    const lanternBefore = game.objectManager._objectToBeAdd.filter(
      (object: unknown) => object instanceof Thresh_W_Object
    );
    expect(lanternBefore).toHaveLength(0);

    for (let i = 0; i < 200 && !flight.toRemove; i++) flight.update();

    const lantern = game.objectManager._objectToBeAdd.find(
      (object: unknown): object is Thresh_W_Object => object instanceof Thresh_W_Object
    );
    expect(lantern).toBeTruthy();
    expect(lantern!.position.x).toBeCloseTo(300, 0);
  });

  it('shields allies standing in the light and nobody outside it', () => {
    const { game, thresh, flight } = throwIt();
    while (!flight.toRemove) flight.update();
    const lantern = game.objectManager._objectToBeAdd.find(
      (object: unknown): object is Thresh_W_Object => object instanceof Thresh_W_Object
    )!;

    const inside = at(300 + RADIUS - 30, 0, thresh.teamId, game);
    // Outside the circle, but well inside the square the quadtree searches —
    // this is exactly the unit that used to get shielded.
    const outside = at(300 + RADIUS + 120, 0, thresh.teamId, game);
    game.objectManager.queryObjects = vi.fn(() => [inside, outside]) as never;

    vi.stubGlobal('deltaTime', 600);
    lantern.update();
    vi.stubGlobal('deltaTime', 16);

    expect(inside.buffs.some(buff => buff instanceof Shield)).toBe(true);
    expect(outside.buffs.some(buff => buff instanceof Shield)).toBe(false);
  });

  it('pays each ally once, however long they stand in it', () => {
    // Reported from a real match: the lantern handed out a shield on every
    // 500ms tick, and `Shield` stacks to five — so standing in the light was
    // not a shield, it was a room you could not be hurt in, with a buff bar
    // full of the same icon to look at while you were in it.
    const { game, thresh, flight } = throwIt();
    while (!flight.toRemove) flight.update();
    const lantern = game.objectManager._objectToBeAdd.find(
      (object: unknown): object is Thresh_W_Object => object instanceof Thresh_W_Object
    )!;

    const ally = at(300, 0, thresh.teamId, game);
    game.objectManager.queryObjects = vi.fn(() => [ally]) as never;

    vi.stubGlobal('deltaTime', 600);
    for (let tick = 0; tick < 6; tick++) lantern.update();
    vi.stubGlobal('deltaTime', 16);

    expect(ally.buffs.filter(buff => buff instanceof Shield)).toHaveLength(1);
  });

  it('gives a shield worth carrying out of the light', () => {
    // The other half of the same fix. At 900ms against a 500ms re-tick the
    // duration was doing no work at all — it only had to outlive the gap. Once
    // it is handed out once, it has to be long enough to walk away with.
    const { game, thresh, flight } = throwIt();
    while (!flight.toRemove) flight.update();
    const lantern = game.objectManager._objectToBeAdd.find(
      (object: unknown): object is Thresh_W_Object => object instanceof Thresh_W_Object
    )!;

    const ally = at(300, 0, thresh.teamId, game);
    game.objectManager.queryObjects = vi.fn(() => [ally]) as never;

    vi.stubGlobal('deltaTime', 600);
    lantern.update();
    vi.stubGlobal('deltaTime', 16);

    const shield = ally.buffs.find(buff => buff instanceof Shield)!;
    expect((shield as unknown as { duration: number }).duration).toBe(SHIELD_DURATION_MS);
    expect(SHIELD_DURATION_MS).toBeGreaterThan(2_000);
  });
});
