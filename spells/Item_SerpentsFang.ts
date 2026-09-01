import type { AttackableUnit, CastSpec, DamageType } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const ShieldCut = api.buffs.ShieldCut;

/**
 * Kiếm Ác Xà — the answer to the shield, and the one counter on this shelf
 * that is *not* about the fight in front of you.
 *
 * Kẻ Săn Mồi Tàn Nhẫn (`Renekton_W.ts`) already tears off what is standing, by
 * deactivating the target's `Shield` buffs one by one. That is a complete
 * answer to the shield somebody is behind right now, and its counter-play is
 * simply to cast another one. This item answers the *next* one instead: for a
 * few seconds, everything the enemy team throws on the person you hit is worth
 * half. Buying it is a bet about their support, not about their front line.
 *
 * Physical and true damage, the same split `Item_GrievousStrike.ts` uses and
 * for the same reason — it is the axis this engine's damage funnel actually
 * carries, and this is an attack-damage item.
 */

/** How much of every new shield the bite takes. */
export const FANG_PERCENT = 0.5;

/** How long the crack lasts after the hit that made it. */
export const FANG_MS = 3_000;

export const FANG_STACK_ID = 'item_serpents_fang';

export class Item_SerpentsFang_Bite extends Buff {
  name = 'Kiếm Ác Xà';
  description =
    `Sát thương vật lý bạn gây ra làm <span class="buff">Rạn Khiên</span>: mọi lá chắn mục tiêu ` +
    `nhận được trong <span class="time">${secs(FANG_MS)} giây</span> sau đó chỉ còn ` +
    `<span class="buff">${pct(1 - FANG_PERCENT)}%</span> giá trị.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  onDamageDealt(_swung: number, _landed: number, victim: AttackableUnit, type: DamageType): void {
    if (type === 'MAGIC') return;
    if (victim.isDead || victim.toRemove) return;

    const crack = new ShieldCut(FANG_MS, this.targetUnit, victim);
    crack.shieldCut = FANG_PERCENT;
    victim.addBuff(crack);
  }
}

export default class Item_SerpentsFang extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_serpents_fang');
  name = 'Kiếm Ác Xà (Item_SerpentsFang)';
  description =
    `Nội tại: sát thương vật lý gây ra làm Rạn Khiên — lá chắn mục tiêu nhận được trong ` +
    `${secs(FANG_MS)} giây sau đó chỉ còn ${pct(1 - FANG_PERCENT)}% giá trị`;
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
    const bite = new Item_SerpentsFang_Bite(0, this.owner, this.owner);
    bite.stackId = FANG_STACK_ID;
    bite.image = this.image;
    bite.hudVisible = false;
    bite.sourceSpell = this;
    this.owner.addBuff(bite);
  }
}
