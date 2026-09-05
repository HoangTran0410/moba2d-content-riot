import type { CastSpec, Shield as ShieldInstance } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Shield = api.buffs.Shield;

/**
 * Vòng Sắt Cổ Tự — the magic shield you *walk into the fight already
 * wearing*.
 *
 * Giáp Thiên Nhiên beside it ramps while magic keeps landing; this one is the
 * opposite half of the anti-burst answer: a fifth of the wearer's health bar
 * that the mage's opening combo has to chew through before a point of it
 * reaches health — and physical damage passes straight past it (`Shield.absorbs`,
 * core 1.16's typed pool), so an AD teammate wading in gets none of this and
 * the item stays honestly anti-phép.
 *
 * The re-arm clock resets on **any** damage taken, not only magic —
 * `onDamageTaken` cannot see the type, and the cheaper rule is also the
 * better one: a tank being autoattacked is *in a fight*, and a shield that
 * quietly re-armed mid-fight because only physical was landing would be
 * uptime nobody priced. The one hook that knows the type is not needed here.
 */

/** Quiet time before the shield (re)forms. */
export const KAENIC_CALM_MS = 8_000;

/** The pool, as a share of maximum health, measured when it forms. */
export const KAENIC_SHIELD_PERCENT = 0.2;

export const KAENIC_STACK_ID = 'item_kaenic_rookern';
export const KAENIC_SHIELD_STACK_ID = 'item_kaenic_shield';

// Deep mossy green — the item art's own, and unlike the Solari gold or
// Sterak's crimson so whose shield is up stays readable in a pile.
const ROOKERN_GREEN: [number, number, number] = [120, 220, 150];

export class Item_KaenicRookern_Watcher extends Buff {
  name = 'Vòng Sắt Cổ Tự';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  private nowMs = 0;
  /** Last time anything hurt the wearer. Starts calm: first shield at 8s. */
  private lastHitAtMs = 0;
  private shield: ShieldInstance | null = null;

  onDamageTaken(swung: number): void {
    // A hit a shield swallowed whole still resets the clock — `swung` is what
    // arrived, and the wearer is being fought either way.
    if (swung > 0) this.lastHitAtMs = this.nowMs;
  }

  onUpdate(): void {
    this.nowMs += deltaTime;

    const unit = this.targetUnit;
    if (unit.isDead || unit.toRemove) return;
    if (this.shield && !this.shield.toRemove) return;
    if (this.nowMs - this.lastHitAtMs < KAENIC_CALM_MS) return;

    // Duration 0: the pool stands until magic damage breaks it. Selling the
    // item takes it down with the watcher via `sourceSpell` on both.
    const shield = new Shield(0, unit, unit);
    shield.amount = unit.stats.maxHealth.value * KAENIC_SHIELD_PERCENT;
    shield.absorbs = ['MAGIC'];
    shield.name = 'Vòng Sắt Cổ Tự';
    shield.stackId = KAENIC_SHIELD_STACK_ID;
    shield.color = [...ROOKERN_GREEN];
    shield.image = this.image;
    shield.sourceSpell = this.sourceSpell;
    unit.addBuff(shield);
    this.shield = shield;
  }
}

export default class Item_KaenicRookern extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_kaenic_rookern');
  name = 'Vòng Sắt Cổ Tự (Item_KaenicRookern)';
  description =
    `Nội tại: sau ${secs(KAENIC_CALM_MS)} giây không nhận sát thương, nhận lá chắn phép bằng ` +
    `${pct(KAENIC_SHIELD_PERCENT)}% máu tối đa — chỉ chặn sát thương phép, giữ đến khi vỡ`;
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
    const watcher = new Item_KaenicRookern_Watcher(0, this.owner, this.owner);
    watcher.stackId = KAENIC_STACK_ID;
    watcher.image = this.image;
    watcher.sourceSpell = this;
    this.owner.addBuff(watcher);
  }
}
