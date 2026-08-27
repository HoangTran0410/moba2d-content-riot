import { describe, expect, it } from 'vitest';
import { twistedTreeline } from '../../maps/twistedTreeline';
import { validatePack, PackRegistry } from '@moba2d/core/testing';
import { data as riotData } from '../../pack';
import type { MapGeometry } from '@moba2d/core/content/types';

/**
 * Twisted Treeline — traced from a top-down render (see the geometry
 * module's header), which is exactly why this file leans on measurements
 * rather than trust: a traced polygon is only as good as the classifier's
 * afternoon, so the walls, the lanes and the camps are all checked against
 * each other the way `Lanes.test.ts` checks Summoner's Rift's hand-made
 * ones.
 *
 * The clearance floors repeat core's `laneTurretClearance.test.ts` (100
 * units for a straight run past a turret, 70 for a single waypoint) and the
 * corridor arithmetic repeats core's Proving Grounds lesson: `NavGrid`
 * refines against `requiredClearance` 35.5 either side of a cell centre,
 * cell centres sit up to 8 units off a corridor's true centre, so a lane
 * sample needs >=43.5 units of wall clearance for its cell to be free
 * whatever the grid alignment. Lane samples here are held to 25 — minions
 * walk waypoints directly and only need to not clip — while the *chokes*
 * the lanes thread were carved to >=100 during tracing, which the
 * spawn-to-spawn assertions below would catch regressing.
 */

const geometry = (): Promise<MapGeometry> => {
  const source = twistedTreeline.geometry;
  if (typeof source !== 'function') return Promise.resolve(source);
  return source();
};

type Point = { x: number; y: number };

const pointInPolygon = (px: number, py: number, poly: readonly Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
};

const segmentDistance = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Distance from a point to the nearest wall edge — 0 when inside a wall. */
const wallClearance = (walls: readonly (readonly Point[])[], p: Point): number => {
  let best = Infinity;
  for (const wall of walls) {
    if (pointInPolygon(p.x, p.y, wall)) return 0;
    for (let i = 0; i < wall.length; i++) {
      best = Math.min(best, segmentDistance(p, wall[i], wall[(i + 1) % wall.length]));
    }
  }
  return best;
};

/** Every point of a lane walk, sampled every ~10 units. */
const laneSamples = (waypoints: readonly Point[]): Point[] => {
  const samples: Point[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10));
    for (let s = 0; s <= steps; s++) {
      samples.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
    }
  }
  return samples;
};

describe('the Twisted Treeline map definition', () => {
  it('is a summary only — no terrain or slots on the object itself', () => {
    expect(twistedTreeline).not.toHaveProperty('terrain');
    expect(twistedTreeline).not.toHaveProperty('slots');
    expect(twistedTreeline).not.toHaveProperty('lanes');
    expect(typeof twistedTreeline.geometry).toBe('function');
  });

  it('is carried in the pack data and survives install, geometry included', async () => {
    expect(riotData.maps).toContain(twistedTreeline);
    const result = validatePack({
      manifest: { id: 'p', version: '1.0.0', coreRange: '^1' },
      maps: [twistedTreeline],
    });
    expect(result.ok).toBe(true);

    const registry = new PackRegistry();
    registry.installData({
      manifest: { id: 'p', version: '1.0.0', coreRange: '^1' },
      maps: [twistedTreeline],
    });
    await expect(registry.loadMapGeometry('p:twisted-treeline')).resolves.toBeTruthy();
  });

  it('is mirror-symmetric: every slot maps onto a slot of the other side', async () => {
    const { slots, lanes } = await geometry();
    const size = twistedTreeline.size;
    const mirrored = (x: number, y: number, list: readonly { x: number; y: number }[]) =>
      list.some(s => s.x === size - x && s.y === y);

    for (const s of slots.spawn) expect(mirrored(s.x, s.y, slots.spawn), `spawn ${s.x},${s.y}`).toBe(true);
    for (const s of slots.minion) expect(mirrored(s.x, s.y, slots.minion), `muster ${s.x},${s.y}`).toBe(true);
    for (const s of slots.structure) {
      expect(mirrored(s.x, s.y, slots.structure), `structure ${s.x},${s.y}`).toBe(true);
    }
    for (const s of slots.neutral) expect(mirrored(s.x, s.y, slots.neutral), `camp ${s.x},${s.y}`).toBe(true);
    // Both lanes are palindromes under the mirror: both teams walk the same road.
    for (const lane of lanes ?? []) {
      const points = lane.waypoints;
      for (let i = 0; i < points.length; i++) {
        const other = points[points.length - 1 - i];
        expect(other.x, `${lane.id} wp${i}`).toBe(size - points[i].x);
        expect(other.y, `${lane.id} wp${i}`).toBe(points[i].y);
      }
    }
  });

  it('walks both lanes fountain to fountain without clipping a wall', async () => {
    const { terrain, slots, lanes } = await geometry();
    expect(lanes).toHaveLength(2);
    for (const lane of lanes ?? []) {
      const first = lane.waypoints[0];
      const last = lane.waypoints[lane.waypoints.length - 1];
      const spawnsHit = [first, last].map(
        end => slots.spawn.find(s => s.x === end.x && s.y === end.y)?.faction
      );
      expect(spawnsHit.sort(), `${lane.id} must run fountain to fountain`).toEqual(['blue', 'red']);

      for (const sample of laneSamples(lane.waypoints)) {
        const clearance = wallClearance(terrain.wall, sample);
        expect(
          clearance,
          `${lane.id} clips a wall at (${sample.x.toFixed(0)}, ${sample.y.toFixed(0)})`
        ).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it('keeps every lane clear of every turret — the floors core documents', async () => {
    const { slots, lanes } = await geometry();
    const turrets = slots.structure.filter(s => s.kind === 'turret');
    expect(turrets).toHaveLength(6);
    for (const lane of lanes ?? []) {
      for (const turret of turrets) {
        for (const point of lane.waypoints) {
          expect(
            Math.hypot(point.x - turret.x, point.y - turret.y),
            `${lane.id} waypoint (${point.x},${point.y}) sits on the turret at ${turret.x},${turret.y}`
          ).toBeGreaterThanOrEqual(68);
        }
        for (let i = 1; i < lane.waypoints.length; i++) {
          expect(
            segmentDistance(turret, lane.waypoints[i - 1], lane.waypoints[i]),
            `${lane.id} run ${i - 1}->${i} cuts through the turret at ${turret.x},${turret.y}`
          ).toBeGreaterThanOrEqual(100);
        }
      }
    }
  });

  it('gives every lane a muster slot for both factions, on walkable ground', async () => {
    const { terrain, slots, lanes } = await geometry();
    for (const lane of lanes ?? []) {
      for (const faction of ['blue', 'red']) {
        const slot = slots.minion.find(s => s.faction === faction && s.lane === lane.id);
        expect(slot, `${faction} has no ${lane.id} muster`).toBeDefined();
        expect(wallClearance(terrain.wall, slot!)).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it('fills all six camps with this pack’s own monsters, on open ground', async () => {
    const { terrain, slots } = await geometry();
    expect(slots.neutral).toHaveLength(6);
    const monsters = riotData.monsters ?? {};
    for (const camp of slots.neutral) {
      const filler = Object.values(monsters).find(monster => monster.fills.includes(camp.role));
      expect(filler, `no monster fills ${camp.role}`).toBeDefined();
      expect(
        wallClearance(terrain.wall, camp),
        `camp ${camp.role} at ${camp.x},${camp.y} sits in a wall`
      ).toBeGreaterThanOrEqual(60);
    }
  });

  it('has bushes, every one of them on walkable ground', async () => {
    const { terrain } = await geometry();
    expect(terrain.bush.length).toBeGreaterThanOrEqual(5);
    for (const bush of terrain.bush) {
      const cx = bush.reduce((sum, p) => sum + p.x, 0) / bush.length;
      const cy = bush.reduce((sum, p) => sum + p.y, 0) / bush.length;
      expect(
        wallClearance(terrain.wall, { x: cx, y: cy }),
        `bush centred at ${cx.toFixed(0)},${cy.toFixed(0)} sits in a wall`
      ).toBeGreaterThan(0);
    }
  });

  it('spawns both teams on open ground inside the arena', async () => {
    const { terrain, slots } = await geometry();
    expect(slots.spawn).toHaveLength(2);
    for (const spawn of slots.spawn) {
      expect(wallClearance(terrain.wall, spawn)).toBeGreaterThanOrEqual(100);
    }
  });
});
