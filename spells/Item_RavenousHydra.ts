import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { CleaveBuff, CLEAVE_RADIUS } from './Item_Tiamat';

const Spell = api.Spell;

/**
 * Rìu Mãng Xà — the damage hydra. The carve scales up from Rìu Tiamat's and
 * the item's stats carry the omnivamp (a `stats` grant in data.ts, not code
 * here: core's omnivamp stat already heals off ALL damage dealt, the carve
 * included, so writing a second healing rule in this file would double-dip).
 *
 * `CleaveBuff` (`Item_Tiamat.ts`) carries the query, the friendly-fire rule
 * and the sweep; this file is one ratio and one colour.
 */

/** The carve: this share of the wearer's attack damage, physical. */
export const RAVENOUS_AD_RATIO = 0.6;

const RAVENOUS_BLOOD: [number, number, number] = [235, 120, 100];

export class Item_RavenousHydra_Cleave extends CleaveBuff {
  name = 'Rìu Mãng Xà';
  sweepColor: [number, number, number] = RAVENOUS_BLOOD;

  protected splashDamage(): number {
    return this.targetUnit.stats.attackDamage.value * RAVENOUS_AD_RATIO;
  }
}

export default class Item_RavenousHydra extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_ravenous_hydra');
  name = 'Rìu Mãng Xà (Item_RavenousHydra)';
  description =
    `Nội tại: đòn đánh gây thêm sát thương vật lý bằng ${RAVENOUS_AD_RATIO * 100}% công` +
    ` lên các kẻ địch khác trong ${CLEAVE_RADIUS} đơn vị quanh mục tiêu`;
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
    const cleave = new Item_RavenousHydra_Cleave(0, this.owner, this.owner);
    cleave.stackId = 'item_cleave';
    cleave.image = this.image;
    cleave.sourceSpell = this;
    this.owner.addBuff(cleave);
  }
}
