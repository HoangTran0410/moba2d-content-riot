import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Champion = api.units.Champion;

/**
 * Đao Chớp Navori — the bridge between the shop's two paths: an attack item
 * whose payout is *casts*. Every real swing files a sliver off whatever kit
 * cooldowns are still running, so the attack-speed the item sells is also,
 * quietly, ability haste that only pays while the wearer keeps swinging.
 *
 * The refund goes through `Spell.currentCooldown` — the same clock the HUD
 * draws and `reducedCooldown` started — so the feedback is the cooldown
 * wheels visibly hurrying, and no VFX pretends to be the mechanic. Kit slots
 * only: `Champion.spells` is the keyed row, which deliberately excludes Hồi
 * Thành, the champion's passive and every held item's own active — an item
 * hastening item actives (its own included) is the self-powering loop that
 * `countsAsAbilityCast` exists to close on the spellblade side.
 */

/** Milliseconds filed off every running kit cooldown per real swing. */
export const NAVORI_REFUND_MS = 300;

export const NAVORI_STACK_ID = 'item_navori_flickerblade';

export class Item_Navori_Flicker extends Buff {
  name = 'Đao Chớp Navori';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  onHit(hit: OnHitEvent): void {
    // One swing, one refund. An echo refunding again would make Runaan a
    // haste multiplier nobody priced.
    if (hit.echo) return;

    const wearer = this.targetUnit;
    if (!(wearer instanceof Champion)) return;

    for (const spell of wearer.spells) {
      if (spell.currentCooldown <= 0) continue;
      spell.currentCooldown = Math.max(0, spell.currentCooldown - NAVORI_REFUND_MS);
    }
  }
}

export default class Item_Navori extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_navori_flickerblade');
  name = 'Đao Chớp Navori (Item_Navori)';
  description =
    `Nội tại: mỗi đòn đánh giảm ${secs(NAVORI_REFUND_MS)} giây hồi chiêu` +
    ` cho các chiêu thức đang hồi`;
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
    const flicker = new Item_Navori_Flicker(0, this.owner, this.owner);
    flicker.stackId = NAVORI_STACK_ID;
    flicker.image = this.image;
    flicker.sourceSpell = this;
    this.owner.addBuff(flicker);
  }
}
