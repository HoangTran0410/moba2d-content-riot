import type { AttackableUnit, CastSpec, DamageType } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Stasis = api.buffs.Stasis;
const AoePulse = api.AoePulse;

/**
 * Giáp Thiên Thần — the shop's last word on the tank shelf's question. The
 * lifeline family answers "I am about to die" three ways already: Sterak
 * shields ahead of the line, Malmortius shields against one school, Nỏ Tử
 * Thủ shields the carry. This one answers *at* the line: the hit that would
 * kill leaves its wearer at one health instead, once in a long while.
 *
 * Like Dây Chuyền Chữ Thập it genuinely belongs in the mitigation chain —
 * `modifyIncomingDamage` returns a different number, the hook's stated job —
 * and it keeps the veil's two honesty rules: only a real enemy's hit
 * triggers it (the map's tick or a teammate's misfire must not spend a
 * 50-second charge), and only a hit that would actually cross the line. It
 * clamps rather than refusing: everything up to the last point of health is
 * still taken, so the wearer the wings saved is genuinely at one health —
 * any tick of anything finishes the job the moment the wings are spent.
 */

/** How long after firing before the wings re-form. */
export const GUARDIAN_ANGEL_REARM_MS = 50_000;

/** How long the revival holds the wearer, and where the fill ends. */
export const GUARDIAN_REVIVE_MS = 3_000;
export const GUARDIAN_REVIVE_FRACTION = 0.3;

export const GUARDIAN_ANGEL_STACK_ID = 'item_guardian_angel';
export const GUARDIAN_REVIVAL_STACK_ID = 'item_guardian_angel_revival';

/** The intervention flash — bigger than the veil's; a death just did not happen. */
export const GUARDIAN_FLASH_RADIUS = 54;
export const GUARDIAN_FLASH_MS = 340;

// Feather gold-white, the item art's own wings.
const AEGIS: [number, number, number] = [255, 240, 190];

/**
 * The revival: what everyone watching would call a resurrection, built so the
 * wearer never actually dies. Core's `Stasis` is the whole first half —
 * untargetable, immune, stunned, immovable — and this adds the second: the
 * health bar fills from the 1 the wings left toward
 * `GUARDIAN_REVIVE_FRACTION` of maximum over the buff's life, then the shell
 * breaks and the champion simply resumes.
 *
 * The fill is a direct health write, not `takeHeal`, and both halves of that
 * are decisions: `takeHeal` would float a climbing green number every tick of
 * a state that should read as a body knitting itself back together, and it
 * would hand Vết Thương Sâu a bite out of a resurrection — the source game's
 * revival restores a fixed amount for the same reason. Written as "raise to
 * the ramp, never lower" so nothing here can undo a fountain tick that got
 * there first.
 */
export class Item_GuardianAngel_Revival extends Stasis {
  name = 'Thiên Thần Hộ Mệnh';
  description =
    `Không thể bị chọn làm mục tiêu, miễn mọi sát thương, và hồi máu dần tới ` +
    `${pct(GUARDIAN_REVIVE_FRACTION)}% máu tối đa — trông như hồi sinh, nhưng chưa từng chết.`;

  private elapsedMs = 0;
  private startHealth = 1;

  onActivate(): void {
    super.onActivate();
    this.startHealth = this.targetUnit.stats.health.baseValue;
  }

  onUpdate(): void {
    this.elapsedMs += deltaTime;
    const progress = Math.min(1, this.elapsedMs / GUARDIAN_REVIVE_MS);
    const target = this.targetUnit.stats.maxHealth.value * GUARDIAN_REVIVE_FRACTION;
    const ramp = this.startHealth + (target - this.startHealth) * progress;
    if (this.targetUnit.stats.health.baseValue < ramp) {
      this.targetUnit.stats.health.baseValue = ramp;
    }
  }

  /**
   * NOT Stasis's picture. The inherited draw is Zhonya's whole identity —
   * amber disc, rotating spokes — and a revival wearing it read as "somebody
   * pressed an hourglass". This paints the item's own story instead: a soft
   * feather-white veil, two wings that unfold as the body knits, rising motes
   * of light, and one progress ring sweeping clockwise so "how much longer"
   * is readable at a glance from across the fight.
   */
  draw(): void {
    const pos = this.targetUnit.position;
    const size = this.targetUnit.animatedValues.displaySize;
    const progress = Math.min(1, this.elapsedMs / GUARDIAN_REVIVE_MS);
    const [r, g, b] = AEGIS;
    const ring = size + 18;

    push();
    // The veil: faint, white-gold, no hard disc.
    noStroke();
    fill(r, g, b, 30);
    circle(pos.x, pos.y, ring);

    // The progress ring — fills clockwise from the top with the revival.
    noFill();
    stroke(r, g, b, 235);
    strokeWeight(3);
    if (progress > 0.01) arc(pos.x, pos.y, ring, ring, -HALF_PI, -HALF_PI + TWO_PI * progress);

    // The wings, unfolding: each arc's span grows with the fill, so a body
    // half-revived wears half-open wings.
    const span = 0.5 + (PI - 1.1) * progress;
    stroke(255, 250, 225, 210);
    strokeWeight(2.5);
    for (let side = 0; side < 2; side++) {
      const middle = side === 0 ? PI : 0;
      arc(pos.x, pos.y, ring + 12, ring + 12, middle - span / 2, middle + span / 2);
    }

    // Motes of light rising through the shell — deterministic off frameCount,
    // nothing allocated per frame.
    strokeWeight(3);
    for (let i = 0; i < 5; i++) {
      const t = (frameCount / 55 + i * 0.37) % 1;
      const alpha = 220 * (1 - t);
      stroke(255, 255, 235, alpha);
      const x = pos.x + sin(i * 2.4 + frameCount / 28) * (size / 3);
      const y = pos.y + size / 2 - t * (size + 22);
      point(x, y);
    }
    pop();
  }
}

export class Item_GuardianAngel_Wings extends Buff {
  name = 'Giáp Thiên Thần';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  /**
   * Core's rearm clock is the whole mechanism now — `startRearm` on the
   * trigger, ticked by the base `update`, drawn on the item slot, and parked
   * across the wearer's death by `sourceSpell` so dying right after a
   * revival does not hand the wings back re-formed.
   */
  get armed(): boolean {
    return this.rearmed;
  }

  /**
   * Set when the clamp fires, spent in `onDamageTaken` — the Maw latch
   * pattern. The revival buff must not be added from inside
   * `modifyIncomingDamage`: that hook runs mid-walk over this same buff
   * list, and `addBuff` mutating the list under the walk is exactly the
   * re-entrancy `DamageReflect`'s chain-order rule exists to keep out.
   */
  private reviveLatched = false;

  onDamageTaken(): void {
    if (!this.reviveLatched) return;
    this.reviveLatched = false;

    const revival = new Item_GuardianAngel_Revival(GUARDIAN_REVIVE_MS, this.targetUnit, this.targetUnit);
    revival.stackId = GUARDIAN_REVIVAL_STACK_ID;
    revival.image = this.image;
    revival.sourceSpell = this.sourceSpell;
    this.targetUnit.addBuff(revival);
  }

  modifyIncomingDamage(damage: number, attacker?: AttackableUnit, _type?: DamageType): number {
    if (!this.armed) return damage;
    if (!attacker || attacker.teamId === this.targetUnit.teamId) return damage;

    const left = this.targetUnit.stats.health.baseValue;
    if (left <= 0 || damage < left) return damage;

    this.startRearm(GUARDIAN_ANGEL_REARM_MS);
    this.reviveLatched = true;

    const burst = new AoePulse(this.targetUnit);
    burst.position = this.targetUnit.position.copy();
    burst.radius = GUARDIAN_FLASH_RADIUS;
    burst.lifeTime = GUARDIAN_FLASH_MS;
    burst.color = [...AEGIS];
    burst.fillAlpha = 55;
    this.game.objectManager.addObject(burst);

    // Everything except the last point of health — clamp, don't refuse.
    return Math.max(0, left - 1);
  }

  /** Armed, worn on the rim — same faint contract as the veil's whisper. */
  draw(): void {
    if (!this.armed || this.targetUnit.isDead) return;
    const pos = this.targetUnit.position;
    const radius = this.targetUnit.animatedValues.displaySize / 2 + 8;
    const [r, g, b] = AEGIS;

    push();
    noFill();
    stroke(r, g, b, 85 + 25 * Math.sin(frameCount / 10));
    strokeWeight(2);
    for (let i = 0; i < 2; i++) {
      const start = -HALF_PI + 0.5 + i * (PI - 1);
      arc(pos.x, pos.y, radius * 2, radius * 2, start, start + PI - 1);
    }
    pop();
  }
}

export default class Item_GuardianAngel extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_guardian_angel');
  name = 'Giáp Thiên Thần (Item_GuardianAngel)';
  description =
    `Nội tại: đòn lẽ ra kết liễu bạn để lại 1 máu, rồi bọc bạn trong` +
    ` <span class="time">${secs(GUARDIAN_REVIVE_MS)} giây</span> hồi sinh — không thể bị chọn làm` +
    ` mục tiêu, miễn mọi sát thương, hồi máu dần tới` +
    ` <span class="buff">${pct(GUARDIAN_REVIVE_FRACTION)}% máu tối đa</span> — nhưng thực ra bạn` +
    ` chưa từng chết (hồi lại sau ${secs(GUARDIAN_ANGEL_REARM_MS)} giây)`;
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
    const wings = new Item_GuardianAngel_Wings(0, this.owner, this.owner);
    wings.stackId = GUARDIAN_ANGEL_STACK_ID;
    wings.image = this.image;
    wings.sourceSpell = this;
    this.owner.addBuff(wings);
  }
}
