import { describe, expect, it, vi } from 'vitest';

import { buildTestApi } from '@moba2d/core/testing';
import { createGame, createUnit, installSpellObjectGlobals } from '@moba2d/core/testing/spell';
import { DUSK_GRACE_MS, SPEED_PERCENT, TRAIL_MS, TRAIL_RADIUS } from '../../spells/Nocturne_Q';
import Nocturne_Q, { Nocturne_Dusk, Nocturne_Q_Object, Nocturne_Q_Trail } from '../../spells/Nocturne_Q';

installSpellObjectGlobals();

const { StatusFlags } = buildTestApi().enums;

const cast = () => {
  const game = createGame();
  const nocturne = createUnit(game, 0, 'blue');
  (game as unknown as { worldMouse: unknown }).worldMouse = createVector(600, 0);
  game.objectManager.queryObjects = vi.fn(() => []) as never;

  new Nocturne_Q(nocturne).onSpellCast();
  const pending = game.objectManager._objectToBeAdd;
  let blade: Nocturne_Q_Object | undefined;
  let trail: Nocturne_Q_Trail | undefined;
  for (const object of pending) {
    if (object instanceof Nocturne_Q_Object) blade = object;
    if (object instanceof Nocturne_Q_Trail) trail = object;
  }
  return { game, nocturne, blade: blade!, trail: trail! };
};

const onTrail = (unit: { buffs: unknown[] }) =>
  (unit.buffs as { toRemove: boolean }[]).some(
    buff => buff instanceof Nocturne_Dusk && !buff.toRemove
  );

/**
 * The wiki is explicit: the blade *leaves a Dusk Trail*, and Nocturne gets his
 * speed **while on it**. The first version applied a flat `Speedup` at cast
 * time and drew no trail at all — a different ability wearing the same
 * tooltip.
 */
describe('Nocturne Q lays a trail and pays for standing on it', () => {
  /**
   * The trail buff walks through *bodies*, not through the map. `Ghosted` — the
   * flag it used to carry — also disables `pushOutOfWalls`, which core reserves
   * for a dash: short, and ending on a point the spell already picked. A buff
   * that lasts as long as Nocturne keeps standing on his own trail is the case
   * that flag's own documentation warns about, and Janna's permanent W passive
   * was the same mistake found the same day.
   */
  it('phases through bodies without letting Nocturne leave the map', () => {
    const dusk = new Nocturne_Dusk(TRAIL_MS, {} as never, {} as never);
    expect(dusk.statusFlagsToEnable & StatusFlags.PhasesUnits).toBeTruthy();
    expect(
      dusk.statusFlagsToEnable & StatusFlags.Ghosted,
      'a buff with a duration must not disable the wall push-out'
    ).toBeFalsy();
  });

  it('grants nothing at cast time', () => {
    const { nocturne } = cast();

    expect(onTrail(nocturne), 'the buff is the trail’s to give').toBe(false);
  });

  it('paints the ground behind the blade as it flies', () => {
    const { blade, trail } = cast();

    expect(trail.patches).toHaveLength(0);
    for (let i = 0; i < 30; i++) {
      blade.update();
      trail.update();
    }

    expect(trail.patches.length).toBeGreaterThan(3);
    // Laid along the flight path, east of the caster.
    expect(trail.patches[trail.patches.length - 1].x).toBeGreaterThan(trail.patches[0].x);
  });

  it('buffs Nocturne only while his body is over a patch', () => {
    const { nocturne, blade, trail } = cast();
    for (let i = 0; i < 30; i++) {
      blade.update();
      trail.update();
    }
    const patch = trail.patches[trail.patches.length - 1];

    nocturne.position.set(patch.x, patch.y);
    trail.update();
    expect(trail.ownerIsOnTrail).toBe(true);
    expect(onTrail(nocturne), 'standing on it').toBe(true);

    const dusk = nocturne.buffs.find(buff => buff instanceof Nocturne_Dusk) as Nocturne_Dusk;
    expect(dusk.duration).toBe(DUSK_GRACE_MS);
    expect(dusk.statsModifier.speed.percentBaseBonus).toBeCloseTo(SPEED_PERCENT, 5);
    expect(dusk.statsModifier.attackDamage.baseBonus).toBeGreaterThan(0);

    // Step off. The predicate goes false at once; the buff follows it out
    // after the grace window, which is the point of the window — stepping
    // between two patches must not flicker it.
    nocturne.position.set(patch.x + TRAIL_RADIUS + 200, patch.y);
    trail.update();
    expect(trail.ownerIsOnTrail, 'off the trail').toBe(false);
    expect(onTrail(nocturne), 'still inside the grace window').toBe(true);

    vi.stubGlobal('deltaTime', DUSK_GRACE_MS + 50);
    nocturne.update();
    vi.stubGlobal('deltaTime', 16);
    expect(onTrail(nocturne), 'grace expired').toBe(false);
  });

  it('an enemy champion it hits paints a trail of their own', () => {
    const { game, blade } = cast();
    const victim = createUnit(game, 200, 'red');

    blade.onHit(victim);

    const painted: Nocturne_Q_Trail[] = [];
    for (const object of game.objectManager._objectToBeAdd) {
      if (object instanceof Nocturne_Q_Trail && object.source === victim) painted.push(object);
    }
    expect(painted, 'the victim becomes a source').toHaveLength(1);
    expect(painted[0].sourceLifeMs).toBe(TRAIL_MS);
  });

  it('outlives the blade, then ages out patch by patch', () => {
    const { blade, trail } = cast();
    for (let i = 0; i < 30; i++) {
      blade.update();
      trail.update();
    }
    blade.toRemove = true;
    trail.update();

    expect(trail.source, 'the painter is gone').toBeNull();
    expect(trail.patches.length, 'the ground is not').toBeGreaterThan(0);
    expect(trail.toRemove).toBe(false);

    vi.stubGlobal('deltaTime', TRAIL_MS + 100);
    trail.update();
    vi.stubGlobal('deltaTime', 16);

    expect(trail.patches).toHaveLength(0);
    expect(trail.toRemove).toBe(true);
  });
});
