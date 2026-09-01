import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { NeutralSlot, SlotObjectFactory } from '@moba2d/core/content/types';

/**
 * Cổ Vật Hồi Máu — the source game's Health Relic, off the bridge map.
 *
 * A relic stands on a pad. A champion who walks over it takes it and is healed
 * on the spot; two and a half seconds later a **beam of light strikes the pad**
 * and heals every champion standing around it — *both teams*. Then the pad is
 * empty, and the relic is back ninety seconds after the beam.
 *
 * ## The half that makes it interesting, and that a "healing pickup" loses
 *
 * The beam does not ask whose side you are on. That is the whole object: the
 * relic is not a heal you collect, it is a **fight you start**, and a team that
 * takes one while the enemy is standing on top of it has healed the enemy more
 * than itself. Written as an allied-only pool it would be a strictly good thing
 * to walk over, which is the one shape the source game deliberately did not
 * give it.
 *
 * The second half is *how much*: a share of what is **missing**, not of the
 * pool. So it is worth most to whoever is hurt worst, worth nothing to somebody
 * standing there at full health, and — this is the part a share-of-maximum
 * cannot do — it is worth the same to a tank and to a marksman who have each
 * lost half of themselves.
 *
 * ## Why it is a slot object and not a camp
 *
 * It is the first thing this pack puts on the map that is not a body to fight.
 * `slots.neutral` used to mean "a jungle camp", and a relic modelled as one
 * would be attackable, would drop gold, would need an avatar image, and would
 * be *killed* rather than walked over — four wrong answers to hide one right
 * one. `ContentPackCode.slotObjects` (core 1.19) is the seam for exactly this:
 * a map names a point, a pack stands its own object on it, and core learns no
 * relic.
 *
 * ## Why no map ships a slot for it
 *
 * The same reason Vilemaw ships without one (`data.ts`): this pack's two maps
 * are Summoner's Rift and Twisted Treeline, and neither has health relics in
 * the source game — putting them there would be this pack inventing a map
 * rather than porting one. A hand-drawn map puts `role: "relic"` where it
 * wants one, and gets all of the below for free.
 *
 * Drawn in code rather than from art, which is not a compromise here: the
 * relic has to read as *available* or *taken* from across a lane, and a state
 * a sprite cannot show is a state a player cannot count on.
 */

/** The role a map's `slots.neutral` names to put one of these down. */
export const RELIC_ROLE = 'relic';

/**
 * How close a champion has to be to take it, when the slot does not say.
 *
 * A slot carries its own `r`, and that wins whenever it is larger: the map
 * drew a circle and the circle is what a player sees. This is only the floor
 * for a slot drawn as a point.
 */
export const RELIC_PICKUP_RADIUS = 90;

/** What the champion who took it gets at once: this share of what it is missing. */
export const RELIC_PICKUP_MISSING_SHARE = 0.08;

/**
 * The wiki's two and a half seconds between the pickup and the beam.
 *
 * It is the whole decision the relic asks for. Long enough to take one and
 * have an ally arrive to share it; long enough that taking one with the enemy
 * team standing on the pad heals them twice what it heals you.
 */
export const RELIC_BEAM_DELAY_MS = 2_500;

/** And what the beam gives everyone under it, of what each of them is missing. */
export const RELIC_BEAM_MISSING_SHARE = 0.16;

/**
 * The beam's reach: the wiki's 850 units at the half scale this pack already
 * converts the source game's distances by (`data.ts`, `boltUnitsPerSecond`;
 * `Item_Runaan.ts`, `SIDE_BOLT_SPREAD`).
 *
 * It is deliberately large — larger than a turret's reach. A radius you have
 * to stand *on* would make the relic a pickup again; at this size the question
 * is who is standing in the lane when it goes off, which is the question the
 * object exists to ask.
 */
export const RELIC_BEAM_RADIUS = 425;

/** How long the strike is on screen after it has already paid. */
export const RELIC_BEAM_FADE_MS = 600;

/**
 * The wiki's ninety seconds, and it runs **from the beam**, not from the
 * pickup — so a relic is gone for the delay plus the wait.
 */
export const RELIC_RESPAWN_MS = 90_000;

/** Pale healing green, and the stone it sits on. */
const RELIC_GLOW: [number, number, number] = [126, 232, 168];
const RELIC_STONE: [number, number, number] = [96, 108, 122];

/** Structural: what the relic needs of a body it heals. */
interface Healable {
  isDead?: boolean;
  toRemove?: boolean;
  stats: {
    health: { value: number };
    maxHealth: { value: number };
    mana?: { value: number };
    maxMana?: { value: number };
  };
  takeHeal(amount: number, source: unknown): void;
  restoreMana?(amount: number): void;
}

/**
 * One body's share of a relic, paid.
 *
 * Through `takeHeal`, never `stats.health.baseValue`: everything that argues
 * with healing — a wound, a healing-received buff — lives on that seam, and a
 * relic that put the points back by hand would be the one heal in the game no
 * counter-play reaches. The wiki says the same thing from the other end: the
 * restore *"counts as self-healing and is affected by healing modifiers"*,
 * which is also why the body is handed itself as the source.
 */
const restore = (unit: Healable, share: number): void => {
  const missingHealth = unit.stats.maxHealth.value - unit.stats.health.value;
  if (missingHealth > 0) unit.takeHeal(Math.round(missingHealth * share), unit);

  const pool = unit.stats.maxMana?.value ?? 0;
  const missingMana = pool - (unit.stats.mana?.value ?? 0);
  if (pool > 0 && missingMana > 0) unit.restoreMana?.(Math.round(missingMana * share));
};

export default function makeHealthRelic(api: ContentApi): SlotObjectFactory {
  const GameObject = api.GameObject;
  const Champion = api.units.Champion;
  const filters = api.combat.PredefinedFilters;
  const Circle = api.utils.Quadtree.Circle;
  const { GROUND_Z_INDEX } = api.layers;

  /** The context both objects below are built from — core's own, narrowed. */
  type RelicWorld = NonNullable<ConstructorParameters<typeof GameObject>[0]>['game'];

  /**
   * The beam the relic calls down. Its own object rather than a phase of the
   * relic: it lands after the relic has already gone dark, and an effect that
   * reaches this far past its source is a world object rather than something
   * drawn out of one (`docs/VFX_STANDARD.md`).
   */
  class HealthRelicBeam extends GameObject {
    zIndex = GROUND_Z_INDEX;
    private age = 0;
    private struck = false;

    constructor(game: RelicWorld, x: number, y: number) {
      super({ game, position: createVector(x, y) });
    }

    update(): void {
      this.age += deltaTime;
      if (!this.struck) {
        if (this.age < RELIC_BEAM_DELAY_MS) return;
        this.struck = true;
        this.strike();
        return;
      }
      if (this.age >= RELIC_BEAM_DELAY_MS + RELIC_BEAM_FADE_MS) this.toRemove = true;
    }

    /** Once, for everyone under it. */
    private strike(): void {
      const caught = this.game?.objectManager.queryObjects({
        area: new Circle({ x: this.position.x, y: this.position.y, r: RELIC_BEAM_RADIUS }),
        // Champions, both teams. Not `AttackableUnit`: the source game's beam
        // is champions only, and a beam that also topped up the wave would
        // make taking a relic a way to stall a push.
        filters: [filters.type(Champion), filters.excludeDead],
      }) as unknown as Healable[] | undefined;

      for (const unit of caught ?? []) {
        if (unit.toRemove) continue;
        restore(unit, RELIC_BEAM_MISSING_SHARE);
      }
    }

    draw(): void {
      const [r, g, b] = RELIC_GLOW;
      push();
      noStroke();

      if (!this.struck) {
        // The gather: a ring closing on the pad, so everybody standing near it
        // can see the beam coming and decide whether to be there.
        const charge = Math.min(1, this.age / RELIC_BEAM_DELAY_MS);
        const radius = RELIC_BEAM_RADIUS * (1 - charge * 0.85);
        noFill();
        stroke(r, g, b, 120);
        strokeWeight(2);
        circle(this.position.x, this.position.y, radius * 2);
        stroke(r, g, b, 60);
        strokeWeight(1);
        circle(this.position.x, this.position.y, RELIC_BEAM_RADIUS * 2);
        pop();
        return;
      }

      const fade = 1 - Math.min(1, (this.age - RELIC_BEAM_DELAY_MS) / RELIC_BEAM_FADE_MS);
      fill(r, g, b, 60 * fade);
      circle(this.position.x, this.position.y, RELIC_BEAM_RADIUS * 2);
      noFill();
      stroke(r, g, b, 220 * fade);
      strokeWeight(3);
      circle(this.position.x, this.position.y, RELIC_BEAM_RADIUS * 2);
      // The column itself, painted as a bright core on the pad — the map is
      // seen from above, so a beam is a spot of light, not a shaft.
      noStroke();
      fill(255, 255, 255, 210 * fade);
      circle(this.position.x, this.position.y, 70 * fade + 20);
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox(RELIC_BEAM_RADIUS * 2 + 40);
    }
  }

  /**
   * The relic itself: it never leaves the world, it is only *there* or not.
   * One object for the whole match rather than one spawned per cycle, so the
   * respawn clock cannot be lost by an object that removed itself.
   */
  class HealthRelic extends GameObject {
    zIndex = GROUND_Z_INDEX;
    /** Structures stay drawn once seen, and a pad is furniture. */
    alwaysVisible = true;

    private age = 0;
    /** Milliseconds until it is takeable again; 0 is "standing there now". */
    private cooling = 0;

    constructor(
      game: RelicWorld,
      x: number,
      y: number,
      private readonly pickupRadius: number
    ) {
      super({ game, position: createVector(x, y) });
    }

    update(): void {
      this.age += deltaTime;
      if (this.cooling > 0) {
        this.cooling = Math.max(0, this.cooling - deltaTime);
        return;
      }

      const taker = this.championOnIt();
      if (!taker) return;

      // The wiki's ninety seconds run from the strike, not from the pickup, so
      // the pad is dark for the delay on top of the wait.
      this.cooling = RELIC_BEAM_DELAY_MS + RELIC_RESPAWN_MS;
      restore(taker, RELIC_PICKUP_MISSING_SHARE);
      this.game?.objectManager.addObject?.(
        new HealthRelicBeam(this.game, this.position.x, this.position.y)
      );
    }

    /** Whoever is standing on it, or nothing. */
    private championOnIt(): Healable | null {
      const found = this.game?.objectManager.queryObjects({
        area: new Circle({ x: this.position.x, y: this.position.y, r: this.pickupRadius }),
        filters: [filters.type(Champion), filters.excludeDead],
      }) as unknown as Healable[] | undefined;
      return found?.[0] ?? null;
    }

    draw(): void {
      const [sr, sg, sb] = RELIC_STONE;
      push();
      noStroke();
      // The pad stays whether the relic is on it or not, which is what makes
      // an empty one readable as "this is coming back".
      fill(sr, sg, sb, 190);
      circle(this.position.x, this.position.y, 46);
      fill(sr + 20, sg + 20, sb + 20, 150);
      circle(this.position.x, this.position.y, 34);

      if (this.cooling > 0) {
        // How much of the wait is done, drawn as a filling arc rather than a
        // number: it is read from across a lane, not looked at.
        const wait = RELIC_BEAM_DELAY_MS + RELIC_RESPAWN_MS;
        const done = 1 - this.cooling / wait;
        noFill();
        stroke(sr + 60, sg + 60, sb + 60, 170);
        strokeWeight(3);
        arc(this.position.x, this.position.y, 44, 44, -HALF_PI, -HALF_PI + TWO_PI * done);
        pop();
        return;
      }

      const [r, g, b] = RELIC_GLOW;
      // A slow bob, so a relic that has been sitting there all game still
      // reads as something rather than as a mark on the ground.
      const bob = Math.sin(this.age / 420) * 4;
      fill(r, g, b, 60);
      circle(this.position.x, this.position.y + bob, 40);
      fill(r, g, b, 235);
      // A cross, which is what the thing means, and which no other object on
      // this map draws.
      rectMode(CENTER);
      rect(this.position.x, this.position.y + bob, 20, 7, 2);
      rect(this.position.x, this.position.y + bob, 7, 20, 2);
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox(Math.max(this.pickupRadius, 60) * 2);
    }
  }

  return (slot: NeutralSlot, game) =>
    new HealthRelic(game, slot.x, slot.y, Math.max(RELIC_PICKUP_RADIUS, slot.r ?? 0));
}
