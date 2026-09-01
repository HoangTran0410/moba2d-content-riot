import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct } from '../text';

const Spell = api.Spell;
const StatAmp = api.buffs.StatAmp;

/**
 * Mũ Phù Thủy Rabadon — the only item in this shop that multiplies instead of
 * adding, and the reason the ability shelf has a top.
 *
 * Every other ability item grants a slice of `abilityPower`, which core adds
 * into one flat bonus and reads as `1 + Σ` at the damage funnel
 * (`combat/Amplification.ts`). Ten such items are ten additions, so the last
 * one is worth exactly what the first was, and a "capstone" cannot exist. This
 * one lands on **`percentBonus`**, the outer factor of the stat formula:
 *
 *     ((base + baseBonus) × (1 + percentBaseBonus) + flatBonus) × (1 + percentBonus)
 *
 * so it is worth a quarter of whatever the rest of the build already bought —
 * nothing on its own, most of an item on a finished mage. That is the shape
 * League's own version has, and it needs no core support at all: `StatAmp`
 * has always been able to write that slot, and no item had ever asked.
 *
 * The flat half is on the `ItemDef` like every other item's, so the shop's
 * stat list draws it; only the multiplier needs a passive to exist.
 */

/** How much of the rest of the build the hat is worth. */
export const RABADON_PERCENT = 0.25;

/** Its own tag, so nothing else that amps a stat can evict it. */
export const RABADON_STACK_ID = 'item_rabadon';

export default class Item_Rabadon extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_rabadons_deathcap');
  name = 'Mũ Phù Thủy Rabadon (Item_Rabadon)';
  description = `Nội tại: tăng thêm ${pct(RABADON_PERCENT)}% tổng sức mạnh phép của bạn`;
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
    const hat = new StatAmp(0, this.owner, this.owner);
    hat.bonuses = { abilityPower: { percentBonus: RABADON_PERCENT } };
    hat.name = 'Mũ Phù Thủy Rabadon';
    hat.stackId = RABADON_STACK_ID;
    hat.image = this.image;
    hat.hudVisible = false;
    hat.sourceSpell = this;
    this.owner.addBuff(hat);
  }
}
