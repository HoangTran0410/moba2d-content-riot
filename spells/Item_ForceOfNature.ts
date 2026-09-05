import type { AttackableUnit, CastSpec, DamageType } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const StatAmp = api.buffs.StatAmp;

/**
 * Giáp Thiên Nhiên — magic resist that *ramps while the mage is doing the
 * thing it was bought against*.
 *
 * Every other kháng phép row is a number that is always on. This one is the
 * counter-purchase to a sustained caster: the first spell hits full strength
 * and every spell after it hits a stronger wall, which is exactly the trade a
 * DoT mage or a machine-gun poker gives the wearer. Against one giant burst
 * it is nearly a stat stick — that is the shape, not a bug, and it is why
 * Vòng Sắt Cổ Tự (the pre-armed magic shield) sits beside it on the shelf.
 *
 * The magic-type test has to happen in `modifyIncomingDamage` — the one buff
 * hook that is told the hit's `DamageType` — but that hook is a link in the
 * mitigation chain and must not *react* there (core's `DamageReflect` carries
 * the argument). So the chain link only latches "that was magic" and returns
 * the damage untouched, and `onDamageTaken`, which runs once the hit has
 * fully resolved, spends the latch. Same split as `Item_Maw.ts`.
 */

/** How long a stack lasts after the last magic hit; they all fall together. */
export const FON_STACK_MS = 6_000;

export const FON_MAX_STACKS = 5;

/**
 * Magic resist per stack, as a share of what the wearer already has (the
 * outer multiplier slot) — +20% at full ramp, multiplying the resist the
 * build bought instead of adding flat points that a late-game mage ignores.
 * ~3 per stack on a mid-game wearer (~90 kháng phép with this item's own
 * 45 on), the flat number it replaced.
 */
export const FON_MR_PERCENT_PER_STACK = 0.04;

/** Share of move speed per stack, on the outer slot the item stats also use. */
export const FON_SPEED_PER_STACK = 0.02;

/**
 * A DoT ticking every frame must not fill the ramp in a tenth of a second:
 * hits inside this window latch nothing. Four grants a second, like the
 * aura clocks.
 */
export const FON_HIT_INTERVAL_MS = 250;

export const FON_STACK_ID = 'item_force_of_nature';
export const FON_SURGE_STACK_ID = 'item_force_of_nature_surge';

export class Item_ForceOfNature_Watcher extends Buff {
  name = 'Giáp Thiên Nhiên';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  stacks = 0;
  private nowMs = 0;
  private lastMagicAtMs = -Infinity;
  /** Set by the chain link, spent by `onDamageTaken`. */
  private sawMagic = false;

  onUpdate(): void {
    this.nowMs += deltaTime;
    if (this.stacks > 0 && this.nowMs - this.lastMagicAtMs > FON_STACK_MS) this.stacks = 0;
  }

  modifyIncomingDamage(damage: number, attacker?: AttackableUnit, type?: DamageType): number {
    // Observe, never modify: the latch is the whole job. An allied or absent
    // attacker is a burn zone or self-cost, not the mage this ramps against.
    if (type === 'MAGIC' && attacker && attacker.teamId !== this.targetUnit.teamId) {
      this.sawMagic = true;
    }
    return damage;
  }

  onDamageTaken(): void {
    if (!this.sawMagic) return;
    this.sawMagic = false;

    const unit = this.targetUnit;
    if (unit.isDead || unit.toRemove) return;
    if (this.nowMs - this.lastMagicAtMs < FON_HIT_INTERVAL_MS) return;

    this.lastMagicAtMs = this.nowMs;
    this.stacks = Math.min(FON_MAX_STACKS, this.stacks + 1);

    // One surge buff re-issued at the new magnitude, not N stacked ones:
    // REPLACE_EXISTING on a fixed stackId swaps the old modifier out whole,
    // so the ramp can never double-count and always shows one row.
    const surge = new StatAmp(FON_STACK_MS, unit, unit);
    surge.bonuses = {
      magicResist: { percentBonus: FON_MR_PERCENT_PER_STACK * this.stacks },
      speed: { percentBonus: FON_SPEED_PER_STACK * this.stacks },
    };
    surge.name = 'Giáp Thiên Nhiên';
    surge.buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
    surge.stackId = FON_SURGE_STACK_ID;
    surge.image = this.image;
    unit.addBuff(surge);
  }
}

export default class Item_ForceOfNature extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_force_of_nature');
  name = 'Giáp Thiên Nhiên (Item_ForceOfNature)';
  description =
    `Nội tại: trúng sát thương phép cho 1 điểm cộng dồn trong ${secs(FON_STACK_MS)} giây ` +
    `(tối đa ${FON_MAX_STACKS}): mỗi điểm +${pct(FON_MR_PERCENT_PER_STACK)}% kháng phép và ` +
    `+${pct(FON_SPEED_PER_STACK)}% tốc chạy`;
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
    const watcher = new Item_ForceOfNature_Watcher(0, this.owner, this.owner);
    watcher.stackId = FON_STACK_ID;
    watcher.image = this.image;
    watcher.sourceSpell = this;
    this.owner.addBuff(watcher);
  }
}
