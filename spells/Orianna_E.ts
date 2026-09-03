import type { AttackableUnit, CastContext, CastSpec, TargetingRequest } from '@moba2d/core/content/types';
import { ballFor } from './Orianna_Q';
import { api } from '../packApi';
import { secs } from '../text';

const Spell = api.Spell;
const Shield = api.buffs.Shield;
const TargetResolver = api.combat.TargetResolver;
const canSee = api.combat.Vision.canSee;
const effectiveRange = api.combat.Reach.effectiveRange;
const withinRange = api.combat.Reach.withinRange;
const AttackableUnitClass = api.units.AttackableUnit;
const heal = api.text.heal;


/**
 * Lệnh: Bảo Vệ. The Ball is thrown to an ally and then *stays with them* — the
 * one command that changes who is carrying it, and the reason an Orianna's Ball
 * can end up on the far side of a fight where her W and R then go off.
 *
 * `targetTeam: 'ALLY'` is load-bearing, not decoration: without it the request
 * defaults to `'ANY'` and the nearest-target fallback happily resolves an enemy
 * with the cursor on empty ground. Orianna herself is a legal target, which is
 * how the Ball comes home.
 *
 * The shield lands when the Ball lands, not when the key goes down — the flight
 * is the ability's cost of doing business, and the wiki record is explicit that
 * both the shield and the attachment happen on arrival. A self-cast onto an
 * ally who is already carrying it is an arrival with no flight, so it still pays
 * out immediately.
 *
 * The pass-through damage on the way is the Ball's own (see `Orianna_Q`).
 */
export const COOLDOWN_MS = 8_000;

export const MANA_COST = 40;

export const RANGE = 460;

export const SHIELD_AMOUNT = 32;

export const SHIELD_DURATION_MS = 2_500;

/** Its own pool: an ally may already be carrying an unrelated `Shield`. */
export const SHIELD_STACK_ID = 'orianna_e_shield';


export default class Orianna_E extends Spell {
  /**
   * Told: it sends the ball to an ally and shields them on arrival. The
   * tooltip claims damage on the way, but that is the ball's own doing and
   * lives in another file — this ability only ever adds a shield.
   */
  static aiRoles = api.enums.SpellRole.Shield;

  image = api.asset('spell_orianna_e');
  name = 'Lệnh: Bảo Vệ (Orianna_E)';
  description = `Ra lệnh cho Quả Cầu bay tới một đồng minh (kể cả chính Orianna) và <span class="buff">bám theo họ</span>, gây sát thương lên kẻ địch nó xuyên qua và tạo khiên ${heal(SHIELD_AMOUNT)} cho mục tiêu trong <span class="time">${secs(SHIELD_DURATION_MS)} giây</span> khi cầu tới nơi.`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;
  range = RANGE;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'PRESS',
      targeting: 'UNIT',
      resource: { commitAt: 'release', refundOn: ['TARGET_INVALID', 'OUT_OF_RANGE'] },
      cooldown: { startAt: 'release', durationMs: this.coolDown },
    };
  }

  get targetingRequest(): Readonly<TargetingRequest> {
    return {
      range: this.range,
      targetTeam: 'ALLY',
      queryCandidates: () => this.game.objectManager.objects,
      isTargetable: candidate => isProtectTarget(candidate),
      getTargetInfo: candidate =>
        isProtectTarget(candidate)
          ? {
              position: candidate.position,
              teamId: candidate.teamId,
              selectionRadius: candidate.animatedValues?.displaySize
                ? candidate.animatedValues.displaySize / 2
                : candidate.collisionRadius,
            }
          : null,
    };
  }

  press(context: CastContext): boolean {
    if (context.target !== undefined) return super.press(context);

    const result = TargetResolver.resolve('UNIT', {
      ...context,
      casterTeamId: this.owner.teamId,
      ...this.targetingRequest,
    });
    return result.ok ? super.press(result.context) : false;
  }

  checkCastCondition(): boolean {
    return this.isValidTarget(this.castContext?.target);
  }

  onUpdate(): void {
    if (this.state === 'CASTING' && !this.isValidTarget(this.castContext?.target)) {
      this.cancel('TARGET_INVALID');
    }
  }

  onSpellCast(context: CastContext): void {
    const ally = context.target;
    if (!isProtectTarget(ally)) return;

    ballFor(this.owner).commandToAlly(ally, () => {
      if (ally.isDead || ally.toRemove) return;

      const guard = new Shield(SHIELD_DURATION_MS, this.owner, ally);
      guard.image = this.image;
      guard.name = 'Khiên Bảo Vệ';
      guard.amount = SHIELD_AMOUNT;
      guard.color = [175, 220, 240];
      guard.stackId = SHIELD_STACK_ID;
      ally.addBuff(guard);
    });
  }

  drawPreview(): void {
    super.drawPreview(effectiveRange(this.range, this.owner));
  }

  private isValidTarget(target: unknown): target is AttackableUnit {
    return (
      isProtectTarget(target) &&
      canSee(this.owner, target) &&
      target.teamId === this.owner.teamId &&
      withinRange(this.range, this.owner, target)
    );
  }
}


export const isProtectTarget = (target: unknown): target is AttackableUnit =>
  target instanceof AttackableUnitClass && target.targetable && !target.toRemove && !target.isDead;
