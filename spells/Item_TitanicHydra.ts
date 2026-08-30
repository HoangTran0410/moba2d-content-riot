import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { CleaveBuff, CLEAVE_RADIUS } from './Item_Tiamat';
import { pct } from '../text';

const Spell = api.Spell;

/**
 * Rìu Đại Mãng Xà — the tank's hydra: the carve reads the WEARER's maximum
 * health instead of attack damage, so the champion who bought Giáp Máu
 * Warmog is the one whose swings carve hardest. Flat floor + ratio, the same
 * shape the source item uses, tuned to the ~100-health pool.
 *
 * `CleaveBuff` (`Item_Tiamat.ts`) carries the mechanic; this file is one
 * formula and one colour.
 */

/** The carve's floor, so an unstacked wearer still reads the passive at all. */
export const TITANIC_FLAT_DAMAGE = 3;

/** …plus this share of the WEARER's maximum health, physical. */
export const TITANIC_MAX_HEALTH_RATIO = 0.03;

// Bronze earth, not the moss green it first wore: green is the heal colour in
// this engine's combat text, and a green sweep under physical damage numbers
// borrows the one hue that means the opposite of taking damage. Warm and
// heavy, which is also what a max-health bruiser's carve should feel like.
const TITANIC_BRONZE: [number, number, number] = [205, 175, 95];

export class Item_TitanicHydra_Cleave extends CleaveBuff {
  name = 'Rìu Đại Mãng Xà';
  sweepColor: [number, number, number] = TITANIC_BRONZE;

  protected splashDamage(): number {
    return TITANIC_FLAT_DAMAGE + this.targetUnit.stats.maxHealth.value * TITANIC_MAX_HEALTH_RATIO;
  }
}

export default class Item_TitanicHydra extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_titanic_hydra');
  name = 'Rìu Đại Mãng Xà (Item_TitanicHydra)';
  description =
    `Nội tại: đòn đánh gây thêm sát thương vật lý bằng ${TITANIC_FLAT_DAMAGE} cộng` +
    ` ${pct(TITANIC_MAX_HEALTH_RATIO)}% máu tối đa của bạn lên các kẻ địch khác trong` +
    ` ${CLEAVE_RADIUS} đơn vị quanh mục tiêu`;
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
    const cleave = new Item_TitanicHydra_Cleave(0, this.owner, this.owner);
    cleave.stackId = 'item_cleave';
    cleave.image = this.image;
    cleave.sourceSpell = this;
    this.owner.addBuff(cleave);
  }
}
