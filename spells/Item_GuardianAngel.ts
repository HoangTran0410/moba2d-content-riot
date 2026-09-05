import type { AttackableUnit, CastSpec, DamageType } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
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

export const GUARDIAN_ANGEL_STACK_ID = 'item_guardian_angel';

/** The intervention flash — bigger than the veil's; a death just did not happen. */
export const GUARDIAN_FLASH_RADIUS = 54;
export const GUARDIAN_FLASH_MS = 340;

// Feather gold-white, the item art's own wings.
const AEGIS: [number, number, number] = [255, 240, 190];

export class Item_GuardianAngel_Wings extends Buff {
  name = 'Giáp Thiên Thần';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  armed = true;
  private nowMs = 0;
  private spentAtMs = -Infinity;

  onUpdate(): void {
    this.nowMs += deltaTime;
    if (!this.armed && this.nowMs - this.spentAtMs >= GUARDIAN_ANGEL_REARM_MS) this.armed = true;
  }

  modifyIncomingDamage(damage: number, attacker?: AttackableUnit, _type?: DamageType): number {
    if (!this.armed) return damage;
    if (!attacker || attacker.teamId === this.targetUnit.teamId) return damage;

    const left = this.targetUnit.stats.health.baseValue;
    if (left <= 0 || damage < left) return damage;

    this.armed = false;
    this.spentAtMs = this.nowMs;

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
    `Nội tại: đòn lẽ ra kết liễu bạn để lại 1 máu thay vì giết` +
    ` (hồi lại sau ${secs(GUARDIAN_ANGEL_REARM_MS)} giây)`;
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
