import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SpellbladeBuff, SPELLBLADE_ICD_MS } from './Item_Sheen';

const Spell = api.Spell;

/**
 * Búa Rìu Sát Thần — the spellblade for fighters who hit *big* targets: the
 * empowered attack reads the victim's maximum health, so it is worth the most
 * against the tanks the flat procs bounce off, and a slice of it comes back as
 * healing.
 *
 * `SpellbladeBuff` (`Item_Sheen.ts`) carries the mechanic; this file is the
 * payload and its two numbers.
 */

/** The empowered hit: this share of the VICTIM's maximum health, physical. */
export const SUNDERER_MAX_HEALTH_RATIO = 0.06;

/** …never less than this, or the proc vanishes against a 40-health minion. */
export const SUNDERER_MIN_DAMAGE = 6;

/** Share of the proc's damage healed back to the wearer. */
export const SUNDERER_HEAL_RATIO = 0.65;

const SUNDERER_EMBER: [number, number, number] = [255, 150, 90];

export class Item_DivineSunderer_Blade extends SpellbladeBuff {
  name = 'Búa Rìu Sát Thần';
  flashColor: [number, number, number] = SUNDERER_EMBER;

  protected payload(hit: OnHitEvent): void {
    const maxHealth = hit.victim.stats.maxHealth.value;
    const damage = Math.max(SUNDERER_MIN_DAMAGE, maxHealth * SUNDERER_MAX_HEALTH_RATIO);
    hit.victim.takeDamage(damage, this.targetUnit, 'PHYSICAL');
    this.targetUnit.takeHeal(damage * SUNDERER_HEAL_RATIO, this.targetUnit);
  }
}

export default class Item_DivineSunderer extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_divine_sunderer');
  name = 'Búa Rìu Sát Thần (Item_DivineSunderer)';
  description =
    `Nội tại: sau khi dùng chiêu, đòn đánh kế tiếp gây thêm sát thương vật lý bằng` +
    ` ${SUNDERER_MAX_HEALTH_RATIO * 100}% máu tối đa của mục tiêu và hồi lại` +
    ` ${SUNDERER_HEAL_RATIO * 100}% lượng đó (hồi ${SPELLBLADE_ICD_MS / 1000} giây)`;
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
    const blade = new Item_DivineSunderer_Blade(0, this.owner, this.owner);
    blade.stackId = 'item_spellblade';
    blade.image = this.image;
    blade.sourceSpell = this;
    this.owner.addBuff(blade);
  }
}
