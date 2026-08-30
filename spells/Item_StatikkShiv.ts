import type { AttackableUnit, CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const SpellObject = api.SpellObject;
const PredefinedFilters = api.combat.PredefinedFilters;

/**
 * Móc Sét Statikk — the shop's first **meter**, as opposed to its first
 * rhythm (Móc Diệt Thủy Quái counts to three) or its first window (the
 * spellblade family arms off a cast).
 *
 * Swinging banks charge. When the meter fills, the next swing spends all of it
 * at once: the victim eats a bolt and the bolt jumps to the nearest few enemies
 * standing around them. That is the item — it is bought to clear a wave and to
 * punish people for standing together, and neither of those is a thing any
 * other passive in this shop does.
 *
 * The meter lives on one permanent buff, like every other item passive here, so
 * there is nothing to desync and selling the item takes the charge with it
 * (`sourceSpell`).
 */

/** Charge banked per landed basic attack. Three swings fills the meter. */
export const ENERGIZE_PER_HIT = 34;

/** The meter. */
export const ENERGIZED_AT = 100;

/** What the bolt deals — to the victim and to each enemy it jumps to. */
export const SHIV_DAMAGE = 16;

/** How many *other* enemies the bolt jumps to. */
export const CHAIN_TARGETS = 3;

/** How far it will jump, measured from the victim rather than from the holder. */
export const CHAIN_RADIUS = 250;

export const CHAIN_STACK_ID = 'item_statikk';

/** How long the arcs stay on screen. Inside the item noise budget. */
export const ARC_MS = 240;

// Electric cyan-white. A magic proc, so a cool hue — and the violet damage
// number beside it is what states the type.
const SPARK: [number, number, number] = [150, 225, 255];
const SPARK_CORE: [number, number, number] = [235, 250, 255];

export class Item_StatikkShiv_Charge extends Buff {
  name = 'Móc Sét Statikk';
  description =
    `Đòn đánh tích điện; khi đầy, đòn tiếp theo gây ` +
    `<span class="damage magic">${SHIV_DAMAGE} sát thương phép</span> và lan sang ` +
    `<span class="buff">${CHAIN_TARGETS} kẻ địch</span> xung quanh.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  /** 0 .. `ENERGIZED_AT`. The whole item. */
  charge = 0;

  onHit(hit: OnHitEvent): void {
    // A plain payload ignores `echo` and simply runs again when something
    // doubles it — but *banking* off an echo would turn "three swings" into
    // "two swings" the moment Bình Minh & Hoàng Hôn shares the bag, so the
    // meter counts real swings only.
    if (hit.echo) return;

    this.charge = Math.min(ENERGIZED_AT, this.charge + ENERGIZE_PER_HIT);
    if (this.charge < ENERGIZED_AT) return;
    this.charge = 0;

    hit.victim.takeDamage(SHIV_DAMAGE, this.targetUnit, 'MAGIC', 'Móc Sét Statikk');

    const jumps = this.nearbyEnemies(hit.victim);
    for (const jump of jumps) {
      jump.takeDamage(SHIV_DAMAGE, this.targetUnit, 'MAGIC', 'Móc Sét Statikk');
    }

    const arc = new Item_StatikkShiv_Arc(this.targetUnit, hit.victim, jumps);
    this.game.objectManager.addObject(arc);
  }

  /**
   * Who the bolt jumps to: hostiles standing around **the victim**, not around
   * the holder — the item punishes a clump, and the clump is wherever the
   * arrow landed.
   *
   * Not vision-gated. Vision gates *acquisition* — choosing whom to shoot —
   * and this is a proc fanning out from a hit that already landed, the same
   * rule Cuồng Cung Runaan's side bolts follow.
   */
  private nearbyEnemies(victim: AttackableUnit): AttackableUnit[] {
    const found = this.game.objectManager.queryObjects({
      area: new api.utils.Quadtree.Circle({
        x: victim.position.x,
        y: victim.position.y,
        r: CHAIN_RADIUS,
      }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.targetUnit.teamId)],
    }) as AttackableUnit[];

    const out: AttackableUnit[] = [];
    for (const unit of found) {
      if (unit === victim || unit === this.targetUnit) continue;
      out.push(unit);
      if (out.length === CHAIN_TARGETS) break;
    }
    return out;
  }

  /**
   * The worn state: a thin ring of sparks that only appears once the meter is
   * actually full, so it reads as "this swing procs" rather than as an
   * always-on glow. Honest by construction — it tests the same number `onHit`
   * spends against.
   */
  draw(): void {
    if (this.charge < ENERGIZED_AT) return;
    const unit = this.targetUnit;
    const radius = unit.animatedValues.displaySize / 2 + 7;
    const [r, g, b] = SPARK;

    push();
    noFill();
    stroke(r, g, b, 210 + 40 * Math.sin(frameCount / 5));
    strokeWeight(2);
    // A jagged ring rather than a circle: the shape is the item's identity,
    // and one layer has to carry it.
    beginShape();
    for (let i = 0; i <= 12; i++) {
      const a = (TWO_PI * i) / 12;
      const spike = i % 2 === 0 ? radius : radius * 0.78;
      vertex(unit.position.x + cos(a) * spike, unit.position.y + sin(a) * spike);
    }
    endShape();
    pop();
  }
}

/** One frame of forked lightning: victim first, then each jump. */
export class Item_StatikkShiv_Arc extends SpellObject {
  age = 0;
  victim: AttackableUnit;
  jumps: AttackableUnit[];
  /** Seeded once — a fork re-rolled per frame flickers instead of animating. */
  _kinks: number[] = [];

  constructor(owner: AttackableUnit, victim: AttackableUnit, jumps: AttackableUnit[]) {
    super(owner);
    this.victim = victim;
    this.jumps = jumps;
    this.position = victim.position.copy();
  }

  onAdded(): void {
    for (let i = 0; i < 12; i++) this._kinks.push(random(-1, 1));
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= ARC_MS) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / ARC_MS, 0, 1);
    const fade = 1 - t * t;

    push();
    // The strike itself: holder to victim, then victim onward to each jump.
    // Drawn as one chain so the player reads "it travelled", not "three
    // separate flashes happened".
    this._bolt(this.owner.position, this.victim.position, fade, 0);
    for (let i = 0; i < this.jumps.length; i++) {
      this._bolt(this.victim.position, this.jumps[i].position, fade, (i + 1) * 3);
    }
    pop();
  }

  private _bolt(
    from: { x: number; y: number },
    to: { x: number; y: number },
    fade: number,
    seed: number
  ): void {
    const segments = 6;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const nx = -dy;
    const ny = dx;

    for (const [color, weight] of [
      [SPARK, 6] as const,
      [SPARK_CORE, 2] as const,
    ]) {
      stroke(color[0], color[1], color[2], 230 * fade);
      strokeWeight(weight * fade + 1);
      noFill();
      beginShape();
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const kink = i === 0 || i === segments ? 0 : this._kinks[(seed + i) % this._kinks.length];
        vertex(from.x + dx * u + nx * kink * 0.045, from.y + dy * u + ny * kink * 0.045);
      }
      endShape();
    }
  }

  /** Drawn from the holder out to the furthest jump, so the box has to hold all of it. */
  getDisplayBoundingBox() {
    const xs = [this.owner.position.x, this.victim.position.x, ...this.jumps.map(u => u.position.x)];
    const ys = [this.owner.position.y, this.victim.position.y, ...this.jumps.map(u => u.position.y)];
    const pad = 40;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return new api.utils.Quadtree.Rectangle({
      x,
      y,
      w: Math.max(...xs) - Math.min(...xs) + pad * 2,
      h: Math.max(...ys) - Math.min(...ys) + pad * 2,
      data: this,
    });
  }
}

export default class Item_StatikkShiv extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_statikk_shiv');
  name = 'Móc Sét Statikk (Item_StatikkShiv)';
  description =
    `Nội tại: mỗi đòn đánh tích ${ENERGIZE_PER_HIT} điện; đủ ${ENERGIZED_AT} thì đòn kế tiếp` +
    ` phóng tia sét gây ${SHIV_DAMAGE} sát thương phép lên mục tiêu và lan sang` +
    ` ${CHAIN_TARGETS} kẻ địch gần đó`;
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
    const charge = new Item_StatikkShiv_Charge(0, this.owner, this.owner);
    charge.stackId = CHAIN_STACK_ID;
    charge.image = this.image;
    // Tied to the item: selling Móc Sét Statikk takes the meter with it.
    charge.sourceSpell = this;
    this.owner.addBuff(charge);
  }
}
