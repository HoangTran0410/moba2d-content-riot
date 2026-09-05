import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { alliedChampionsAround } from './Item_Shurelya';
import { secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const AoePulse = api.AoePulse;

/**
 * Bùa Nguyệt Thạch — the enchanter's passive half: while Chuộc Tội is a
 * button pressed once for everyone, the moonstone drips, on its own clock,
 * onto whichever nearby ally is hurt the worst. No button, no aim — the item
 * is bought for the fights where the support is too busy to press anything.
 *
 * **Never the wearer.** An item that healed its own holder on a timer would
 * be Giáp Máu Warmog's regeneration resold at an enchanter's price; the
 * moonstone only pays while somebody else is standing in range with a dent
 * in their bar, which is what makes it a support item rather than a sustain
 * item. The heal goes through `takeHeal` — Vết Thương Sâu and
 * `healingReceived` both apply, exactly as they do to every other heal.
 *
 * The clock only spends when it lands: the timer resets on a real heal, so
 * out of combat the stone sits ready and the first wounded ally to walk past
 * is helped at once, not up to five seconds late.
 */

export const MOONSTONE_HEAL = 5;

/** At most one drip this often. */
export const MOONSTONE_TICK_MS = 5_000;

/** Who counts as "beside the wearer". */
export const MOONSTONE_RADIUS = 280;

/** Dents smaller than this are paint — the drip waits for a real wound. */
export const MOONSTONE_MIN_MISSING = 1;

export const MOONSTONE_STACK_ID = 'item_moonstone_renewer';

export const MOONSTONE_FLARE_RADIUS = 34;
export const MOONSTONE_FLARE_MS = 340;

// Moonlight blue-white: pale and cool, apart from Chuộc Tội's warm dawn.
const MOONLIGHT: [number, number, number] = [190, 215, 255];

export class Item_Moonstone_Drip extends Buff {
  name = 'Bùa Nguyệt Thạch';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  private sinceHeal = MOONSTONE_TICK_MS;

  onUpdate(): void {
    if (this.sinceHeal < MOONSTONE_TICK_MS) {
      this.sinceHeal += deltaTime;
      return;
    }

    const holder = this.targetUnit;
    if (holder.isDead || holder.toRemove) return;

    const hurt = this.mostWoundedAllyNear(holder);
    if (!hurt) return;

    this.sinceHeal = 0;
    hurt.takeHeal(MOONSTONE_HEAL, holder);

    const flare = new AoePulse(holder);
    flare.position = hurt.position.copy();
    flare.radius = MOONSTONE_FLARE_RADIUS;
    flare.lifeTime = MOONSTONE_FLARE_MS;
    flare.color = [...MOONLIGHT];
    flare.fillAlpha = 50;
    this.game.objectManager.addObject(flare);
  }

  /** The worst dent in range, or null while everyone nearby is whole. */
  private mostWoundedAllyNear(holder: AttackableUnit): AttackableUnit | null {
    let worst: AttackableUnit | null = null;
    let worstMissing = MOONSTONE_MIN_MISSING;
    for (const ally of alliedChampionsAround(holder, MOONSTONE_RADIUS)) {
      if (ally.isDead) continue;
      const missing = ally.stats.maxHealth.value - ally.stats.health.baseValue;
      if (missing >= worstMissing) {
        worst = ally;
        worstMissing = missing;
      }
    }
    return worst;
  }
}

export default class Item_Moonstone extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_moonstone_renewer');
  name = 'Bùa Nguyệt Thạch (Item_Moonstone)';
  description =
    `Nội tại: mỗi ${secs(MOONSTONE_TICK_MS)} giây, hồi ${MOONSTONE_HEAL} máu cho đồng minh` +
    ` bị thương nặng nhất đứng gần (không bao giờ cho bản thân)`;
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
    const drip = new Item_Moonstone_Drip(0, this.owner, this.owner);
    drip.stackId = MOONSTONE_STACK_ID;
    drip.image = this.image;
    drip.sourceSpell = this;
    this.owner.addBuff(drip);
  }
}
