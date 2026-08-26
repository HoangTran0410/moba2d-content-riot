import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Buff = api.buffs.Buff;

/**
 * Nanh Nashor — the ability-carry's weapon (Azir, Kayle, Teemo in the source
 * material): a hard magic sting on every swing, the biggest flat on-hit in
 * the shop, paired with the attack speed to deliver it.
 *
 * The source item's sting rides ability power; this engine has no AP stat, so
 * the sting is a flat magic number tuned high against the ~100-health pool —
 * the same statement `Item_LichBane.ts` makes, made once per file so a reader
 * landing on either finds it.
 */

/** The sting: flat magic damage per swing. */
export const NASHOR_MAGIC_DAMAGE = 7;

export class Item_Nashor_Fang extends Buff {
  name = 'Nanh Nashor';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // A permanent armed state: the inventory slot already shows the item, so
  // this stays off the HUD buff row and the overhead strip (Buff.hudVisible).
  hudVisible = false;

  onHit(hit: OnHitEvent): void {
    hit.victim.takeDamage(NASHOR_MAGIC_DAMAGE, this.targetUnit, 'MAGIC');
  }
}

export default class Item_Nashor extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_nashors_tooth');
  name = 'Nanh Nashor (Item_Nashor)';
  description = `Nội tại: đòn đánh gây thêm ${NASHOR_MAGIC_DAMAGE} sát thương phép`;
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
