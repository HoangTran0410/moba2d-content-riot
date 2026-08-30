import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SpellbladeBuff, SPELLBLADE_ICD_MS } from './Item_Sheen';
import { secs } from '../text';

const Spell = api.Spell;

/**
 * Kiếm Tai Ương — the mage's spellblade (Fizz, Ekko, Viktor in the source
 * material): the empowered attack is a burst of MAGIC damage, so it scales
 * against armour stacking the way a spell does rather than the way a sword
 * does.
 *
 * The source item's proc rides ability power. This engine has no AP stat —
 * every spell's numbers are hand-tuned constants — so the proc is a flat
 * magic number tuned high against the ~100-health pool, which is what "an AP
 * ratio" cashes out to in an engine where AP itself would have nothing else
 * to feed. Stated here so nobody hunts for the missing scaling.
 */

/** The empowered hit: flat magic damage. */
export const LICH_BANE_MAGIC_DAMAGE = 18;

const LICH_TEAL: [number, number, number] = [130, 240, 220];

export class Item_LichBane_Blade extends SpellbladeBuff {
  name = 'Kiếm Tai Ương';
  flashColor: [number, number, number] = LICH_TEAL;

  protected payload(hit: OnHitEvent): void {
    hit.victim.takeDamage(LICH_BANE_MAGIC_DAMAGE, this.targetUnit, 'MAGIC');
  }
}

export default class Item_LichBane extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_lich_bane');
  name = 'Kiếm Tai Ương (Item_LichBane)';
  description =
    `Nội tại: sau khi dùng chiêu, đòn đánh kế tiếp gây thêm` +
    ` ${LICH_BANE_MAGIC_DAMAGE} sát thương phép (hồi ${secs(SPELLBLADE_ICD_MS)} giây)`;
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
    const blade = new Item_LichBane_Blade(0, this.owner, this.owner);
    blade.stackId = 'item_spellblade';
    blade.image = this.image;
    blade.sourceSpell = this;
    this.owner.addBuff(blade);
  }
}
