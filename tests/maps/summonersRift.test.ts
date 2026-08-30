import { describe, expect, it } from 'vitest';
// Batch 4 task 6 moved Summoner's Rift's map, whole, out of `src/content/maps/`
// and into this pack's own `maps/` directory, so the map is a sibling of this
// test file now rather than two directories up in `src/`. It became *data*
// later still: the hand-written tables it used to be assembled from are gone
// into `maps/summonersRift_map.json`, so what these tests grade is the map a
// player is given rather than a program that produces one.
import { summonersRift } from '../../maps/summonersRift';
import { validatePack, PackRegistry } from '@moba2d/core/testing';
import { data as riotData } from '../../pack';
import type { MapGeometry, StructureSlot } from '@moba2d/core/content/types';

/** `summonersRift.geometry` is a loader now — resolve it once per test that needs it. */
const geometry = (): Promise<MapGeometry> => {
  const source = summonersRift.geometry;
  if (typeof source !== 'function') return Promise.resolve(source);
  return source();
};

describe("the Summoner's Rift map definition", () => {
  it('is a summary only — no terrain or slots on the object itself', () => {
    // The whole point of Task 4's split: the eager half is cheap enough for
    // the menu's own chunk, and nothing about "cheap" survives if the heavy
    // fields ride along on the same object.
    expect(summonersRift).not.toHaveProperty('terrain');
    expect(summonersRift).not.toHaveProperty('slots');
    expect(summonersRift).not.toHaveProperty('lanes');
    expect(summonersRift.name).toBe("Summoner's Rift");
    expect(typeof summonersRift.geometry).toBe('function');
  });

  /**
   * That the export is whole, stated without a tape measure.
   *
   * This used to read `expect(terrain.wall).toHaveLength(329)`, and two more
   * like it. The numbers were measured off the map at the migration and were
   * meant to catch a re-export that halved the walls or lost the water — but
   * they also caught every ordinary afternoon in the map editor, and could not
   * tell the two apart. One extra pool of water and this went red, saying
   * nothing except that the map had changed since somebody counted.
   *
   * What actually distinguishes a broken export is shape, not size: an empty
   * layer, a polygon with fewer than three points, a coordinate outside the
   * frame the whole map is drawn in. That last one is the editor's own warning
   * (`Tường tại (…) nằm ngoài khung map`), which is where a person meets it
   * first — this is the same claim standing behind the push gate.
   */
  it('carries terrain that is whole, in every layer it declares', async () => {
    const { terrain } = await geometry();
    const size = summonersRift.size;

    for (const [layer, polygons] of Object.entries(terrain)) {
      expect(polygons.length, `${layer} is empty`).toBeGreaterThan(0);
      for (const polygon of polygons) {
        expect(polygon.length, `a ${layer} polygon has ${polygon.length} points`)
          .toBeGreaterThanOrEqual(3);
        for (const { x, y } of polygon) {
          expect(
            Number.isFinite(x) && x >= 0 && x <= size && Number.isFinite(y) && y >= 0 && y <= size,
            `a ${layer} point (${x}, ${y}) is outside the ${size}×${size} frame`
          ).toBe(true);
        }
      }
    }
  });

  it('carries both turret rows as structure slots, with their teams', async () => {
    // `preset.ts`'s `turretsFromSlots` is the reader that turns these slots
    // into turrets; this states the shape it depends on — two rows, evenly
    // split by faction, every point a real coordinate — which is what a
    // truncated or half-factioned re-export would break.
    //
    // The two rows against *each other* rather than against a number. Eleven
    // was right until the day a twelfth turret was added to each side, and
    // then it was wrong in a way that said nothing; "the same on both sides"
    // is the claim that was always meant, and it is one a half-finished edit
    // breaks and a finished one does not.
    const { slots } = await geometry();
    const blue: StructureSlot[] = [];
    const red: StructureSlot[] = [];
    for (const slot of slots.structure) {
      (slot.faction === 'blue' ? blue : red).push(slot);
    }
    expect(blue.length).toBeGreaterThan(0);
    expect(red.length, 'the two turret rows are uneven').toBe(blue.length);
    for (const slot of [...blue, ...red]) {
      expect(Number.isFinite(slot.x) && Number.isFinite(slot.y)).toBe(true);
    }
  });

  it('places a spawn slot per faction where the fountains were', async () => {
    const { slots } = await geometry();
    expect(slots.spawn).toHaveLength(2);
    for (const slot of slots.spawn) expect(slot.r).toBeGreaterThan(0);
    const factions = slots.spawn.map(slot => slot.faction).sort();
    expect(factions).toEqual(['blue', 'red']);
  });

  it('declares camps as positions only, with no monster identities on them', async () => {
    // Task 7 split position from identity, and this is the half the map keeps:
    // a role and a place to stand. Which monster fills it, how much health it
    // has and what it does are the pack's, resolved at load — a slot that
    // started carrying them would be the split quietly coming undone.
    //
    // Asserted on the map's own `slots.neutral` rather than on a table beside
    // it. There used to be a `NEUTRAL_SLOTS` export the geometry folded in,
    // and this compared the two — which stopped meaning anything the moment
    // the map became data: the two sides would have been the same array.
    //
    // The count that used to stand here (16, then 11 before the jungle grew)
    // is gone with the other measurements — see the terrain case above for
    // why. Whether a camp stands on open ground, and whether a paired camp
    // mirrors its twin, are rules now, in `mapRules.js`, and `Lanes.test.ts`
    // runs them against this map.
    const { slots } = await geometry();
    expect(slots.neutral.length).toBeGreaterThan(0);
    for (const slot of slots.neutral) {
      expect(typeof slot.role).toBe('string');
      expect(slot.role.length).toBeGreaterThan(0);
      expect(slot.r ?? 0).toBeGreaterThan(0);
      expect(slot).not.toHaveProperty('name');
      expect(slot).not.toHaveProperty('health');
    }
  });

  /**
   * The two objectives are each other's mirror, which is what makes them a
   * pair rather than two unrelated points.
   *
   * The only symmetry claim left in this file. Twinned *roles* — krugs,
   * scuttle — are graded by `mapRules.js` against the map's own frame, and
   * `Lanes.test.ts` runs that; it cannot express this one, because Baron and
   * the dragon are two different roles that happen to answer to each other.
   *
   * Tolerance is the smaller pit's own radius, not a pixel. A mirror image
   * landing inside the pit is one nobody can measure from inside a match, and
   * the 1px this used to demand was a claim about how the map was produced —
   * true while a script placed the points, false the moment a person dragged
   * one, and never a claim about whether the jungle is fair.
   */
  it('keeps the dragon pit as Baron’s mirror', async () => {
    const centre = summonersRift.size / 2;
    const { slots } = await geometry();
    const only = (role: string) => {
      const found = slots.neutral.filter(slot => slot.role === role);
      expect(found, `expected exactly one ${role} pit`).toHaveLength(1);
      return found[0];
    };

    const baron = only('baron');
    const dragon = only('dragon');
    const drift = Math.hypot(baron.x - (2 * centre - dragon.x), baron.y - (2 * centre - dragon.y));

    expect(baron.r ?? 0).toBeGreaterThan(0);
    expect(dragon.r ?? 0).toBeGreaterThan(0);
    expect(drift, `the pits are ${Math.round(drift)}px off being each other's mirror`)
      .toBeLessThanOrEqual(Math.min(baron.r ?? 0, dragon.r ?? 0));
  });

  it('passes validation as part of a pack, geometry included', async () => {
    const result = validatePack({
      manifest: { id: 'p', version: '1.0.0', coreRange: '^1' },
      maps: [summonersRift],
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) expect(result.errors).toEqual([]);

    // `summonersRift.geometry` is a loader, so `validatePack` above never
    // actually reached its terrain/slots/lanes — `checkMap` can only inspect
    // a plain-object geometry synchronously (see `validate.ts`'s own doc
    // comment). `PackRegistry.loadMapGeometry` is what validates a resolved
    // loader's geometry in production; exercise that path too, or this test
    // would pass just as well against arbitrarily broken terrain.
    const registry = new PackRegistry();
    registry.installData({
      manifest: { id: 'p', version: '1.0.0', coreRange: '^1' },
      maps: [summonersRift],
    });
    await expect(registry.loadMapGeometry('p:summoners-rift')).resolves.toBeTruthy();
  });

  it('is carried in the bundled pack, qualified by pack id, summary only', () => {
    const registry = new PackRegistry();
    registry.installData(riotData);
    const maps = registry.maps();
    // Two since Twisted Treeline shipped — its own suite is
    // `tests/maps/twistedTreeline.test.ts`; this file only cares that
    // Summoner's Rift is among them, qualified and heavy-field-free.
    expect(maps).toHaveLength(2);
    const rift = maps.find(map => map.id === `${riotData.manifest.id}:summoners-rift`);
    expect(rift).toBeDefined();
    expect(rift).not.toHaveProperty('terrain');
    expect(rift).not.toHaveProperty('slots');
  });

  it('lists a map without pulling its geometry into the listing', async () => {
    // The guard the size regression (231,072-byte pregame chunk) would have
    // caught, restated as a behavioural assertion rather than a byte count —
    // `scripts/check-chunks.mjs` and `contentApiChunk.test.ts` cover the
    // structural/byte side.
    const registry = new PackRegistry();
    registry.installData(riotData);
    const summaries = registry.maps();
    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      expect(summary).not.toHaveProperty('terrain');
      expect(summary).not.toHaveProperty('slots');
    }
    const loaded = await registry.loadMapGeometry(summaries[0].id);
    expect(loaded?.terrain.wall.length).toBeGreaterThan(100);
  });
});
