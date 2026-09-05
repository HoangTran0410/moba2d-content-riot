import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const StatAmp = api.buffs.StatAmp;
const AoePulse = api.AoePulse;
const Champion = api.units.Champion;

/**
 * Trái Tim Khổng Thần — the health item that *grows*, and the one purchase on
 * the tank shelf that asks its wearer to keep walking up to champions.
 *
 * A meter in the Giáp Người Chết family: it charges off time, is spent by one
 * swing, and the player can watch it and choose the swing. The payout is the
 * novelty — a small permanent bite of maximum health, capped, so a long match
 * turns the item from Warmog minus regen into the biggest health stick in the
 * shop, and a tank has a reason to be in the enemy's face between fights.
 *
 * Uncapped, by the owner's call (2026-09-06). The first version capped the
 * growth at +20 on the snowball argument; the owner overruled it for the
 * practice room — the grind IS the fun, and a long session deserves a second
 * bar. The other half of "vĩnh viễn" landed with it: the stacks now survive
 * their wearer's death (parked per champion, re-issued by the respawn's
 * fresh meter), and are given up only by selling the item — the same trade
 * the source game makes.
 *
 * One counted `StatAmp` re-issued per proc rather than N stacked buffs, the
 * exact shape of Giáp Thiên Nhiên's surge: `REPLACE_EXISTING` on a fixed
 * `stackId`, magnitude recomputed from the proc count, so the buff row shows
 * one line and can never double-count. Duration 0 — permanent — with
 * `sourceSpell` set, so selling the item takes the grown health with it.
 */

/** The meter: one empowered swing this often. */
export const HEARTSTEEL_CHARGE_MS = 10_000;

/**
 * What the empowered swing adds, physical, on top of the ordinary hit: a
 * base plus a share of the WEARER's maximum health — the item that grows a
 * health bar hits with the bar it grew. ~5 on a mid-game tank (~295 máu),
 * the flat number it replaced.
 */
export const HEARTSTEEL_BASE_DAMAGE = 2;
export const HEARTSTEEL_MAX_HEALTH_RATIO = 0.01;

/** Permanent maximum health per proc. No ceiling — see the header. */
export const HEARTSTEEL_HP_PER_PROC = 3;

export const HEARTSTEEL_STACK_ID = 'item_heartsteel';
export const HEARTSTEEL_GROWTH_STACK_ID = 'item_heartsteel_growth';

/** The proc flash on the victim — same size family as the spellblade rings. */
export const HEARTSTEEL_FLASH_RADIUS = 44;
export const HEARTSTEEL_FLASH_MS = 240;

// Colossus crimson: the item art's own deep red, distinct from the spellblade
// golds and blues beside it in a fight.
const COLOSSUS: [number, number, number] = [235, 90, 100];

/**
 * Stacks surviving their wearer's death — the meter buff is cleared with the
 * body and the respawn presses a fresh one, which used to arrive at zero.
 * Selling is the one way out: the growth belongs to the item.
 */
const PROCS_BY_UNIT = new WeakMap<object, number>();

export class Item_Heartsteel_Meter extends Buff {
  name = 'Trái Tim Khổng Thần';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  procs = 0;
  private nowMs = 0;
  /** The swing is armed once the clock reaches this. Armed at buy. */
  private readyAtMs = 0;

  onCreate(): void {
    const kept = PROCS_BY_UNIT.get(this.targetUnit) ?? 0;
    if (kept > 0) {
      this.procs = kept;
      this.issueGrowth();
    }
  }

  onDeactivate(): void {
    // Dying keeps what the heart grew; selling gives it up — on a sale the
    // wearer is alive when the item strips its buffs, on a death they are not.
    if (this.targetUnit.isDead) PROCS_BY_UNIT.set(this.targetUnit, this.procs);
    else PROCS_BY_UNIT.delete(this.targetUnit);
  }

  onUpdate(): void {
    this.nowMs += deltaTime;
  }

  /** One counted StatAmp, re-issued at the current proc count — see header. */
  private issueGrowth(): void {
    const growth = new StatAmp(0, this.targetUnit, this.targetUnit);
    growth.bonuses = { maxHealth: { flatBonus: HEARTSTEEL_HP_PER_PROC * this.procs } };
    growth.name = 'Trái Tim Khổng Thần';
    growth.buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
    growth.stackId = HEARTSTEEL_GROWTH_STACK_ID;
    growth.image = this.image;
    growth.sourceSpell = this.sourceSpell;
    this.targetUnit.addBuff(growth);
  }

  onHit(hit: OnHitEvent): void {
    // One swing's empowerment, never an echo's — a Runaan bolt or a phantom
    // hit spending the meter would cash it on a target nobody chose.
    if (hit.echo) return;
    if (this.nowMs < this.readyAtMs) return;
    if (!(hit.victim instanceof Champion)) return;

    this.readyAtMs = this.nowMs + HEARTSTEEL_CHARGE_MS;

    hit.victim.takeDamage(
      HEARTSTEEL_BASE_DAMAGE + this.targetUnit.stats.maxHealth.value * HEARTSTEEL_MAX_HEALTH_RATIO,
      this.targetUnit,
      'PHYSICAL',
      'Trái Tim Khổng Thần'
    );

    this.procs += 1;
    this.issueGrowth();

    const flash = new AoePulse(this.targetUnit);
    flash.position = hit.victim.position.copy();
    flash.radius = HEARTSTEEL_FLASH_RADIUS;
    flash.lifeTime = HEARTSTEEL_FLASH_MS;
    flash.color = [...COLOSSUS];
    flash.fillAlpha = 45;
    this.game.objectManager.addObject(flash);
  }

  /** Armed, worn on the rim — the player decides the swing, so they must see it. */
  draw(): void {
    if (this.nowMs < this.readyAtMs || this.targetUnit.isDead) return;
    const pos = this.targetUnit.position;
    const radius = this.targetUnit.animatedValues.displaySize / 2 + 5;
    const [r, g, b] = COLOSSUS;
    const spin = -frameCount / 16;

    push();
    noFill();
    stroke(r, g, b, 195 + 35 * Math.sin(frameCount / 6));
    strokeWeight(3);
    for (let i = 0; i < 2; i++) {
      const start = spin + i * PI;
      arc(pos.x, pos.y, radius * 2, radius * 2, start, start + 0.9);
    }
    pop();
  }
}

export default class Item_Heartsteel extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_heartsteel');
  name = 'Trái Tim Khổng Thần (Item_Heartsteel)';
  description =
    `Nội tại: mỗi ${secs(HEARTSTEEL_CHARGE_MS)} giây, đòn đánh kế tiếp lên tướng địch gây thêm ` +
    `${HEARTSTEEL_BASE_DAMAGE} + ${pct(HEARTSTEEL_MAX_HEALTH_RATIO)}% máu tối đa sát thương vật lý ` +
    `và tăng vĩnh viễn ${HEARTSTEEL_HP_PER_PROC} máu tối đa — cộng dồn vô hạn, ` +
    `giữ qua cái chết, chỉ mất khi bán`;
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
    const meter = new Item_Heartsteel_Meter(0, this.owner, this.owner);
    meter.stackId = HEARTSTEEL_STACK_ID;
    meter.image = this.image;
    meter.sourceSpell = this;
    this.owner.addBuff(meter);
  }
}
