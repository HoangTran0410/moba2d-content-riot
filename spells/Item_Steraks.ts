import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Shield = api.buffs.Shield;

/**
 * Móng Vuốt Sterak — the shop's first item that answers *the moment you were
 * about to die* rather than a stat you carry all match.
 *
 * Every defensive item here is a number that is always on: armour, health, a
 * reflect. A threshold item is a different decision at the shop — it is worth
 * nothing while you are winning a trade and most of a health bar when you are
 * losing one — and this passive is the whole of it. `Buff.onDamageTaken` is
 * the hook: it runs after the hit landed, which is exactly when "am I below
 * the line" has an answer.
 *
 * **The cooldown is real time, not a hit counter.** Without one the shield
 * re-arms on the next tick of any damage-over-time and the champion is
 * unkillable; with a counter instead of a clock it would re-arm on the enemy's
 * *pattern* rather than on the fight's length.
 */

/** Below this share of maximum health, the shield fires. */
export const STERAK_THRESHOLD = 0.35;

/** What it is worth, as a share of maximum health. */
export const STERAK_SHIELD_PERCENT = 0.3;

/** How long the shield stands. */
export const STERAK_SHIELD_MS = 4_000;

/** And how long before it can fire again. */
export const STERAK_COOLDOWN_MS = 45_000;

export const STERAK_STACK_ID = 'item_steraks';

export class Item_Steraks_LastStand extends Buff {
  name = 'Móng Vuốt Sterak';
  description =
    `Khi máu rơi xuống dưới <span class="buff">${pct(STERAK_THRESHOLD)}%</span>, nhận lá chắn bằng ` +
    `<span class="buff">${pct(STERAK_SHIELD_PERCENT)}%</span> máu tối đa trong ` +
    `<span class="time">${secs(STERAK_SHIELD_MS)} giây</span>. Hồi lại sau ` +
    `<span class="time">${secs(STERAK_COOLDOWN_MS)} giây</span>.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  /** Milliseconds left before it can fire again; 0 means armed. */
  cooldownLeft = 0;

  onUpdate(): void {
    if (this.cooldownLeft > 0) this.cooldownLeft -= deltaTime;
    // The slot's countdown — see core Buff.rearmMsLeft.
    this.rearmTotalMs = STERAK_COOLDOWN_MS;
    this.rearmMsLeft = Math.max(0, this.cooldownLeft);
  }

  onDamageTaken(_swung: number, _landed: number, _attacker?: AttackableUnit): void {
    if (this.cooldownLeft > 0) return;

    const unit = this.targetUnit;
    const max = unit.stats.maxHealth.value;
    if (max <= 0 || unit.isDead) return;
    if (unit.stats.health.baseValue > max * STERAK_THRESHOLD) return;

    this.cooldownLeft = STERAK_COOLDOWN_MS;

    const shield = new Shield(STERAK_SHIELD_MS, unit, unit);
    shield.amount = max * STERAK_SHIELD_PERCENT;
    shield.name = 'Móng Vuốt Sterak';
    // Its own slot: this must not evict a shield the team just cast on the
    // person it fires for, which is the same moment it fires.
    shield.stackId = 'item_steraks_shield';
    shield.image = this.image;
    unit.addBuff(shield);
  }
}

export default class Item_Steraks extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_steraks_gage');
  name = 'Móng Vuốt Sterak (Item_Steraks)';
  description =
    `Nội tại: khi máu rơi xuống dưới ${pct(STERAK_THRESHOLD)}%, nhận lá chắn bằng ` +
    `${pct(STERAK_SHIELD_PERCENT)}% máu tối đa trong ${secs(STERAK_SHIELD_MS)} giây ` +
    `(hồi lại sau ${secs(STERAK_COOLDOWN_MS)} giây)`;
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
    const stand = new Item_Steraks_LastStand(0, this.owner, this.owner);
    stand.stackId = STERAK_STACK_ID;
    stand.image = this.image;
    stand.hudVisible = false;
    stand.sourceSpell = this;
    this.owner.addBuff(stand);
  }
}
