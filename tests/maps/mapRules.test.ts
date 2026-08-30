import { describe, expect, it } from 'vitest';
import { laneRuleLimits, mapIssues } from '@moba2d/core/testing/maps';
import { data as riotData } from '../../pack';
import type { MapDefinition, MapGeometry } from '@moba2d/core/content/types';

/**
 * Every map this pack ships, against core's own map rules.
 *
 * ## Why this is one file and not one per map
 *
 * A rule that only holds for the map it was written against is not a rule. The
 * two maps here were graded very differently before: Summoner's Rift carried
 * five hundred lines of hand-measured tables in `Lanes.test.ts`, and Twisted
 * Treeline carried nothing at all, on the reasonable grounds that geometry
 * assertions "would just re-encode whatever the last edit happened to be".
 *
 * Both were right about the tables and wrong about the conclusion. The way out
 * is not to check one map harder or the other not at all — it is to ask
 * questions that survive editing, and then ask them of everything. So this
 * iterates `riotData.maps`, and a third map added tomorrow is graded on the day
 * it lands without anybody writing a file for it.
 *
 * ## Where the rules are
 *
 * `public/map-editor/js/mapRules.js`, in core. One implementation, loaded by
 * the map editor as a plain `<script>` and by anything TypeScript through
 * `@moba2d/core/seams`. That is the point of the arrangement: whatever this
 * gate refuses, the editor has already drawn a marker on, at the coordinates
 * in the message — so a red push is something to go and fix rather than
 * something to go and find.
 */

const geometryOf = (map: MapDefinition): Promise<MapGeometry> =>
  typeof map.geometry === 'function' ? map.geometry() : Promise.resolve(map.geometry);

describe('the rules the map editor enforces, on every map this pack ships', () => {
  it('has rules to enforce', () => {
    // The one way this file can go quiet: a rules module that loaded and
    // checks nothing passes every case below without saying so.
    const limits = laneRuleLimits();
    expect(limits.wall).toBeGreaterThan(0);
    expect(limits.waypointTurret).toBeGreaterThan(limits.turretBlocked);
    expect(limits.turretBlocked).toBe(limits.turretBody + limits.minionBody);
    expect(limits.baseRadius).toBeGreaterThan(limits.laneCoversTurret);
  });

  it('ships more than one map, so the loop below is a loop', () => {
    expect(riotData.maps?.length ?? 0).toBeGreaterThan(1);
  });

  it.each((riotData.maps ?? []).map(map => ({ name: map.name, map })))(
    '$name has nothing the editor’s own checker would refuse',
    async ({ map }) => {
      const { terrain, slots, lanes } = await geometryOf(map);

      // The map being present at all, before it is graded: the gate below
      // passes just as well against a map with no lanes and no turrets in it.
      expect(lanes?.length ?? 0).toBeGreaterThan(0);
      expect(slots.structure.length).toBeGreaterThan(0);
      expect(slots.spawn).toHaveLength(2);
      expect(slots.minion.length).toBeGreaterThan(0);

      const issues = mapIssues({
        size: map.size,
        lanes: (lanes ?? []).map(lane => ({
          id: lane.id,
          points: lane.waypoints.map(({ x, y }): [number, number] => [x, y]),
        })),
        walls: terrain.wall.map(polygon => polygon.map(({ x, y }): [number, number] => [x, y])),
        turrets: slots.structure,
        spawns: slots.spawn,
        musters: slots.minion,
        neutrals: slots.neutral,
      });

      // The whole message, not a count: a failure here is something to go and
      // fix in the editor, and the sentence already says where.
      expect(issues.map(issue => `${issue.text} @ ${issue.at.map(Math.round).join(',')}`))
        .toEqual([]);
    }
  );
});
