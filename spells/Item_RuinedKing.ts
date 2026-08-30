import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;

/**
 * Gươm Suy Vong's missing half. The item shipped as a stat stick (attack
 * damage, attack speed, omnivamp — all `stats` grants in data.ts); what makes
 * the source item *the* duellist's blade is the on-hit that reads the
 * victim's CURRENT health, worth the most on the first swing of a fight and
 * never worth zero. This passive is exactly that and nothing else — the vamp
 * stays a stat, because core's omnivamp already heals off this damage too.
 */

/** The bite: this share of the victim's CURRENT health, physical. */
export const RUINED_KING_CURRENT_HEALTH_RATIO = 0.05;

/** …never under this, or the passive dies against an almost-dead target. */
export const RUINED_KING_MIN_DAMAGE = 1;

export class Item_RuinedKing_Bite extends Buff {
  name = 'Gươm Suy Vong';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // A permanent armed state: the inventory slot already shows the item, so
  // this stays off the HUD buff row and the overhead strip (Buff.hudVisible).
  hudVisible = false;

  onHit(hit: OnHitEvent): void {
    const current = hit.victim.stats.health.value;
    const damage = Math.max(RUINED_KING_MIN_DAMAGE, current * RUINED_KING_CURRENT_HEALTH_RATIO);
    hit.victim.takeDamage(damage, this.targetUnit, 'PHYSICAL', 'Gươm Suy Vong');
  }
}

export default class Item_RuinedKing extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_blade_of_the_ruined_king');
  name = 'Gươm Suy Vong (Item_RuinedKing)';
  description =
    `Nội tại: đòn đánh gây thêm sát thương vật lý bằng` +
    ` ${pct(RUINED_KING_CURRENT_HEALTH_RATIO)}% máu hiện tại của mục tiêu`;
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
    const bite = new Item_RuinedKing_Bite(0, this.owner, this.owner);
    bite.stackId = 'item_ruined_king';
    bite.image = this.image;
    bite.sourceSpell = this;
    this.owner.addBuff(bite);
  }
}
