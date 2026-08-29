import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { MonsterAbility } from '@moba2d/core/content/types';
import { beneficiary, blessing } from './JungleBuffs';

/**
 * Cua sông — the camp that will not fight you.
 *
 * ## Three states, and the middle one is the animal
 *
 * **Calm.** It drifts up and down the river at a stroll, which is
 * `wanderSpeed` on its `MonsterBody` — a pace of its own, separate from the
 * `speed` it bolts at. Core picks between the two by phase.
 *
 * **Running.** `skittish`, so any damage puts it in `FLEE` and it never swings
 * back. It used to bolt from *proximity* as well, and that was wrong twice
 * over: it made the one camp using the temperament unapproachable rather than
 * shy, and the source game's crab does not do it either — you can walk right
 * up to that one, and it only sprints once you hit it.
 *
 * **Dead.** It leaves an eye, and the eye **flies home**. See below.
 *
 * Its leash is the shape of the river rather than a circle (`roam`), because a
 * circle wide enough to hold the river also holds both banks, and a crab that
 * wandered onto dry land would be a different animal. That matters far more now
 * that it actually wanders: the region is not a limit it never reaches, it is
 * the corridor it spends the whole match walking.
 *
 * ## What killing it is worth
 *
 * A shrine: everyone on the killer's team who walks through it runs faster for
 * a few seconds, and the ground it stands on is **lit** for that team while it
 * lasts.
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
 *
 * ## Why the eye flies
 *
 * The shrine used to be planted on the corpse. That was fine while the crab
 * stood on its spawn point for the whole match and stopped being fine the
 * moment it started wandering: the reward for killing it became "vision of
 * wherever it happened to have drifted to", which is nowhere in particular and
 * is not what anyone contests a crab for. The prize is the **river crossing**,
 * so the prize is delivered there.
 *
 * Two objects rather than one with a mode. The flight is short and the shrine
 * lasts a minute; folding them together would mean a duration that has to
 * subtract its own travel time, and an `AreaSpellObject` whose zone is
 * somewhere different from where it will end up.
 */

type ChampionInstance = InstanceType<ContentApi['units']['Champion']>;
type AttackableUnitInstance = InstanceType<ContentApi['units']['AttackableUnit']>;

export const SCUTTLE = {
  name: 'Bùa Cua',
  /** How long the shrine sits at the crossing. */
  shrineDurationMs: 60_000,
  /** How wide it is, and how far it lights. */
  radius: 260,
  /** How long one pass through it keeps you fast. */
  hasteDurationMs: 4_000,
  /** Movement bonus while it is on. */
  hastePercent: 0.3,
  /** How fast the eye flies home, in world units per frame. */
  eyeSpeed: 7,
  /** What it lights on the way — a trail, not a second shrine. */
  eyeRevealRadius: 150,
  /** How close to home counts as home, so a last sub-pixel step cannot loop. */
  eyeArrival: 8,
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

/**
 * The eye the crab turns into, on its way to the crossing.
 *
 * It carries a `fogRevealRadius` of its own, so the flight is *seen* rather
 * than merely happening: the killer watches a lit circle travel up the river
 * to the spot it just bought. Smaller than the shrine's on purpose — this is a
 * trail, not a reward that arrives early.
 *
 * The shrine is added on arrival rather than at launch, because an
 * `AreaSpellObject` starts counting its own duration the moment it exists.
 */
export function makeScuttleEye(api: ContentApi, ScuttleShrine: ReturnType<typeof makeScuttleShrine>) {
  return class ScuttleEye extends api.SpellObject {
    /** Above the ground it is flying over — it is in the air. */
    zIndex = api.layers.SPELL_EFFECT_Z_INDEX;
    fogRevealRadius = SCUTTLE.eyeRevealRadius;
    /** Where the camp lives, which is where the prize belongs. */
    home: { x: number; y: number };
    age = 0;

    constructor(
      owner: AttackableUnitInstance,
      from: { x: number; y: number },
      home: { x: number; y: number }
    ) {
      super(owner);
      this.home = { x: home.x, y: home.y };
      this.position.set(from.x, from.y);
    }

    update(): void {
      this.age += deltaTime;

      const dx = this.home.x - this.position.x;
      const dy = this.home.y - this.position.y;
      const remaining = Math.hypot(dx, dy);

      if (remaining <= Math.max(SCUTTLE.eyeArrival, SCUTTLE.eyeSpeed)) {
        this.position.set(this.home.x, this.home.y);
        this.arrive();
        return;
      }

      const step = SCUTTLE.eyeSpeed / remaining;
      this.position.set(this.position.x + dx * step, this.position.y + dy * step);
    }

    arrive(): void {
      this.toRemove = true;
      const game = this.owner.game;
      if (!game?.objectManager?.addObject) return;
      game.objectManager.addObject(
        new ScuttleShrine(this.owner as AttackableUnitInstance, this.home)
      );
    }

    draw(): void {
      const { x, y } = this.position;
      // A slow bob, so it reads as drifting rather than as being dragged on a
      // string. `frameCount` and not `age`, so two eyes never bob in lockstep
      // — they are launched from different places at different times anyway,
      // and this keeps that true if they ever are not.
      const bob = Math.sin((frameCount + x) / 14) * 3;

      push();
      noStroke();
      fill(120, 235, 245, 60);
      circle(x, y + bob, 46);
      fill(210, 250, 255, 230);
      circle(x, y + bob, 24);
      fill(20, 70, 90, 240);
      circle(x, y + bob, 10);
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox(60);
    }
  };
}

export default function makeScuttleAbilities(api: ContentApi): MonsterAbility[] {
  const ScuttleShrine = makeScuttleShrine(api);
  const ScuttleEye = makeScuttleEye(api, ScuttleShrine);

  return [
    blessing(SCUTTLE.name, (killer, monster) => {
      const champion: ChampionInstance | null = beneficiary(api, killer);
      if (!champion) return;
      const game = monster.game;
      if (!game?.objectManager?.addObject) return;

      // `home` and not `camp`: they are the same point for a camp of one, and
      // `home` is the one that stays right if the crab ever gets a packmate.
      game.objectManager.addObject(
        new ScuttleEye(
          champion,
          { x: monster.position.x, y: monster.position.y },
          { x: monster.home.x, y: monster.home.y }
        )
      );
    }),
  ];
}
