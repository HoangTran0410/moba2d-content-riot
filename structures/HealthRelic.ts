import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { NeutralSlot, SlotObjectFactory } from '@moba2d/core/content/types';

/**
 * Cổ Vật Hồi Máu — the source game's Health Relic, off the bridge map.
 *
 * A relic stands on a point of the map. A champion who walks over it takes it,
 * and what is left behind is a pool of healing that anything on that
 * champion's side can stand in — so the relic is not a pickup you take *from*
 * your team, it is a pickup you take *for* it. Then it is gone, and it comes
 * back on a clock everyone can count.
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

/**
 * The beat between the touch and the pool — the relic breaks open before
 * anything is healed.
 *
 * It is what makes the relic a *decision* rather than a pickup: a second is
 * long enough to walk in, take it, and have somebody arrive to share it, and
 * long enough that taking one while running past heals almost nobody.
 */
export const RELIC_BLOOM_MS = 900;

/** How long the pool lasts, and how often it pays. */
export const RELIC_ZONE_MS = 4_000;
export const RELIC_ZONE_TICK_MS = 500;
export const RELIC_ZONE_RADIUS = 220;

/**
 * What one tick restores, as a share of the body's own maximum.
 *
 * A share rather than a flat number, and the reason is this pack's own roster:
 * a tank carries twice a marksman's pool and four times a minion's, and a flat
 * relic would be a full heal for the wave and a rounding error for the tank.
 * Eight ticks over four seconds, so a body that stands in the whole pool gets
 * a fifth of itself back.
 */
export const RELIC_HEAL_SHARE = 0.025;
export const RELIC_MANA_SHARE = 0.025;

/** How long until it is back. Long enough to be worth walking to. */
export const RELIC_RESPAWN_MS = 60_000;

/** Pale healing green, and the stone it sits on. */
const RELIC_GLOW: [number, number, number] = [126, 232, 168];
const RELIC_STONE: [number, number, number] = [96, 108, 122];

/** Structural: what the relic needs of a body it heals. */
interface Healable {
  teamId?: string;
  isDead?: boolean;
  toRemove?: boolean;
  position: { x: number; y: number };
  stats: { maxHealth: { value: number }; maxMana?: { value: number } };
  takeHeal(amount: number, source: unknown): void;
  restoreMana?(amount: number): void;
}

export default function makeHealthRelic(api: ContentApi): SlotObjectFactory {
  const GameObject = api.GameObject;
  const Champion = api.units.Champion;
  const AttackableUnit = api.units.AttackableUnit;
  const filters = api.combat.PredefinedFilters;
  const Circle = api.utils.Quadtree.Circle;
  const { GROUND_Z_INDEX } = api.layers;

  /** The context both objects below are built from — core's own, narrowed. */
  type RelicWorld = NonNullable<ConstructorParameters<typeof GameObject>[0]>['game'];

  /**
   * The pool the relic leaves behind. Its own object rather than a phase of
   * the relic: the relic is back on its stone long before the last tick, and
   * an effect that reaches this far past its source is a world object, not
   * something drawn out of one (`docs/VFX_STANDARD.md`).
   */
  class HealthRelicZone extends GameObject {
    zIndex = GROUND_Z_INDEX;
    private age = 0;
    /**
     * Armed, so the pool pays on the frame it opens rather than half a second
     * later. A champion who walked in to take the relic is already standing in
     * what it left, and a pool that makes them wait for its first tick is a
     * pool that heals them seven times instead of eight.
     */
    private sinceTick = RELIC_ZONE_TICK_MS;

    constructor(
      game: RelicWorld,
      x: number,
      y: number,
      /** Whose side drinks from it — the champion who took the relic. */
      private readonly forTeam: string,
      /** Credited with the healing, so the recap names a champion. */
      private readonly taker: unknown
    ) {
      super({ game, position: createVector(x, y) });
    }

    update(): void {
      this.age += deltaTime;
      if (this.age >= RELIC_ZONE_MS) {
        this.toRemove = true;
        return;
      }

      this.sinceTick += deltaTime;
      if (this.sinceTick < RELIC_ZONE_TICK_MS) return;
      this.sinceTick -= RELIC_ZONE_TICK_MS;

      const inside = this.game?.objectManager.queryObjects({
        area: new Circle({
          x: this.position.x,
          y: this.position.y,
          r: RELIC_ZONE_RADIUS,
        }),
        filters: [filters.type(AttackableUnit), filters.excludeDead],
      }) as unknown as Healable[] | undefined;

      for (const unit of inside ?? []) {
        if (unit.teamId !== this.forTeam || unit.toRemove) continue;
        // Through `takeHeal`, never `stats.health.baseValue`: everything that
        // argues with healing — a wound, a healing-received buff — lives on
        // that seam, and a relic that put the points back by hand would be
        // the one heal in the game no counter-play reaches.
        unit.takeHeal(Math.round(unit.stats.maxHealth.value * RELIC_HEAL_SHARE), this.taker);
        const pool = unit.stats.maxMana?.value ?? 0;
        if (pool > 0) unit.restoreMana?.(Math.round(pool * RELIC_MANA_SHARE));
      }
    }

    draw(): void {
      const life = this.age / RELIC_ZONE_MS;
      // Blooms open over the first fifth, then holds and fades.
      const spread = Math.min(1, life * 5);
      const fade = 1 - Math.max(0, (life - 0.6) / 0.4);
      const radius = RELIC_ZONE_RADIUS * spread;
      const [r, g, b] = RELIC_GLOW;

      push();
      noStroke();
      fill(r, g, b, 34 * fade);
      circle(this.position.x, this.position.y, radius * 2);
      noFill();
      stroke(r, g, b, 150 * fade);
      strokeWeight(2);
      circle(this.position.x, this.position.y, radius * 2);
      // An inner ring that keeps breathing, so a pool that is still paying
      // never looks like one that has already finished.
      stroke(r, g, b, 90 * fade);
      strokeWeight(1);
      circle(this.position.x, this.position.y, radius * (1.1 + 0.5 * Math.sin(this.age / 260)));
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox(RELIC_ZONE_RADIUS * 2 + 40);
    }
  }

  /**
   * The relic itself: it never leaves the world, it is only *ready* or not.
   * One object for the whole match rather than one spawned per cycle, so the
   * respawn clock cannot be lost by an object that removed itself.
   */
  class HealthRelic extends GameObject {
    zIndex = GROUND_Z_INDEX;
    /** Structures stay drawn once seen, and a relic is furniture. */
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

      this.cooling = RELIC_RESPAWN_MS;
      this.game?.objectManager.addObject?.(
        new HealthRelicZone(
          this.game,
          this.position.x,
          this.position.y,
          String((taker as { teamId?: string }).teamId ?? ''),
          taker
        )
      );
    }

    /** Whoever is standing on it, or nothing. */
    private championOnIt(): unknown {
      const found = this.game?.objectManager.queryObjects({
        area: new Circle({ x: this.position.x, y: this.position.y, r: this.pickupRadius }),
        filters: [filters.type(Champion), filters.excludeDead],
      });
      return found?.[0] ?? null;
    }

    draw(): void {
      const [sr, sg, sb] = RELIC_STONE;
      push();
      noStroke();
      // The stone stays whether the relic is on it or not, which is what makes
      // an empty socket readable as "this one is coming back".
      fill(sr, sg, sb, 190);
      circle(this.position.x, this.position.y, 46);
      fill(sr + 20, sg + 20, sb + 20, 150);
      circle(this.position.x, this.position.y, 34);

      if (this.cooling > 0) {
        // How much of the wait is done, drawn as a filling arc rather than a
        // number: it is read from across a lane, not looked at.
        const done = 1 - this.cooling / RELIC_RESPAWN_MS;
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
