import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const HomingMissileSpellObject = api.HomingMissileSpellObject;
const AttackableUnit = api.units.AttackableUnit;
const { PredefinedFilters } = api.combat;
const Circle = api.utils.Quadtree.Circle;

/**
 * Cuồng Cung Runaan — the ranged-only fan: every real bolt also looses two
 * side bolts at the enemies standing **next to whoever was hit**, and the side
 * bolts CARRY the wearer's on-hit effects. That last clause is the item:
 * without it this is a weaker Rìu Tiamat, with it every on-hit in the bag
 * becomes an area effect.
 *
 * Ranged-only is read off the hit itself (`hit.ranged` — the delivery's own
 * fact), never off a range threshold this file would have to keep in sync
 * with core's.
 *
 * A propagator, so `OnHit.ts`'s rule: the side bolts are `echo: true`
 * applications, and this buff refuses to act on an echo — a side bolt cannot
 * fan into side bolts, and a phantom hit cannot fan at all.
 *
 * ## Around the victim, and inside the wearer's own reach
 *
 * The first version picked the nearest enemies to the **wearer** and let them
 * stand `attackRange + 40` away. Both halves were wrong on screen. Nearest to
 * the wearer is not "next to the target": shooting a body to your north
 * regularly loosed the side bolts at two minions to your *south*, a fan
 * pointing away from what it was fanning off. And the margin meant a side bolt
 * reached somewhere the wearer could not have shot at all.
 *
 * So the query is a circle on the **victim**, `SIDE_BOLT_SPREAD` wide — the
 * source item's own rule — intersected with what the wearer could legitimately
 * have attacked. Both conditions, because either alone is a fan a player
 * cannot predict from where they are standing.
 *
 * ## They are real bolts now
 *
 * They used to be a line drawn from the wearer to a body that had already
 * taken the damage. A ranged basic attack in this engine is a *missile* with a
 * flight, and an item whose whole identity is "your attack becomes three
 * attacks" reading as two instant lines is the wrong object: the fan cannot be
 * outrun, cannot be seen coming, and does not land at the same time as the
 * swing it came from. Each side bolt is a `HomingMissileSpellObject` carrying
 * the wearer's own missile speed, and everything it does — the damage and the
 * carried on-hits — happens where it arrives.
 */

/** Side bolts per swing. */
export const SIDE_BOLT_COUNT = 2;

/** A side bolt's own damage: this share of the wearer's attack damage. */
export const SIDE_BOLT_AD_RATIO = 0.45;

/**
 * How far from **the victim** a side target may stand.
 *
 * The source item's own 375 units, at the half scale this pack already
 * converts the wiki's missile speeds by (`data.ts`, `boltUnitsPerSecond`).
 */
export const SIDE_BOLT_SPREAD = 190;

/**
 * A side bolt's flight, for a wearer whose champion declares no missile speed
 * of its own — the same fallback shape `Champion.attackBoltUnitsPerSecond`
 * has, in units a second.
 */
export const SIDE_BOLT_UNITS_PER_SECOND = 1_000;

// Pale silver with only a breath of teal: airy enough to read as wind (the
// item's identity), neutral enough not to sit in the heal green's corner —
// the streak marks delivery, and the amber number on the side victim is what
// states the damage type.
const RUNAAN_WIND: [number, number, number] = [205, 228, 222];

/** Structural: what a side bolt needs of its target. */
type SideTarget = InstanceType<typeof AttackableUnit>;

/**
 * The reach the swing itself used, restated for the bolts it fans.
 *
 * `combat/Reach.ts` is deliberately *not* the answer here — its own header
 * says so: "Basic attacks are outside this module too. `attackRange` is
 * already authored surface to surface, so `BasicAttackController.reachTo`
 * adds whole radii on purpose." A side bolt is a copy of the basic attack, so
 * it must ask the copy's own question, and it asks the controller directly
 * whenever there is one. The sum below is the same line from `reachTo`, kept
 * only because a wearer is an `AttackableUnit` to the type system while in the
 * game it is always a champion, which carries one.
 */
const swingReach = (wearer: SideTarget, target: SideTarget): number => {
  const swing = (wearer as { basicAttack?: { reachTo?(unit: SideTarget): number } }).basicAttack;
  const measured = swing?.reachTo?.(target);
  return (
    measured ??
    wearer.stats.attackRange.value +
      wearer.stats.size.value / 2 +
      (target.stats?.size?.value ?? 0) / 2
  );
};

export class Item_Runaan_Wind extends Buff {
  name = 'Cuồng Cung Runaan';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // A permanent armed state: the inventory slot already shows the item, so
  // this stays off the HUD buff row and the overhead strip (Buff.hudVisible).
  hudVisible = false;

  onHit(hit: OnHitEvent): void {
    if (hit.echo) return;
    if (!hit.ranged) return;

    const wearer = this.targetUnit;
    const victim = hit.victim;
    const candidates = this.game.objectManager
      .queryObjects({
        // On the victim, not on the wearer: the fan is a spread off what was
        // shot. See this file's header.
        area: new Circle({ x: victim.position.x, y: victim.position.y, r: SIDE_BOLT_SPREAD }),
        filters: [
          PredefinedFilters.canTakeDamageFromTeam(wearer.teamId),
          PredefinedFilters.excludeObjects([victim, wearer]),
          // The fan must not find what the wearer cannot: the same fog rule
          // every acquisition goes through.
          PredefinedFilters.visibleTo(wearer),
        ],
      })
      // …and never past what the wearer could have shot itself.
      .filter(candidate => {
        const target = candidate as SideTarget;
        return (
          Math.hypot(target.position.x - wearer.position.x, target.position.y - wearer.position.y) <=
          swingReach(wearer, target)
        );
      }) as SideTarget[];

    const spreadFrom = (target: SideTarget): number =>
      Math.hypot(target.position.x - victim.position.x, target.position.y - victim.position.y);
    candidates.sort((first, second) => spreadFrom(first) - spreadFrom(second));

    const damage = wearer.stats.attackDamage.value * SIDE_BOLT_AD_RATIO;
    for (const target of candidates.slice(0, SIDE_BOLT_COUNT)) {
      const bolt = new Item_Runaan_SideBolt(wearer, target);
      bolt.damage = damage;
      bolt.speed = (wearer.attackBoltUnitsPerSecond ?? SIDE_BOLT_UNITS_PER_SECOND) / 60;
      bolt.position.set(wearer.position.x, wearer.position.y);
      this.game.objectManager.addObject(bolt);
    }
  }
}

/**
 * One side bolt: a real missile, homing on the body it was loosed at.
 *
 * `HomingMissileSpellObject` already refuses to collide with anything on the
 * way (`maxHitCount = 0`) and removes itself if its target dies first, which
 * is exactly a basic attack's own bolt behaviour — a fan that killed a minion
 * standing between it and its target would be a third attack, not a copy of
 * the first.
 */
export class Item_Runaan_SideBolt extends HomingMissileSpellObject {
  size = 13;
  /** Snapshotted at the swing, so the fan cannot grow mid-flight. */
  damage = 0;

  onTargetArrive(target: SideTarget): void {
    target.takeDamage(this.damage, this.owner as SideTarget, 'PHYSICAL', 'Cuồng Cung Runaan');
    // The side bolt applies the bag's on-hit effects at ITS victim — the
    // echoed application, with the bolt's own damage as the reference hit.
    api.combat.applyOnHitEffects({
      attacker: this.owner as SideTarget,
      victim: target,
      damage: this.damage,
      ranged: true,
      crit: false,
      echo: true,
    });
  }

  draw(): void {
    const [r, g, b] = RUNAAN_WIND;
    const heading = Math.atan2(
      this.destination.y - this.position.y,
      this.destination.x - this.position.x
    );
    push();
    translate(this.position.x, this.position.y);
    rotate(heading);
    // The streak it drags, so the shot reads as a direction rather than a dot.
    stroke(r, g, b, 150);
    strokeWeight(2);
    line(-this.size * 1.6, 0, -this.size * 0.4, 0);
    noStroke();
    fill(r, g, b, 235);
    // A sliver rather than a circle: two of these arriving with the swing is
    // the whole read, and a round bolt is every other projectile in the game.
    triangle(this.size * 0.5, 0, -this.size * 0.4, -this.size * 0.28, -this.size * 0.4, this.size * 0.28);
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(this.size * 4);
  }
}


export default class Item_Runaan extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_runaans_hurricane');
  name = 'Cuồng Cung Runaan (Item_Runaan)';
  description =
    `Nội tại (chỉ tướng đánh xa): mỗi đòn đánh bắn thêm ${SIDE_BOLT_COUNT} tia phụ vào các kẻ địch` +
    ` đứng cạnh mục tiêu, gây ${pct(SIDE_BOLT_AD_RATIO)}% công và áp dụng hiệu ứng đòn đánh của bạn`;
  coolDown = 0;
  manaCost = 0;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: 0 },
    };
  }

  onSpellCast() {
    const wind = new Item_Runaan_Wind(0, this.owner, this.owner);
    wind.stackId = 'item_runaan';
    wind.image = this.image;
    wind.sourceSpell = this;
    this.owner.addBuff(wind);
  }
}
