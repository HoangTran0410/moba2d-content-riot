import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const SpellObject = api.SpellObject;
const AttackableUnit = api.units.AttackableUnit;
const { PredefinedFilters } = api.combat;
const Circle = api.utils.Quadtree.Circle;

/**
 * Cuồng Cung Runaan — the ranged-only fan: every real bolt also looses two
 * side bolts at the nearest other enemies in attack range, and the side bolts
 * CARRY the wearer's on-hit effects. That last clause is the item: without
 * it this is a weaker Rìu Tiamat, with it every on-hit in the bag becomes an
 * area effect.
 *
 * Ranged-only is read off the hit itself (`hit.ranged` — the delivery's own
 * fact), never off a range threshold this file would have to keep in sync
 * with core's.
 *
 * A propagator, so `OnHit.ts`'s rule: the side bolts are `echo: true`
 * applications, and this buff refuses to act on an echo — a side bolt cannot
 * fan into side bolts, and a phantom hit cannot fan at all.
 */

/** Side bolts per swing. */
export const SIDE_BOLT_COUNT = 2;

/** A side bolt's own damage: this share of the wearer's attack damage. */
export const SIDE_BOLT_AD_RATIO = 0.45;

/** How far past the wearer's own attack range a side target may stand. */
export const SIDE_BOLT_RANGE_MARGIN = 40;

// Pale silver with only a breath of teal: airy enough to read as wind (the
// item's identity), neutral enough not to sit in the heal green's corner —
// the streak marks delivery, and the amber number on the side victim is what
// states the damage type.
const RUNAAN_WIND: [number, number, number] = [205, 228, 222];

/** Structural: what a side bolt needs of its target. */
type SideTarget = InstanceType<typeof AttackableUnit>;

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
    const reach = wearer.stats.attackRange.value + SIDE_BOLT_RANGE_MARGIN;
    const candidates = this.game.objectManager.queryObjects({
      area: new Circle({ x: wearer.position.x, y: wearer.position.y, r: reach }),
      filters: [
        PredefinedFilters.canTakeDamageFromTeam(wearer.teamId),
        PredefinedFilters.excludeObjects([hit.victim, wearer]),
        // The fan must not find what the wearer cannot: the same fog rule
        // every acquisition goes through.
        PredefinedFilters.visibleTo(wearer),
      ],
    }) as SideTarget[];

    candidates.sort(
      (first, second) =>
        Math.hypot(first.position.x - wearer.position.x, first.position.y - wearer.position.y) -
        Math.hypot(second.position.x - wearer.position.x, second.position.y - wearer.position.y)
    );

    const damage = wearer.stats.attackDamage.value * SIDE_BOLT_AD_RATIO;
    for (const target of candidates.slice(0, SIDE_BOLT_COUNT)) {
      target.takeDamage(damage, wearer, 'PHYSICAL');
      // The side bolt applies the bag's on-hit effects at ITS victim — the
      // echoed application, with the bolt's own damage as the reference hit.
      api.combat.applyOnHitEffects({
        attacker: wearer,
        victim: target,
        damage,
        ranged: true,
        crit: false,
        echo: true,
      });
      this.game.objectManager.addObject(new Item_Runaan_BoltStreak(wearer, target));
    }
  }
}

/**
 * The side bolt's whole visual: one pale streak from the wearer to the side
 * victim, gone in a fifth of a second. Instant rather than a travelling
 * missile on purpose — the damage is instant, and a projectile that arrives
 * after its own damage reads as a miss that somehow hurt.
 */
export class Item_Runaan_BoltStreak extends SpellObject {
  age = 0;
  static LIFE_MS = 190;

  private toX = 0;
  private toY = 0;

  constructor(owner: SideTarget, target: SideTarget) {
    super(owner);
    this.position.set(owner.position.x, owner.position.y);
    this.toX = target.position.x;
    this.toY = target.position.y;
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= Item_Runaan_BoltStreak.LIFE_MS) this.toRemove = true;
  }

  draw(): void {
    const fade = 1 - this.age / Item_Runaan_BoltStreak.LIFE_MS;
    const [r, g, b] = RUNAAN_WIND;
    push();
    stroke(r, g, b, 220 * fade);
    strokeWeight(3);
    line(this.position.x, this.position.y, this.toX, this.toY);
    noStroke();
    fill(255, 255, 255, 230 * fade);
    circle(this.toX, this.toY, 10);
    pop();
  }

  getDisplayBoundingBox() {
    // The streak paints far past its own centre; without a real box it
    // vanishes the moment the wearer leaves the camera (the display-bounds
    // trap every past-the-centre SpellObject falls into).
    const spanX = Math.abs(this.toX - this.position.x);
    const spanY = Math.abs(this.toY - this.position.y);
    return this.squareDisplayBoundingBox(2 * Math.max(spanX, spanY) + 40);
  }
}

export default class Item_Runaan extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_runaans_hurricane');
  name = 'Cuồng Cung Runaan (Item_Runaan)';
  description =
    `Nội tại (chỉ tướng đánh xa): mỗi đòn đánh bắn thêm ${SIDE_BOLT_COUNT} tia phụ vào các kẻ địch` +
    ` khác gần nhất, gây ${SIDE_BOLT_AD_RATIO * 100}% công và áp dụng hiệu ứng đòn đánh của bạn`;
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
