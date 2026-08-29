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
   * Counts, written down, rather than a comparison against a second copy of
   * the map.
   *
   * This used to read `maps/summoner_map.json` and check the assembly had not
   * dropped anything on its way through 350 lines of mapping. There is no
   * assembly now — the map is one exported file — so that comparison would be
   * the data agreeing with itself. The numbers are what is worth stating: they
   * were measured off the map at the migration, and a re-export that halves
   * the walls or loses the water fails here instead of shipping.
   */
  it('carries the whole of the terrain it was drawn with', async () => {
    const { terrain } = await geometry();
    expect(terrain.wall).toHaveLength(329);
    expect(terrain.bush).toHaveLength(40);
    expect(terrain.water).toHaveLength(26);
  });

  it('carries both turret rows as structure slots, with their teams', async () => {
    // 11 each, measured. `preset.ts`'s `turretsFromSlots` is the reader that
    // turns these slots into turrets; this states the shape it depends on —
    // two rows, evenly split by faction, every point a real coordinate — which
    // is what a truncated or half-factioned re-export would break.
    const { slots } = await geometry();
    const blue: StructureSlot[] = [];
    const red: StructureSlot[] = [];
    for (const slot of slots.structure) {
      (slot.faction === 'blue' ? blue : red).push(slot);
    }
    expect(blue).toHaveLength(11);
    expect(red).toHaveLength(11);
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

  it('declares one neutral slot per distinct camp position, and no monster identities', async () => {
    // Task 7 split position from identity, and the count is the evidence: 11
    // distinct camps. Pre-split `MonsterPreset` had 21 entries, 14 of them
    // sharing one of 4 `campId` values (wolf1, wolf2, raptor1, raptor2), and
    // the other 7 (baron, blue1, blue2, red1, red2, gomp1, gomp2) each their
    // own group — 7 + 4 = 11. Worth writing down: an earlier plan draft
    // asserted 9 here, which does not survive counting the source.
    //
    // Asserted on the map's own `slots.neutral` rather than on a table beside
    // it. There used to be a `NEUTRAL_SLOTS` export the geometry folded in,
    // and this compared the two — which stopped meaning anything the moment
    // the map became data: the two sides would have been the same array.
    //
    // 16 since the map grew five more pits: one dragon (the point-symmetric
    // mirror of the Baron pit), two krug camps and two river crabs. Every one
    // of those five points was checked against the map's own wall polygons
    // before it was written down, not eyeballed off a screenshot.
    const { slots } = await geometry();
    expect(slots.neutral).toHaveLength(16);
    for (const slot of slots.neutral) {
      expect(typeof slot.role).toBe('string');
      expect(slot).not.toHaveProperty('name');
      expect(slot).not.toHaveProperty('health');
    }
  });

  it('puts every camp on ground a body can actually stand on', async () => {
    // The assertion the five new pits were positioned *by*, kept so the next
    // person to move one cannot land it inside a wall. A camp in a wall is
    // not a crash — it is a monster nothing can path to, discovered in a
    // match rather than in a test.
    const { terrain, slots } = await geometry();
    const walls = terrain.wall;
    const inside = (px: number, py: number, poly: { x: number; y: number }[]) => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const { x: xi, y: yi } = poly[i];
        const { x: xj, y: yj } = poly[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi) {
          hit = !hit;
        }
      }
      return hit;
    };

    for (const slot of slots.neutral) {
      for (const wall of walls) {
        expect(
          inside(slot.x, slot.y, wall),
          `${slot.role} at (${slot.x}, ${slot.y}) is inside a wall`
        ).toBe(false);
      }
    }
  });

  it('keeps its two halves point-symmetric where a camp has a twin', async () => {
    // Summoner's Rift mirrors about its own centre, and the new pits were
    // placed by mirroring rather than by eye. A camp whose twin drifted is a
    // jungle that is quietly better on one side.
    const centre = summonersRift.size / 2;
    const { slots } = await geometry();
    const byRole = new Map<string, { x: number; y: number }[]>();
    for (const slot of slots.neutral) {
      byRole.set(slot.role, [...(byRole.get(slot.role) ?? []), slot]);
    }

    for (const role of ['krugs', 'scuttle']) {
      const [a, b] = byRole.get(role) ?? [];
      expect(a, `${role} should be a pair`).toBeTruthy();
      expect(b, `${role} should be a pair`).toBeTruthy();
      expect(Math.abs(a!.x - (2 * centre - b!.x))).toBeLessThanOrEqual(1);
      expect(Math.abs(a!.y - (2 * centre - b!.y))).toBeLessThanOrEqual(1);
    }

    // The dragon pit is Baron's mirror, which is what makes the two
    // objectives a pair rather than two unrelated points.
    const [baron] = byRole.get('baron') ?? [];
    const [dragon] = byRole.get('dragon') ?? [];
    expect(baron, 'no baron pit').toBeTruthy();
    expect(dragon, 'no dragon pit').toBeTruthy();
    expect(Math.abs(baron!.x - (2 * centre - dragon!.x))).toBeLessThanOrEqual(1);
    expect(Math.abs(baron!.y - (2 * centre - dragon!.y))).toBeLessThanOrEqual(1);
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
