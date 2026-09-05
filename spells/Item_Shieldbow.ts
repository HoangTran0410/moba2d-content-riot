import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Shield = api.buffs.Shield;

/**
 * Nỏ Tử Thủ — Móng Vuốt Sterak, resold to the back line. The mechanic is the
 * same lifeline (`Buff.onDamageTaken`, the hook that runs when "am I below
 * the line" has an answer; a real-time cooldown for the same reasons stated
 * in `Item_Steraks.ts`), and the difference is who it prices for: Sterak's
 * shield is a share of maximum health, worth the most on the tank who
 * stacked Đai Khổng Lồ — this one is a flat pool on an item whose other
 * stats are all offense, so a marksman can buy a moment of survival without
 * buying a single point of the tank shelf.
 */

/** Below this share of maximum health, the bow fires. */
export const SHIELDBOW_THRESHOLD = 0.3;

/** The shield, flat — the carry's pool, not the tank's. */
export const SHIELDBOW_SHIELD = 18;

/** How long the shield stands. */
export const SHIELDBOW_SHIELD_MS = 3_000;

/** And how long before it can fire again. */
export const SHIELDBOW_COOLDOWN_MS = 40_000;

export const SHIELDBOW_STACK_ID = 'item_immortal_shieldbow';

export class Item_Shieldbow_Lifeline extends Buff {
  name = 'Nỏ Tử Thủ';
  description =
    `Khi máu rơi xuống dưới <span class="buff">${pct(SHIELDBOW_THRESHOLD)}%</span>, nhận lá chắn ` +
    `<span class="heal" data-flat="none">${SHIELDBOW_SHIELD}</span> máu trong ` +
    `<span class="time">${secs(SHIELDBOW_SHIELD_MS)} giây</span>. Hồi lại sau ` +
    `<span class="time">${secs(SHIELDBOW_COOLDOWN_MS)} giây</span>.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  onDamageTaken(_swung: number, _landed: number, _attacker?: AttackableUnit): void {
    // Core's rearm clock: ticked by the base update, drawn on the item slot,
    // parked across the wearer's death by sourceSpell.
    if (!this.rearmed) return;

    const unit = this.targetUnit;
    const max = unit.stats.maxHealth.value;
    if (max <= 0 || unit.isDead) return;
    if (unit.stats.health.baseValue > max * SHIELDBOW_THRESHOLD) return;

    this.startRearm(SHIELDBOW_COOLDOWN_MS);

    const shield = new Shield(SHIELDBOW_SHIELD_MS, unit, unit);
    shield.amount = SHIELDBOW_SHIELD;
    shield.name = 'Nỏ Tử Thủ';
    // Its own slot: this must not evict a shield the team just cast on the
    // person it fires for, which is the same moment it fires — and it must
    // not collide with Sterak's either, because a bruiser can own both.
    shield.stackId = 'item_shieldbow_shield';
    shield.image = this.image;
    unit.addBuff(shield);
  }
}

export default class Item_Shieldbow extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_immortal_shieldbow');
  name = 'Nỏ Tử Thủ (Item_Shieldbow)';
  description =
    `Nội tại: khi máu rơi xuống dưới ${pct(SHIELDBOW_THRESHOLD)}%, nhận lá chắn ` +
    `${SHIELDBOW_SHIELD} máu trong ${secs(SHIELDBOW_SHIELD_MS)} giây ` +
    `(hồi lại sau ${secs(SHIELDBOW_COOLDOWN_MS)} giây)`;
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
    const lifeline = new Item_Shieldbow_Lifeline(0, this.owner, this.owner);
    lifeline.stackId = SHIELDBOW_STACK_ID;
    lifeline.image = this.image;
    lifeline.hudVisible = false;
    lifeline.sourceSpell = this;
    this.owner.addBuff(lifeline);
  }
}
