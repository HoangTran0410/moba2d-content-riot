import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const StatAmp = api.buffs.StatAmp;

/**
 * Đao Tím — magic on a sword. Two halves, both stated in the source item:
 * every swing stings for flat MAGIC damage (so it scales against armour
 * stacking the way a spell does), and landing swings keeps the wearer moving.
 *
 * The movement half is a short self-buff refreshed per hit rather than a
 * permanent stat: "tốc độ di chuyển khi tấn công" is a property of *fighting*,
 * and a wearer who has not swung for two seconds walks at their own speed.
 */

/**
 * The sting: magic damage per swing, as a share of the wearer's attack
 * damage — the fighter's build feeds it, so it does not rot into paint on a
 * late-game bar the way the flat 4 it replaced did. ~4 on a mid-game
 * fighter (~22 công).
 */
export const WITS_END_AD_RATIO = 0.18;

/** Movement speed while swinging: flat bonus, and how long one hit keeps it. */
export const WITS_END_MOVE_SPEED_BONUS = 0.45;
export const WITS_END_MOVE_SPEED_MS = 1_500;

export class Item_WitsEnd_Sting extends Buff {
  name = 'Đao Tím';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // A permanent armed state: the inventory slot already shows the item, so
  // this stays off the HUD buff row and the overhead strip (Buff.hudVisible).
  hudVisible = false;

  onHit(hit: OnHitEvent): void {
    hit.victim.takeDamage(
      this.targetUnit.stats.attackDamage.value * WITS_END_AD_RATIO,
      this.targetUnit,
      'MAGIC',
      'Đao Tím'
    );

    // Refreshed, not stacked: REPLACE_EXISTING on a fixed stackId means each
    // hit restarts the same 1.5 seconds — swinging keeps it up, stopping
    // lets it fall off.
    const surge = new StatAmp(WITS_END_MOVE_SPEED_MS, this.targetUnit, this.targetUnit);
    surge.stackId = 'item_wits_end_surge';
    surge.bonuses = { speed: { flatBonus: WITS_END_MOVE_SPEED_BONUS } };
    surge.image = this.image;
    this.targetUnit.addBuff(surge);
  }
}

export default class Item_WitsEnd extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_wits_end');
  name = 'Đao Tím (Item_WitsEnd)';
  description =
    `Nội tại: đòn đánh gây thêm sát thương phép bằng ${pct(WITS_END_AD_RATIO)}% công và tăng` +
    ` ${WITS_END_MOVE_SPEED_BONUS} tốc chạy trong ${secs(WITS_END_MOVE_SPEED_MS)} giây`;
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
    const sting = new Item_WitsEnd_Sting(0, this.owner, this.owner);
    sting.stackId = 'item_wits_end';
    sting.image = this.image;
    sting.sourceSpell = this;
    this.owner.addBuff(sting);
  }
}
