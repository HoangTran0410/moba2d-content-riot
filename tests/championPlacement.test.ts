import { describe, expect, it } from 'vitest';
import { MELEE_RANGE_THRESHOLD } from '@moba2d/core/testing';
import { data } from '../pack';
import { ATTACK, DEFENCE, recordKey, type Role } from '../data';
import { championRecordStats } from '../generated/championRecordStats';

/**
 * **Every champion sits somewhere inside its role, and the role has not moved.**
 *
 * Six profiles used to give sixty-nine champions six bodies. `data.ts` now
 * places each one inside its own role using the source game's base stats,
 * which are already in this repository — but placement is only worth anything
 * if two opposite things stay true at once, and neither is visible from the
 * arithmetic that produces them:
 *
 *   - the roles themselves must not drift, or every price, every ability
 *     number and both balance reports were tuned against bodies that no longer
 *     exist;
 *   - and the champions inside a role must actually differ, or the whole
 *     mechanism is arithmetic that changes nothing.
 */

const playable = () =>
  (data.champions ?? []).filter(entry => entry.playable && entry.attack && entry.defence);

describe('where each champion sits inside its role', () => {
  it('has champions to place, or every case below is vacuous', () => {
    expect(playable().length).toBeGreaterThan(50);
  });

  /**
   * The load-bearing one. A melee champion placed past core's
   * `MELEE_RANGE_THRESHOLD` stops being melee: `combat/BasicAttack.ts` delivers
   * a *projectile* over that line and reads `boltUnitsPerSecond` for its
   * flight, which a melee row does not have. The first run of this placement
   * put Garen, Darius, Trundle and Yasuo at 153 — all four would have fired a
   * missile with no speed.
   */
  it('never places a melee champion over the line where core starts firing bolts', () => {
    for (const entry of playable()) {
      const attack = entry.attack!;
      if (attack.boltUnitsPerSecond === undefined) {
        expect(attack.range, `${entry.name} is melee but reaches past the bolt threshold`).toBeLessThan(
          MELEE_RANGE_THRESHOLD
        );
      }
    }
  });

  /**
   * Placement scales each champion by its share of its own role's mean, so the
   * mean itself must come back out unchanged — that is the whole reason it was
   * built this way rather than by copying the record's numbers over. If a role
   * drifts, every item price and both balance reports are measuring a roster
   * that no longer exists.
   */
  it('leaves every role’s own mean where the designer put it', () => {
    const byRole = new Map<Role, number[]>();
    const roles = Object.keys(DEFENCE) as Role[];
    for (const entry of playable()) {
      const health = entry.defence?.health;
      if (typeof health !== 'number') continue;
      // Placement moves health, so an exact match on the role table is rare;
      // group by the nearest role instead, which is what a role *is* on the
      // durability axis.
      const nearest = roles.reduce((best, role) =>
        Math.abs(DEFENCE[role].health - health) < Math.abs(DEFENCE[best].health - health)
          ? role
          : best
      );
      byRole.set(nearest, [...(byRole.get(nearest) ?? []), health]);
    }

    for (const [role, healths] of byRole) {
      if (healths.length < 3) continue;
      const mean = healths.reduce((a, b) => a + b, 0) / healths.length;
      // Within a tenth: rounding to whole points and the melee ceiling both
      // move a mean slightly, and neither is drift.
      expect(
        Math.abs(mean - DEFENCE[role].health) / DEFENCE[role].health,
        `${role} health drifted to ${mean.toFixed(1)} from ${DEFENCE[role].health}`
      ).toBeLessThan(0.1);
    }
  });

  /**
   * And the other direction: the mechanism has to actually do something. Before
   * it, every marksman reached exactly 410 and Caitlyn out-ranged Vladimir by
   * twenty-five pixels.
   */
  it('actually spreads the champions inside a role', () => {
    const ranged = playable().filter(entry => entry.attack!.boltUnitsPerSecond !== undefined);
    const ranges = new Set(ranged.map(entry => entry.attack!.range));
    expect(ranges.size, 'every ranged champion still reaches the same distance').toBeGreaterThan(8);

    const reach = (name: string) =>
      playable().find(entry => entry.name === name)?.attack?.range ?? 0;

    // The one a player would notice first, and the one the source game is
    // loudest about: 650 against 450 there.
    expect(reach('Caitlyn')).toBeGreaterThan(reach('Vladimir') + 100);
    expect(reach('Caitlyn')).toBeGreaterThan(reach('Ashe'));
  });

  /** A champion the importer has no record for keeps its role's body exactly. */
  it('leaves a champion with no record on its role’s own profile', () => {
    for (const entry of playable()) {
      // The same lookup the placement uses, so `Leblanc` here and `LeBlanc`
      // in the wiki data cannot become two champions — one placed, one not.
      const keyed = Object.keys(championRecordStats).map(recordKey);
      if (keyed.includes(recordKey(entry.name))) continue;
      const role = (Object.keys(ATTACK) as Role[]).find(
        r =>
          ATTACK[r].damage === entry.attack!.damage &&
          ATTACK[r].attacksPerSecond === entry.attack!.attacksPerSecond &&
          ATTACK[r].range === entry.attack!.range
      );
      expect(role, `${entry.name} has no record and no untouched role profile either`).toBeDefined();
    }
  });
});
