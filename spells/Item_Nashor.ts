import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;

/**
 * Nanh Nashor — the ability-carry's weapon (Azir, Kayle, Teemo in the source
 * material): a hard magic sting on every swing, the biggest flat on-hit in
 * the shop, paired with the attack speed to deliver it.
 *
 * The source item's sting rides ability power; item passives here read no
 * ability power (core opts every item ability out of it), so the sting is a
 * share of the wearer's BASE attack damage — the swing's own heft, resold as
 * magic. That is proportionality per body rather than growth per build: base
 * attack damage does not rise with items, and pointing this at total attack
 * damage would hand the biggest sting to the full-AD marksman a magic fang
 * was never for. The same statement `Item_LichBane.ts` makes, made once per
 * file so a reader landing on either finds it.
 */

/** The sting per swing, as a share of base attack damage. ~7 on a mage's 12. */
export const NASHOR_BASE_AD_RATIO = 0.55;

export class Item_Nashor_Fang extends Buff {
  name = 'Nanh Nashor';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // A permanent armed state: the inventory slot already shows the item, so
  // this stays off the HUD buff row and the overhead strip (Buff.hudVisible).
  hudVisible = false;

  onHit(hit: OnHitEvent): void {
    hit.victim.takeDamage(
      this.targetUnit.stats.attackDamage.baseValue * NASHOR_BASE_AD_RATIO,
      this.targetUnit,
      'MAGIC',
      'Nanh Nashor'
    );
  }
}

export default class Item_Nashor extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_nashors_tooth');
  name = 'Nanh Nashor (Item_Nashor)';
  description =
    `Nội tại: đòn đánh gây thêm sát thương phép bằng ${pct(NASHOR_BASE_AD_RATIO)}% công cơ bản`;
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
    const fang = new Item_Nashor_Fang(0, this.owner, this.owner);
    fang.stackId = 'item_nashor';
    fang.image = this.image;
    fang.sourceSpell = this;
    this.owner.addBuff(fang);
  }
}
