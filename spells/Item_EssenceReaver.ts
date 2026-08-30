import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SpellbladeBuff, SPELLBLADE_ICD_MS } from './Item_Sheen';
import { pct, secs } from '../text';

const Spell = api.Spell;

/**
 * Lưỡi Hái Linh Hồn — the spellblade that pays the mana back: the empowered
 * attack hits for a share of base damage and refunds a slice of the wearer's
 * mana pool, which is what lets a caster-marksman keep weaving abilities.
 *
 * The refund goes through `restoreMana` — granting is not billing, so URF's
 * free-mana rule cannot zero it and nothing here touches the mana stat
 * directly (the `mana-spend` seam bans that from every spell file).
 */

/** The empowered hit: this share of the wearer's base attack damage, physical. */
export const REAVER_BASE_AD_RATIO = 0.7;

/** Share of the wearer's MAXIMUM mana refunded per proc. */
export const REAVER_MANA_REFUND_RATIO = 0.15;

// Warm rose, not the arcane violet it first wore: the proc is PHYSICAL, and
// the VFX standard's colour rule says a physical proc does not dress in the
// magic family — violet is what the combat text uses for magic damage, and a
// violet ring under an amber number is the effect lying about its own type.
const REAVER_ROSE: [number, number, number] = [255, 150, 185];

export class Item_EssenceReaver_Blade extends SpellbladeBuff {
  name = 'Lưỡi Hái Linh Hồn';
  flashColor: [number, number, number] = REAVER_ROSE;

  protected payload(hit: OnHitEvent): void {
    const wearer = this.targetUnit;
    const base = wearer.stats.attackDamage.baseValue;
    hit.victim.takeDamage(base * REAVER_BASE_AD_RATIO, wearer, 'PHYSICAL');
    wearer.restoreMana(wearer.stats.maxMana.value * REAVER_MANA_REFUND_RATIO);
  }
}

export default class Item_EssenceReaver extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_essence_reaver');
  name = 'Lưỡi Hái Linh Hồn (Item_EssenceReaver)';
  description =
    `Nội tại: sau khi dùng chiêu, đòn đánh kế tiếp gây thêm sát thương vật lý bằng` +
    ` ${pct(REAVER_BASE_AD_RATIO)}% công cơ bản và hồi` +
    ` ${pct(REAVER_MANA_REFUND_RATIO)}% năng lượng tối đa (hồi ${secs(SPELLBLADE_ICD_MS)} giây)`;
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
    const blade = new Item_EssenceReaver_Blade(0, this.owner, this.owner);
    blade.stackId = 'item_spellblade';
    blade.image = this.image;
    blade.sourceSpell = this;
    this.owner.addBuff(blade);
  }
}
