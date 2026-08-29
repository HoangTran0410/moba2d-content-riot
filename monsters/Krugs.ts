import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { MonsterAbility } from '@moba2d/core/content/types';

/**
 * Bãi quái đá — the camp that gets *more* numerous as you kill it.
 *
 * One Ancient Krug becomes two Krugs; each Krug becomes two Krug Con. Six
 * bodies come out of one, and a jungler who opens on it without the clear
 * speed to finish loses far more time than the camp's health suggests. That
 * is the whole point of it: every other camp on the map is a health bar, and
 * this one is a decision.
 *
 * ## How the split works, and the two things that make it correct
 *
 * `MonsterAbility.onKilled` is the seam — the same one `JungleBuffs.ts` pays
 * its blessings through — and the children are real `api.units.Monster`
 * instances pushed into `objectManager`, which is the same door
 * `Game.spawnJungle()` uses.
 *
 * **The children share the parent's `camp` object by reference.** That is not
 * tidiness: `Monster.alertCamp` finds packmates by `mate.camp === this.camp`,
 * with no id anywhere, so a child handed a copied `{x, y, r}` would be a
 * stranger standing in the middle of its own family — hit one and the others
 * would watch.
 *
 * **The children are `ephemeral`.** There is no `reviveTime` that means "gone":
 * `0` respawns on the next frame and `Infinity` leaves a corpse in the object
 * list for the rest of the match. The camp's own respawn is what puts the
 * Ancient back, and a child that also came back would double the camp every
 * cycle.
 */

/** An `AttackableUnit` instance, without a value import core forbids here. */
type AttackableUnitInstance = InstanceType<ContentApi['units']['AttackableUnit']>;

export const KRUG = {
  /**
   * Health per tier. Six bodies for 660 total against Gromp's single 350 —
   * a slow camp by design, and the tiers fall fast enough that the count is
   * what costs you rather than any one body.
   */
  ancient: { health: 260, size: 74, damage: 11, speed: 1.6 },
  krug: { health: 120, size: 50, damage: 7, speed: 1.9 },
  small: { health: 45, size: 34, damage: 4, speed: 2.2 },
  /** How far a spawned child is nudged off its parent's corpse. */
  scatter: 46,
} as const;

/**
 * Where a child stands: around the parent's death position, never on it.
 *
 * `UnitCollisionSystem` would shove two bodies off one coordinate anyway, but
 * it does it *visibly* — the pair squirt apart on the frame they appear, which
 * reads as a bug rather than as a camp splitting.
 */
const around = (
  parent: AttackableUnitInstance,
  index: number,
  count: number
): { x: number; y: number } => {
  const angle = (index / count) * Math.PI * 2;
  return {
    x: parent.position.x + Math.cos(angle) * KRUG.scatter,
    y: parent.position.y + Math.sin(angle) * KRUG.scatter,
  };
};

/**
 * The ability a tier carries: on death, spawn `count` bodies of the next one
 * down. The smallest tier carries none, which is what ends the recursion —
 * stated by absence rather than by a depth counter nobody would read.
 */
function splitInto(
  api: ContentApi,
  count: number,
  child: { health: number; size: number; damage: number; speed: number },
  childName: string,
  childSplits?: MonsterAbility[]
): MonsterAbility {
  return {
    name: `Tách ${childName}`,
    // Never castable: the reward-only shape `JungleBuffs.ts` documents. A
    // distance is never negative, so `dist > range` is true on every frame for
    // every target, for ever.
    cooldownMs: 0,
    range: -1,
    cast() {},
    onKilled(monster) {
      const game = monster.game;
      if (!game?.objectManager?.addObject) return;

      for (let i = 0; i < count; i++) {
        const spot = around(monster, i, count);
        const body = new api.units.Monster({
          game,
          preset: {
            name: childName,
            avatar: 'monster_Ancient_Krug',
            // **By reference, never a copy.** See this file's header.
            camp: monster.camp,
            home: spot,
            speed: child.speed,
            size: child.size,
            attackRange: 50,
            // Unused: an ephemeral body never reaches the revive timer. Stated
            // rather than left to a default so the pairing is visible here.
            reviveTime: 0,
            ephemeral: true,
            health: child.health,
            damage: child.damage,
            attackInterval: 1200,
            aggroRange: 220,
            abilities: childSplits,
          },
        });
        body.position.set(spot.x, spot.y);
        body.destination.set(spot.x, spot.y);
        // A camp that was just killed was being fought. The children join
        // that fight rather than standing about waiting to be noticed —
        // `aggroOn` is the gate, so a passive or skittish tier would still
        // refuse, and the tiers here are all ordinary.
        game.objectManager.addObject(body);
      }
    },
  };
}

export default function makeKrugAbilities(api: ContentApi): MonsterAbility[] {
  const splitToSmall = [splitInto(api, 2, KRUG.small, 'Krug Con')];
  // Two mediums, each of which becomes two smalls: 1 → 2 → 4.
  return [splitInto(api, 2, KRUG.krug, 'Krug', splitToSmall)];
}
