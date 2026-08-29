import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { MonsterAbility } from '@moba2d/core/content/types';
import { beneficiary, blessing } from './JungleBuffs';

/**
 * Cua sông — the camp that will not fight you.
 *
 * It is `skittish` and roams the **water layer**, both declared on its
 * `MonsterBody` in `data.ts`. Those are the two core seams this camp exists
 * to use: it flees from anything that comes near, never swings back, and its
 * leash is the shape of the river rather than a circle — a circle wide enough
 * to hold the river also holds both banks, and a crab that wandered onto dry
 * land would be a different animal.
 *
 * ## What killing it is worth
 *
 * A shrine on its corpse: everyone on the killer's team who walks through it
 * runs faster for a few seconds, and the ground it stands on is **lit** for
 * that team while it lasts.
 *
 * The vision half costs nothing to build and is worth knowing about.
 * `FogOfWar` picks its revealers by two questions only — is this object on my
 * team, and is its `fogRevealRadius` above zero — and never asks whether it is
 * a unit. So a `SpellObject` carrying a team and a radius lights fog exactly
 * the way a ward does, with no ward class anywhere.
 *
 * The shrine's owner is the **killer**, not the crab: a `SpellObject` inherits
 * its owner's `teamId`, and the crab is neutral. Built from the killer, the
 * shrine belongs to the team that earned it and the fog follows for free.
 */

type ChampionInstance = InstanceType<ContentApi['units']['Champion']>;
type AttackableUnitInstance = InstanceType<ContentApi['units']['AttackableUnit']>;

export const SCUTTLE = {
  name: 'Bùa Cua',
  /** How long the shrine sits on the corpse. */
  shrineDurationMs: 60_000,
  /** How wide it is, and how far it lights. */
  radius: 260,
  /** How long one pass through it keeps you fast. */
  hasteDurationMs: 4_000,
  /** Movement bonus while it is on. */
  hastePercent: 0.3,
} as const;

/**
 * The shrine.
 *
 * An `AreaSpellObject` rather than something drawn from the crab: the crab is
 * a corpse by the time this exists, and an effect drawn from a unit vanishes
 * the moment that unit is culled while its behaviour keeps running — the trap
 * `Baron.ts`'s header records.
 */
export function makeScuttleShrine(api: ContentApi) {
  const Speedup = api.buffs.Speedup;

  return class ScuttleShrine extends api.AreaSpellObject {
    /** Under the units standing on it — it is a patch of ground. */
    zIndex = api.layers.GROUND_Z_INDEX;
    /** What makes the fog treat this as an eye. See the file header. */
    fogRevealRadius = SCUTTLE.radius;

    constructor(owner: AttackableUnitInstance, center: { x: number; y: number }) {
      super(owner, center, SCUTTLE.radius, {
        durationMs: SCUTTLE.shrineDurationMs,
        candidateFilter: (target: AttackableUnitInstance) =>
          target instanceof api.units.Champion && target.teamId === owner.teamId,
        onEnter: (target: AttackableUnitInstance) => {
          const haste = new Speedup(SCUTTLE.hasteDurationMs, owner, target);
          haste.percent = SCUTTLE.hastePercent;
          haste.stackId = 'scuttle-haste';
          target.addBuff(haste);
        },
      });
    }

    draw(): void {
      const { x, y } = this.center;
      // Fades out over its own life, so "this is about to go" is readable
      // without a number on screen.
      const left = 1 - Math.min(1, this.elapsedMs / SCUTTLE.shrineDurationMs);
      push();
      noStroke();
      fill(90, 210, 220, 34 * left);
      circle(x, y, this.radius * 2);
      noFill();
      stroke(120, 235, 245, 150 * left);
      strokeWeight(3);
      circle(x, y, this.radius * 1.7);
      strokeWeight(2);
      circle(x, y, this.radius * 1.15);
      pop();
    }
  };
}

export default function makeScuttleAbilities(api: ContentApi): MonsterAbility[] {
  const ScuttleShrine = makeScuttleShrine(api);

  return [
    blessing(SCUTTLE.name, (killer, monster) => {
      const champion: ChampionInstance | null = beneficiary(api, killer);
      if (!champion) return;
      const game = monster.game;
      if (!game?.objectManager?.addObject) return;

      game.objectManager.addObject(
        new ScuttleShrine(champion, { x: monster.position.x, y: monster.position.y })
      );
    }),
  ];
}
