import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const AoePulse = api.AoePulse;
const StatsModifier = api.units.StatsModifier;

/**
 * Đại Bác Liên Thanh — the poke marksman's item: on a slow clock the next
 * shot is Năng Lượng Hóa, fired from further out and landing a spark of
 * magic damage on top. Trái Tim Khổng Thần's meter shape (charge on time,
 * spend on one chosen swing, armed state worn on the rim), pointed outward.
 *
 * ## The range is real while armed, not granted per shot
 *
 * The whole point of the item is the shot the wearer could not otherwise
 * take, so the bonus range has to exist *before* the attack is chosen —
 * targeting reads `attackRange` when the player clicks, and a range granted
 * inside the hit would be a bonus on a shot that already connected. So the
 * armed state owns a `StatsModifier` (Giáp Người Chết's swap rule) that goes
 * on when the cannon charges and comes off the moment the shot is spent.
 */

/** The meter: one empowered shot this often. */
export const FIRECANNON_CHARGE_MS = 10_000;

/** Extra attack range while the shot is armed. Marksman base is 300. */
export const FIRECANNON_BONUS_RANGE = 90;

/**
 * The spark the empowered shot lands, magic, on top of the ordinary hit — a
 * share of the wearer's attack damage rather than the flat 4 it launched as,
 * so the poke keeps stinging off a full build. ~4 on a mid-game marksman
 * (~22 công).
 */
export const FIRECANNON_AD_RATIO = 0.18;

export const FIRECANNON_STACK_ID = 'item_rapid_firecannon';

export const FIRECANNON_FLASH_RADIUS = 40;
export const FIRECANNON_FLASH_MS = 240;

// Hextech spark: hot white-orange, the color of the item art's barrel glow.
const SPARK: [number, number, number] = [255, 180, 90];

export class Item_Firecannon_Charge extends Buff {
  name = 'Đại Bác Liên Thanh';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  private nowMs = 0;
  /** The shot is armed once the clock reaches this. Armed at buy. */
  private readyAtMs = 0;
  private rangeApplied = false;
  private modifier = new StatsModifier();

  onCreate(): void {
    this.modifier = new StatsModifier();
    this.modifier.attackRange.flatBonus = FIRECANNON_BONUS_RANGE;
  }

  onUpdate(): void {
    this.nowMs += deltaTime;
    if (!this.rangeApplied && this.nowMs >= this.readyAtMs) {
      this.rangeApplied = true;
      this.targetUnit.stats.addModifier(this.modifier);
    }
  }

  onDeactivate(): void {
    // Selling the cannon while charged must take the reach with it.
    if (this.rangeApplied) {
      this.rangeApplied = false;
      this.targetUnit.stats.removeModifier(this.modifier);
    }
  }

  onHit(hit: OnHitEvent): void {
    // One shot's empowerment, never an echo's — a Runaan bolt spending the
    // charge would cash the long-range shot on a target nobody aimed at.
    if (hit.echo) return;
    if (!this.rangeApplied) return;

    this.rangeApplied = false;
    this.targetUnit.stats.removeModifier(this.modifier);
    this.readyAtMs = this.nowMs + FIRECANNON_CHARGE_MS;

    hit.victim.takeDamage(
      this.targetUnit.stats.attackDamage.value * FIRECANNON_AD_RATIO,
      this.targetUnit,
      'MAGIC',
      'Đại Bác Liên Thanh'
    );

    const flash = new AoePulse(this.targetUnit);
    flash.position = hit.victim.position.copy();
    flash.radius = FIRECANNON_FLASH_RADIUS;
    flash.lifeTime = FIRECANNON_FLASH_MS;
    flash.color = [...SPARK];
    flash.fillAlpha = 45;
    this.game.objectManager.addObject(flash);
  }

  /** Armed, worn on the rim — the player chooses the long shot, so they must see it. */
  draw(): void {
    if (!this.rangeApplied || this.targetUnit.isDead) return;
    const pos = this.targetUnit.position;
    const radius = this.targetUnit.animatedValues.displaySize / 2 + 5;
    const [r, g, b] = SPARK;
    const spin = frameCount / 12;

    push();
    noFill();
    stroke(r, g, b, 200 + 35 * Math.sin(frameCount / 6));
    strokeWeight(3);
    for (let i = 0; i < 2; i++) {
      const start = spin + i * PI;
      arc(pos.x, pos.y, radius * 2, radius * 2, start, start + 0.9);
    }
    pop();
  }
}

export default class Item_Firecannon extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_rapid_firecannon');
  name = 'Đại Bác Liên Thanh (Item_Firecannon)';
  description =
    `Nội tại: mỗi ${secs(FIRECANNON_CHARGE_MS)} giây, đòn đánh kế tiếp có thêm ` +
    `${FIRECANNON_BONUS_RANGE} tầm đánh và gây thêm sát thương phép bằng ` +
    `${pct(FIRECANNON_AD_RATIO)}% công`;
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
    const charge = new Item_Firecannon_Charge(0, this.owner, this.owner);
    charge.stackId = FIRECANNON_STACK_ID;
    charge.image = this.image;
    charge.sourceSpell = this;
    this.owner.addBuff(charge);
  }
}
