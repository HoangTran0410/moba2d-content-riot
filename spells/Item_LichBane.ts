import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SpellbladeBuff, SPELLBLADE_ICD_MS } from './Item_Sheen';
import { pct, secs } from '../text';

const Spell = api.Spell;

/**
 * Kiếm Tai Ương — the mage's spellblade (Fizz, Ekko, Viktor in the source
 * material): the empowered attack is a burst of MAGIC damage, so it scales
 * against armour stacking the way a spell does rather than the way a sword
 * does.
 *
 * The source item's proc rides ability power. Item passives here read no
 * ability power (core opts every item ability out of it), so the proc is the
 * spellblade family's own lever turned up: a share of the wearer's BASE
 * attack damage, resold as magic — Thủy Kiếm's 50% and Tam Hợp's 100%, with
 * this one at 150% because the mage's base swing (12) is the lightest in the
 * roster. Proportionality per body, not growth per build (base attack damage
 * does not rise with items) — the honest ceiling while ability power stays
 * closed to item passives. Stated here so nobody hunts for the missing
 * scaling.
 */

/** The empowered hit: this share of the wearer's base attack damage, as magic. */
export const LICH_BANE_BASE_AD_RATIO = 1.5;

const LICH_TEAL: [number, number, number] = [130, 240, 220];

export class Item_LichBane_Blade extends SpellbladeBuff {
  name = 'Kiếm Tai Ương';
  flashColor: [number, number, number] = LICH_TEAL;

  protected payload(hit: OnHitEvent): void {
    hit.victim.takeDamage(
      this.targetUnit.stats.attackDamage.baseValue * LICH_BANE_BASE_AD_RATIO,
      this.targetUnit,
      'MAGIC'
    );
  }
}

export default class Item_LichBane extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_lich_bane');
  name = 'Kiếm Tai Ương (Item_LichBane)';
  description =
    `Nội tại: sau khi dùng chiêu, đòn đánh kế tiếp gây thêm` +
    ` ${pct(LICH_BANE_BASE_AD_RATIO)}% công cơ bản dưới dạng sát thương phép` +
    ` (hồi ${secs(SPELLBLADE_ICD_MS)} giây)`;
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
