import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const StatAmp = api.buffs.StatAmp;
const Champion = api.units.Champion;

/**
 * Rìu Đen — the bruiser's answer to the tank shelf, sold as a *ramp* rather
 * than a share: each swing carves a notch out of the target's armour, and the
 * fight the wearer wants is the long one where all three notches are in.
 *
 * ## Why the rend is `percentBonus`, never a flat subtraction
 *
 * A flat cut crosses zero on a squishy target and hands back the negative-
 * armour bonus (`Mitigation.ts` amplifies below zero) — a tank-buster item
 * that quietly hit the support hardest, which is the exact backwards outcome
 * the penetration doc warns about. `percentBonus` multiplies the victim's
 * total armour by `1 - 0.15` at full stacks, so it is worth the most against
 * the 90-armour wall it is bought for, nothing against a target with nothing,
 * and can never mint negative armour on its own.
 *
 * The stacks are real buff instances (`STACKS_AND_CONTINUE`, `maxStacks` 3)
 * rather than a hand-kept counter, because eviction, timing and the victim's
 * buff-bar row are exactly what core's stacking already does — modifiers add,
 * so three instances of −5% are the −15% on the card.
 *
 * Champions only: shredding a minion's armour is wave-clear bookkeeping
 * nobody reads, and the item's sentence says "tướng địch".
 */

/** Armour multiplier cut per stack — `percentBonus`, a share of the victim's total. */
export const CLEAVER_SHRED_PER_STACK = 0.05;

/** How many notches the axe can hold in one target. */
export const CLEAVER_MAX_STACKS = 3;

/** How long a notch lasts after the swing that carved it. */
export const CLEAVER_REND_MS = 4_000;

export const CLEAVER_REND_STACK_ID = 'item_black_cleaver_rend';
export const CLEAVER_STACK_ID = 'item_black_cleaver';

export class Item_BlackCleaver_Edge extends Buff {
  name = 'Rìu Đen';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  onHit(hit: OnHitEvent): void {
    // One swing, one notch. An echo carving a second would let Runaan put
    // three stacks in with one click, which is a different item.
    if (hit.echo) return;
    if (!(hit.victim instanceof Champion)) return;
    if (hit.victim.isDead || hit.victim.toRemove) return;

    const rend = new StatAmp(CLEAVER_REND_MS, this.targetUnit, hit.victim);
    rend.bonuses = { armor: { percentBonus: -CLEAVER_SHRED_PER_STACK } };
    rend.name = 'Rìu Đen';
    rend.description =
      `Giáp bị phá <span class="buff">${pct(CLEAVER_SHRED_PER_STACK)}%</span> mỗi vết chém ` +
      `trong <span class="time">${secs(CLEAVER_REND_MS)} giây</span>.`;
    rend.buffAddType = api.enums.BuffAddType.STACKS_AND_CONTINUE;
    rend.maxStacks = CLEAVER_MAX_STACKS;
    rend.stackId = CLEAVER_REND_STACK_ID;
    rend.image = this.image;
    hit.victim.addBuff(rend);
  }
}

export default class Item_BlackCleaver extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_black_cleaver');
  name = 'Rìu Đen (Item_BlackCleaver)';
  description =
    `Nội tại: đòn đánh lên tướng địch phá ${pct(CLEAVER_SHRED_PER_STACK)}% giáp trong ` +
    `${secs(CLEAVER_REND_MS)} giây (cộng dồn ${CLEAVER_MAX_STACKS} lần)`;
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
    const edge = new Item_BlackCleaver_Edge(0, this.owner, this.owner);
    edge.stackId = CLEAVER_STACK_ID;
    edge.image = this.image;
    edge.sourceSpell = this;
    this.owner.addBuff(edge);
  }
}
