import { describe, expect, it } from 'vitest';
import { TeamId, LANES, Lane, getLaneWaypoints } from '@moba2d/core/testing';

/**
 * Summoner's Rift's lanes, graded by core's rules rather than by a copy of the
 * map.
 *
 * ## What this file used to be
 *
 * Five hundred lines, most of it tables typed out by hand: the exact
 * coordinate every lane started at (`BLUE_FOUNTAIN = { x: 400, y: 6_075 }`),
 * the three points of blue's top turret row and the three of red's, the claim
 * that each row holds eleven turrets, and a re-implementation of
 * point-in-polygon, distance-to-segment and nearest-point-on-path to check
 * them with.
 *
 * None of that is a rule. It is a photograph of the map on the day somebody
 * measured it, and the map is drawn in a tool now. Moving a turret and adding
 * one per side — an ordinary afternoon's work in the editor — turned nine
 * assertions red, and not one of them named anything that was actually wrong:
 * the lanes had been redrawn to start at the mouth of the base rather than on
 * the fountain (deliberate, and better), and there were twelve turrets a side
 * instead of eleven (also deliberate). A gate that cannot tell a deliberate
 * edit from a broken map is a gate that gets switched off.
 *
 * ## What it is now
 *
 * The rules live in `public/map-editor/js/mapRules.js` — one implementation,
 * loaded by the editor as a `<script>` and by anything TypeScript through
 * `@moba2d/core/seams` — and they ask about *relationships* rather than
 * coordinates: does a lane join two different bases, does every turret have a
 * wave that walks past it, does a lane pass its own row before the enemy's,
 * can a wave stand where it forms up, is a paired camp the mirror of its twin.
 * All of it survives the map being edited, and all of it is reported inside
 * the editor, on the canvas, at the point where somebody could fix it.
 *
 * That gate is `tests/maps/mapRules.test.ts`, which runs it against every map
 * this pack ships rather than only this one. What is left here is the other
 * half, and the only half that was ever about code rather than about a
 * drawing: the *mechanism* that hands a lane to a wave, which is core's.
 */

describe('how a lane is handed to a wave', () => {
  /**
   * Core's mechanism, on this pack's data. `getLaneWaypoints` serves both
   * teams from one declaration by reversing the list for the second, so what
   * is worth stating is the relationship between the two answers — not where
   * either of them starts, which is the map's business and is graded above.
   */
  it('gives red the same path backwards, without mutating the shared blue one', () => {
    for (const lane of LANES) {
      const blue = getLaneWaypoints(lane, TeamId.BLUE);
      const red = getLaneWaypoints(lane, TeamId.RED);

      expect(blue.length).toBeGreaterThan(3);
      expect(red).toEqual([...blue].reverse());
      expect(red[0]).toEqual(blue[blue.length - 1]);
      // Handed to every minion in a wave, so it must be the same array each
      // time — a copy per minion is a copy per minion per wave, all match.
      expect(getLaneWaypoints(lane, TeamId.RED)).toBe(red);
      expect(getLaneWaypoints(lane, TeamId.BLUE)).toBe(blue);
    }
  });

  it('falls back to mid for a lane it does not know', () => {
    expect(getLaneWaypoints('jungle', TeamId.BLUE)).toBe(getLaneWaypoints(Lane.MID, TeamId.BLUE));
  });
});
