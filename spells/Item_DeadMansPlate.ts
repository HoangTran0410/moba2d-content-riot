import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Slow = api.buffs.Slow;
const AoePulse = api.AoePulse;
const StatsModifier = api.units.StatsModifier;

/**
 * Giáp Người Chết — the only thing in this shop that charges off **walking**.
 *
 * Every other passive here is paid for by swinging: a count of attacks, a
 * window opened by a cast, a meter filled by hits. This one is paid for by
 * distance covered, which makes it the item that rewards the decision the
 * others cannot see — closing the gap. Momentum makes you faster while you
 * carry it, and the swing that finally lands spends every point of it at once
 * and staggers whoever you caught.
 *
 * ## Why the speed is a `StatsModifier` and not a `Speedup`
 *
 * `Speedup` reads its `percent` once, in `onCreate`, and builds a modifier
 * from it — so a live buff whose percent should climb every frame cannot be
 * one: re-adding it under `RENEW_EXISTING` only rewinds the clock and the
 * bonus stays whatever it was on the first frame, and re-adding it under the
 * default stacks ten deep. Momentum owns its own `StatsModifier` and swaps it
 * whenever the bonus actually changes — which is what `StatAmp` does
 * internally for exactly the same reason.
 *
 * The swap is **quantised** (`SPEED_STEPS`): rebuilding and re-applying a
 * modifier sixty times a second to move a number by a thousandth is work
 * nobody can see. Ten buckets is finer than the eye and ~600× cheaper.
 */

/** The meter. Full momentum is the maximum bonus and the maximum impact. */
export const MAX_MOMENTUM = 100;

/** Banked per second of walking. Two and a half seconds fills it. */
export const MOMENTUM_PER_SECOND = 40;

/** Bled per second of standing still. Slower than it builds, on purpose. */
export const MOMENTUM_DECAY_PER_SECOND = 25;

/** Movement under this in one frame is standing still (jitter, a push-out). */
export const MOVEMENT_EPSILON = 0.4;

/** Movement speed at full momentum, as a share of the base. */
export const SPEED_AT_FULL = 0.3;

/** How many buckets the speed bonus is quantised into. See the header. */
export const SPEED_STEPS = 10;

/** Bonus physical damage the impact deals at full momentum, scaling from zero. */
export const IMPACT_DAMAGE_AT_FULL = 20;

/** Below this share of the meter the impact lands but does not stagger. */
export const SLOW_THRESHOLD = 0.5;

export const SLOW_PERCENT = 0.5;
export const SLOW_MS = 900;

export const MOMENTUM_STACK_ID = 'item_dead_mans_plate';
export const IMPACT_SLOW_STACK_ID = 'item_dead_mans_plate_slow';

/** The impact flash: one layer, inside the item noise budget. */
export const IMPACT_FLASH_RADIUS = 52;
export const IMPACT_FLASH_MS = 260;

// Cold steel over a warm core — a physical proc, so the amber family, kept
// desaturated so a full meter reads against the champion rather than over it.
const PLATE_STEEL: [number, number, number] = [190, 200, 215];
const PLATE_IMPACT: [number, number, number] = [235, 175, 95];

export class Item_DeadMansPlate_Momentum extends Buff {
  name = 'Giáp Người Chết';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  /** 0 .. `MAX_MOMENTUM`. */
  momentum = 0;

  private modifier = new StatsModifier();
  /** Which speed bucket is currently applied, so the swap is rare. */
  private appliedStep = 0;
  private lastX = 0;
  private lastY = 0;
  private started = false;

  onActivate(): void {
    this.lastX = this.targetUnit.position.x;
    this.lastY = this.targetUnit.position.y;
    this.started = true;
  }

  onDeactivate(): void {
    this.targetUnit.stats.removeModifier(this.modifier);
    this.appliedStep = 0;
  }

  onUpdate(): void {
    if (!this.started) return;

    const at = this.targetUnit.position;
    const stepped = Math.hypot(at.x - this.lastX, at.y - this.lastY);
    this.lastX = at.x;
    this.lastY = at.y;

    const seconds = deltaTime / 1_000;
    this.momentum +=
      stepped > MOVEMENT_EPSILON
        ? MOMENTUM_PER_SECOND * seconds
        : -MOMENTUM_DECAY_PER_SECOND * seconds;
    this.momentum = constrain(this.momentum, 0, MAX_MOMENTUM);

    this.applySpeed();
  }

  onHit(hit: OnHitEvent): void {
    // A plain payload runs again when something doubles it, but *spending* the
    // meter twice off one swing is not doubling, it is double-dipping — and an
    // echo arrives with the meter already emptied anyway, so this guard is the
    // honest statement of the rule rather than an optimisation.
    if (hit.echo) return;
    if (this.momentum <= 0) return;

    const share = this.momentum / MAX_MOMENTUM;
    hit.victim.takeDamage(
      IMPACT_DAMAGE_AT_FULL * share,
      this.targetUnit,
      'PHYSICAL',
      'Giáp Người Chết'
    );

    // The stagger is the *heavy* impact only: a half-charged shoulder barge
    // shoves, a full one stops you.
    if (share >= SLOW_THRESHOLD) {
      const slow = new Slow(SLOW_MS, this.targetUnit, hit.victim);
      slow.name = 'Giáp Người Chết';
      slow.stackId = IMPACT_SLOW_STACK_ID;
      slow.percent = SLOW_PERCENT;
      slow.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      hit.victim.addBuff(slow);
    }

    this.showImpact(hit, share);

    this.momentum = 0;
    this.applySpeed();
  }

  /** Rebuild and re-apply only when the bucket actually moved. See the header. */
  private applySpeed(): void {
    const step = Math.round((this.momentum / MAX_MOMENTUM) * SPEED_STEPS);
    if (step === this.appliedStep) return;

    this.targetUnit.stats.removeModifier(this.modifier);
    this.modifier = new StatsModifier();
    this.modifier.speed.percentBaseBonus = (SPEED_AT_FULL * step) / SPEED_STEPS;
    this.targetUnit.stats.addModifier(this.modifier);
    this.appliedStep = step;
  }

  private showImpact(hit: OnHitEvent, share: number): void {
    const flash = new AoePulse(this.targetUnit);
    flash.position = hit.victim.position.copy();
    flash.radius = IMPACT_FLASH_RADIUS * (0.5 + share * 0.5);
    flash.lifeTime = IMPACT_FLASH_MS;
    flash.color = [...PLATE_IMPACT];
    flash.fillAlpha = 30;
    this.game.objectManager.addObject(flash);
  }

  /**
   * The meter, worn as an arc that fills clockwise off the top of the body —
   * one thin stroke, no fill, and it goes bright only at full charge because
   * that is the one moment the number changes the player's decision (barge
   * now, or keep walking).
   */
  draw(): void {
    if (this.momentum <= 0) return;
    const unit = this.targetUnit;
    const size = unit.animatedValues.displaySize + 16;
    const share = this.momentum / MAX_MOMENTUM;
    const full = share >= 1;
    const [r, g, b] = full ? PLATE_IMPACT : PLATE_STEEL;

    push();
    noFill();
    stroke(r, g, b, 70);
    strokeWeight(2);
    circle(unit.position.x, unit.position.y, size);
    stroke(r, g, b, full ? 245 : 190);
    strokeWeight(full ? 4 : 3);
    arc(unit.position.x, unit.position.y, size, size, -HALF_PI, -HALF_PI + TWO_PI * share);
    pop();
  }
}

export default class Item_DeadMansPlate extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_dead_mans_plate');
  name = 'Giáp Người Chết (Item_DeadMansPlate)';
  description =
    `Nội tại: di chuyển tích lực, tối đa tăng ${SPEED_AT_FULL * 100}% tốc chạy;` +
    ` đòn đánh kế tiếp xả toàn bộ lực, gây tới ${IMPACT_DAMAGE_AT_FULL} sát thương vật lý` +
    ` và làm chậm ${SLOW_PERCENT * 100}% khi tích đầy`;
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
    const momentum = new Item_DeadMansPlate_Momentum(0, this.owner, this.owner);
    momentum.stackId = MOMENTUM_STACK_ID;
    momentum.image = this.image;
    // Tied to the item: selling it takes the speed and the meter with it, and
    // `onDeactivate` is what hands the movement bonus back.
    momentum.sourceSpell = this;
    this.owner.addBuff(momentum);
  }
}
