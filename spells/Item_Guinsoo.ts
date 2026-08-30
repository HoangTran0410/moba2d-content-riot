import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const StatAmp = api.buffs.StatAmp;
const AoePulse = api.AoePulse;
const BuffAddType = api.enums.BuffAddType;

/**
 * Cuồng Đao Guinsoo — the on-hit build's keystone, in two halves the source
 * item also has:
 *
 *   1. **Rage.** Every swing grants a short attack-speed stack, up to
 *      `RAGE_MAX_STACKS` — the weapon spins up as long as the wearer keeps
 *      swinging and falls off when they stop (per-stack timers, which is what
 *      `STACKS_AND_OVERLAPS` is for).
 *   2. **The phantom hit.** At full rage, every `PHANTOM_HIT_INTERVAL`-th
 *      swing applies the wearer's ON-HIT EFFECTS a second time — Đao Tím
 *      stings twice, Nanh Nashor bites twice, Gươm Suy Vong carves twice.
 *      Not the swing's own damage: the *effects*, which is the whole reason
 *      to build this item beside them.
 *
 * The phantom is a propagator, so it obeys `OnHit.ts`'s termination rule:
 * everything it starts is `echo: true`, and it refuses to act on an echo —
 * two Guinsoos (impossible) or Guinsoo plus Bình Minh & Hoàng Hôn (very
 * possible) chain off the real swing only, never off each other.
 */

/** Attack speed per rage stack (attacks per second, flat). */
export const RAGE_ATTACK_SPEED_PER_STACK = 0.08;

/** How many stacks the blade holds at once. */
export const RAGE_MAX_STACKS = 6;

/** ms one stack lives without being refreshed by another swing. */
export const RAGE_STACK_MS = 4_000;

/** At full rage, every this-many-th swing is doubled. */
export const PHANTOM_HIT_INTERVAL = 3;

export const RAGE_STACK_ID = 'item_guinsoo_rage_stack';

const GUINSOO_FLAME: [number, number, number] = [255, 130, 70];

export class Item_Guinsoo_Rage extends Buff {
  name = 'Cuồng Đao Guinsoo';
  description =
    `Mỗi đòn đánh cộng <span class="buff">+${pct(RAGE_ATTACK_SPEED_PER_STACK)}% tốc đánh</span>, ` +
    `tối đa <span class="buff">${RAGE_MAX_STACKS} cộng dồn</span>. Ở cộng dồn tối đa, cứ ` +
    `<span class="buff">${PHANTOM_HIT_INTERVAL} đòn đánh</span> lại có một đòn đánh ra hai lần.`;
  buffAddType = BuffAddType.REPLACE_EXISTING;

  /** Swings at full rage since the last phantom, 0..interval-1. */
  fullRageHits = 0;

  onHit(hit: OnHitEvent): void {
    // A phantom is the same swing arriving twice: it must neither build rage
    // nor count toward the next phantom, or the interval halves.
    if (hit.echo) return;

    const wearer = this.targetUnit;
    const atFullRage = this.liveRageStacks() >= RAGE_MAX_STACKS;

    const stack = new StatAmp(RAGE_STACK_MS, wearer, wearer);
    stack.stackId = RAGE_STACK_ID;
    stack.buffAddType = BuffAddType.STACKS_AND_OVERLAPS;
    stack.maxStacks = RAGE_MAX_STACKS;
    stack.bonuses = { attackSpeed: { flatBonus: RAGE_ATTACK_SPEED_PER_STACK } };
    stack.image = this.image;
    stack.singleRepresentativeDraw = true;
    wearer.addBuff(stack);

    // Full rage is read *before* this swing's own stack lands — the phantom
    // is a reward for arriving at the cap, not for the swing that caps it.
    if (!atFullRage) {
      this.fullRageHits = 0;
      return;
    }
    this.fullRageHits++;
    if (this.fullRageHits < PHANTOM_HIT_INTERVAL) return;
    this.fullRageHits = 0;

    api.combat.applyOnHitEffects({ ...hit, echo: true });
    this.showPhantomFlash(hit);
  }

  private liveRageStacks(): number {
    let count = 0;
    for (const buff of this.targetUnit.buffs ?? []) {
      if (!buff.toRemove && buff.stackId === RAGE_STACK_ID) count++;
    }
    return count;
  }

  /**
   * The full-rage state, worn on the body: a flame arc over the wearer's rim
   * once the blade is fully spun up, with `fullRageHits` tick marks counting
   * toward the phantom — two ticks showing means the next swing is doubled,
   * which is exactly the moment a player holds the swing for the right
   * target. Below full rage nothing is drawn at all: the spin-up already
   * shows as faster swings and a buff icon, and an always-on glow would spend
   * the item noise budget saying nothing (Riot's rule — an effect's presence
   * matches its gameplay importance, and the only state that changes a
   * decision here is "how far is the phantom").
   */
  draw(): void {
    if (this.liveRageStacks() < RAGE_MAX_STACKS) return;
    const pos = this.targetUnit.position;
    const radius = this.targetUnit.animatedValues.displaySize / 2 + 8;
    const [r, g, b] = GUINSOO_FLAME;

    push();
    noFill();
    // the base arc: full rage, phantom cycle armed
    stroke(r, g, b, 170 + 40 * Math.sin(frameCount / 7));
    strokeWeight(2.5);
    arc(pos.x, pos.y, radius * 2, radius * 2, -PI * 0.8, -PI * 0.2);

    // the count: one tick per swing already banked toward the phantom
    strokeWeight(3.5);
    for (let i = 0; i < this.fullRageHits; i++) {
      const angle = -PI * 0.65 + i * (PI * 0.3);
      const inner = radius + 3;
      const outer = radius + 10;
      line(
        pos.x + Math.cos(angle) * inner,
        pos.y + Math.sin(angle) * inner,
        pos.x + Math.cos(angle) * outer,
        pos.y + Math.sin(angle) * outer
      );
    }
    pop();
  }

  /** The doubled swing has to be tellable from a single one: one flame ring. */
  private showPhantomFlash(hit: OnHitEvent): void {
    const flash = new AoePulse(this.targetUnit);
    flash.position = hit.victim.position.copy();
    flash.radius = 50;
    flash.lifeTime = 260;
    flash.color = [...GUINSOO_FLAME];
    flash.fillAlpha = 30;
    this.game.objectManager.addObject(flash);
  }
}

export default class Item_Guinsoo extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_guinsoos_rageblade');
  name = 'Cuồng Đao Guinsoo (Item_Guinsoo)';
  description =
    `Nội tại: mỗi đòn đánh tăng ${RAGE_ATTACK_SPEED_PER_STACK} tốc đánh trong` +
    ` ${secs(RAGE_STACK_MS)} giây, cộng dồn ${RAGE_MAX_STACKS} lần. Khi tích đủ, mỗi đòn thứ` +
    ` ${PHANTOM_HIT_INTERVAL} kích hoạt các hiệu ứng đòn đánh của bạn thêm một lần nữa`;
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
    const rage = new Item_Guinsoo_Rage(0, this.owner, this.owner);
    rage.stackId = 'item_guinsoo';
    rage.image = this.image;
    rage.sourceSpell = this;
    this.owner.addBuff(rage);
  }
}
