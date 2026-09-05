import type { AttackableUnit, CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const AoePulse = api.AoePulse;
const Champion = api.units.Champion;

/**
 * Giáo Thiên Ly — the trade-opener. The spellblade family pays for weaving a
 * spell; this pays for *picking a target*: the first swing against each enemy
 * champion lands heavier and hands a bite of health back, then that target is
 * spent for a while and the wearer has a reason to turn on someone else.
 *
 * Per-target cooldowns rather than one global clock, which is the whole
 * difference between this and a spellblade: in a two-champion scrum the item
 * pays twice, once per face, and against a single duelist it is one opener
 * per re-engage. The ledger is a plain map on the buff — pruned as it is
 * read, so a dead or long-forgotten victim costs one map entry until the
 * next proc, never a leak that grows for a match.
 */

/** The opener's bonus, as a share of the wearer's base attack damage. */
export const SUNDERED_BASE_AD_RATIO = 0.5;

/** What the wearer gets back, through `takeHeal` — wounds and blessings apply. */
export const SUNDERED_HEAL = 6;

/** Per-target: how long before the same champion pays the opener again. */
export const SUNDERED_PER_TARGET_MS = 8_000;

export const SUNDERED_STACK_ID = 'item_sundered_sky';

/** The proc flash — spellblade-family size, in dawn gold. */
export const SUNDERED_FLASH_RADIUS = 44;
export const SUNDERED_FLASH_MS = 240;

// Sunrise gold: warm, and clearly not the Sheen family's cool blue.
const DAWNLIGHT: [number, number, number] = [255, 205, 110];

export class Item_SunderedSky_Judgment extends Buff {
  name = 'Giáo Thiên Ly';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  /** Per-victim: the clock reading at which that champion pays again. */
  private readyAgainAt = new Map<AttackableUnit, number>();
  private nowMs = 0;

  onUpdate(): void {
    this.nowMs += deltaTime;
  }

  onHit(hit: OnHitEvent): void {
    // The opener is one chosen swing — an echo or a Runaan bolt opening on a
    // target nobody clicked would spend the per-target window unasked.
    if (hit.echo) return;
    if (!(hit.victim instanceof Champion)) return;
    if (hit.victim.isDead || hit.victim.toRemove) return;

    const readyAt = this.readyAgainAt.get(hit.victim) ?? -Infinity;
    if (this.nowMs < readyAt) return;

    // Prune while we are here: every entry whose window already closed is
    // bookkeeping about a fight that is over.
    for (const [victim, at] of this.readyAgainAt) {
      if (this.nowMs >= at || victim.toRemove) this.readyAgainAt.delete(victim);
    }
    this.readyAgainAt.set(hit.victim, this.nowMs + SUNDERED_PER_TARGET_MS);

    const base = this.targetUnit.stats.attackDamage.baseValue;
    hit.victim.takeDamage(
      base * SUNDERED_BASE_AD_RATIO,
      this.targetUnit,
      'PHYSICAL',
      'Giáo Thiên Ly'
    );
    this.targetUnit.takeHeal(SUNDERED_HEAL, this.targetUnit);

    const flash = new AoePulse(this.targetUnit);
    flash.position = hit.victim.position.copy();
    flash.radius = SUNDERED_FLASH_RADIUS;
    flash.lifeTime = SUNDERED_FLASH_MS;
    flash.color = [...DAWNLIGHT];
    flash.fillAlpha = 50;
    this.game.objectManager.addObject(flash);
  }
}

export default class Item_SunderedSky extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_sundered_sky');
  name = 'Giáo Thiên Ly (Item_SunderedSky)';
  description =
    `Nội tại: đòn đánh đầu tiên lên mỗi tướng địch gây thêm ${pct(SUNDERED_BASE_AD_RATIO)}% công` +
    ` cơ bản và hồi ${SUNDERED_HEAL} máu (mỗi mục tiêu ${secs(SUNDERED_PER_TARGET_MS)} giây một lần)`;
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
    const judgment = new Item_SunderedSky_Judgment(0, this.owner, this.owner);
    judgment.stackId = SUNDERED_STACK_ID;
    judgment.image = this.image;
    judgment.sourceSpell = this;
    this.owner.addBuff(judgment);
  }
}
