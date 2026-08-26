import type { AttackableUnit, CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Slow = api.buffs.Slow;
const Champion = api.units.Champion;
const StatsModifier = api.units.StatsModifier;
const MissileSpellObject = api.MissileSpellObject;
const AoePulse = api.AoePulse;
const TrailSystem = api.helpers.TrailSystem;
const BuffAddType = api.enums.BuffAddType;
const VectorUtils = api.utils.VectorUtils;

/**
 * Công Kích Hoàng Hôn — the Spirit Blade thrown out and recalled.
 *
 * **What was reshaped from the wiki, deliberately.** Shen's real Spirit Blade
 * is a persistent world object that lives on the map and that W and R
 * *relocate*; Q is a recall of that object toward him. Modelling a fourth
 * body with its own position, its own leash and three spells writing to it is
 * a state machine none of the four abilities here needs to read, so this Q is
 * an ordinary boomerang instead: the blade leaves Shen, reaches out, and comes
 * home. Everything the player can actually feel survives that — two passes,
 * one hit each, the empowerment that only lands if the blade *arrives*, and
 * the stronger empowerment when the blade clipped a champion on the way.
 *
 * The empowerment is a `Buff` with a stack counter implementing `onHit`, the
 * spellblade shape — `hit.echo` is ignored, because this is a payload rather
 * than a propagator: a phantom application must not spend a charge the real
 * swing did not.
 */

/** Per pass. A body standing in the lane takes it twice. */
export const PASS_DAMAGE = 20;

export const SLOW_PERCENT = 0.3;

export const SLOW_DURATION_MS = 1_200;

/**
 * Its own slot, so the blade's slow neither evicts nor is evicted by anyone
 * else's — and `RENEW_EXISTING` on top, because a second pass re-applying the
 * default `STACKS_AND_CONTINUE` would turn 30% into a standstill.
 */
export const SLOW_STACK_ID = 'shen_q_slow';

export const EMPOWERED_BONUS = 8;

/** Paid when the blade touched at least one enemy champion on either pass. */
export const EMPOWERED_BONUS_VS_CHAMPION = 14;

export const EMPOWERED_ATTACKS = 3;

export const EMPOWER_WINDOW_MS = 8_000;

/** A melee tank's reach, nudged — enough to start a trade, not to poke. */
export const BONUS_ATTACK_RANGE = 40;

export const COOLDOWN_MS = 7_000;

export const MANA_COST = 30;

export const BLADE_REACH = 380;

/** What the death recap groups this ability's damage under. */
const DAMAGE_LABEL = 'Công Kích Hoàng Hôn';


export default class Shen_Q extends Spell {
  image = api.asset('spell_shen_q');
  name = 'Công Kích Hoàng Hôn (Shen_Q)';
  description =
    `Shen phóng Linh Kiếm theo hướng chỉ định rồi thu về. Mỗi lượt bay gây` +
    ` <span class="damage">${PASS_DAMAGE} sát thương phép</span> và` +
    ` <span class="buff">làm chậm ${SLOW_PERCENT * 100}%</span> trong` +
    ` <span class="buff">${SLOW_DURATION_MS / 1000} giây</span> — mỗi lượt chỉ trúng một mục tiêu` +
    ` một lần, nên một đường kiếm đặt khéo sẽ chém trúng hai lần.` +
    ` Khi kiếm về tới tay, <span class="buff">${EMPOWERED_ATTACKS} đòn đánh thường</span> kế tiếp` +
    ` trong <span class="buff">${EMPOWER_WINDOW_MS / 1000} giây</span> được cộng` +
    ` <span class="damage">${EMPOWERED_BONUS} sát thương phép</span> và` +
    ` <span class="buff">${BONUS_ATTACK_RANGE} tầm đánh</span>, nâng lên` +
    ` <span class="damage">${EMPOWERED_BONUS_VS_CHAMPION}</span> nếu lưỡi kiếm có chạm trúng tướng địch.`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;
  range = BLADE_REACH;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'PRESS',
      targeting: 'DIRECTION',
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: this.coolDown },
    };
  }

  onSpellCast(): void {
    const { to } = VectorUtils.getVectorWithRange(this.owner.position, this.aimPoint, this.range);

    const blade = new Shen_Q_Blade(this.owner);
    blade.destination = to;
    this.game.objectManager.addObject(blade);
  }
}


/**
 * The blade itself. Out to the aim point, then home — and `hitTargets` is
 * emptied at the turn, which is what makes "each pass hits a given enemy at
 * most once" mean two hits rather than one.
 */
export class Shen_Q_Blade extends MissileSpellObject {
  speed = 11;
  size = 34;

  /** It cuts through a whole lane; nothing stops it but the trip home. */
  maxHitCount = Infinity;
  /** Reaching the aim point is the halfway mark, not the end. */
  removeOnArrive = false;

  /** False on the way out, true on the way back. */
  returning = false;
  /** Whether either pass touched an enemy champion — the stronger empowerment. */
  championHit = false;
  /** Accumulated in `onBeforeMove` so `draw` never has to roll anything. */
  spin = 0;

  trailSystem = new TrailSystem({
    trailSize: this.size * 0.55,
    trailColor: 'rgba(150, 190, 240, 0.28)',
  });

  onBeforeMove(): void {
    this.spin += 0.34;
    // Recalled, not thrown back: the blade tracks Shen while it returns, so
    // walking away mid-flight lengthens the trip instead of dropping it.
    if (this.returning) this.destination.set(this.owner.position.x, this.owner.position.y);
  }

  onArrive(): void {
    if (!this.returning) {
      this.returning = true;
      // A new pass is a new set of victims.
      this.hitTargets = [];
      this.destination.set(this.owner.position.x, this.owner.position.y);
      return;
    }

    this.toRemove = true;

    const empower = new Shen_Q_Empower(EMPOWER_WINDOW_MS, this.owner, this.owner);
    empower.championHit = this.championHit;
    this.owner.addBuff(empower);
  }

  onHit(enemy: AttackableUnit): void {
    enemy.takeDamage(PASS_DAMAGE, this.owner, 'MAGIC', DAMAGE_LABEL);
    if (enemy instanceof Champion) this.championHit = true;

    // After the damage, so a body the blade just killed is already dead and
    // `addBuff` refuses rather than leaving a slow on a corpse.
    const slow = new Slow(SLOW_DURATION_MS, this.owner, enemy);
    slow.percent = SLOW_PERCENT;
    slow.stackId = SLOW_STACK_ID;
    slow.buffAddType = BuffAddType.RENEW_EXISTING;
    enemy.addBuff(slow);

    const cut = new AoePulse(this.owner);
    cut.position = enemy.position.copy();
    cut.radius = 26;
    cut.lifeTime = 240;
    cut.color = [150, 195, 255];
    cut.fillAlpha = 32;
    this.game.objectManager.addObject(cut);
  }

  /**
   * Two mirrored crescents around a pale core, spinning on `spin`. Cool hues
   * because the damage is magic, and a rotation rather than a static sprite so
   * the outbound and the return read as the same object travelling, which is
   * the one thing the player has to track to land both passes.
   */
  draw(): void {
    const radius = this.size / 2;

    push();
    translate(this.position.x, this.position.y);
    rotate(this.spin);
    noFill();
    stroke(105, 145, 205, 95);
    strokeWeight(7);
    arc(0, 0, radius * 2.5, radius * 2.5, -0.7, 0.7);
    arc(0, 0, radius * 2.5, radius * 2.5, PI - 0.7, PI + 0.7);
    stroke(215, 235, 255, 230);
    strokeWeight(2.5);
    arc(0, 0, radius * 2.2, radius * 2.2, -0.6, 0.6);
    arc(0, 0, radius * 2.2, radius * 2.2, PI - 0.6, PI + 0.6);
    noStroke();
    fill(95, 125, 195, 150);
    circle(0, 0, radius);
    fill(228, 240, 255, 215);
    circle(0, 0, radius * 0.5);
    pop();
  }
}


/**
 * The armed edge. One instance carrying a counter, so the HUD shows the number
 * of swings that are still worth something.
 */
export class Shen_Q_Empower extends Buff {
  image = api.asset('spell_shen_q');
  name = 'Lưỡi Kiếm Hoàng Hôn';
  description =
    `<span class="buff">${EMPOWERED_ATTACKS} đòn đánh thường</span> kế tiếp gây thêm` +
    ` <span class="damage">${EMPOWERED_BONUS} sát thương phép</span>` +
    ` (<span class="damage">${EMPOWERED_BONUS_VS_CHAMPION}</span> nếu Linh Kiếm đã chạm tướng)` +
    ` và cộng <span class="buff">${BONUS_ATTACK_RANGE} tầm đánh</span>`;
  stackId = 'shen_q_empower';
  buffAddType = BuffAddType.REPLACE_EXISTING;
  maxStacks = EMPOWERED_ATTACKS;
  stacks = EMPOWERED_ATTACKS;

  /** Set by the blade: the harder number is earned, not free. */
  championHit = false;

  statsModifier = new StatsModifier();

  onCreate(): void {
    this.statsModifier = new StatsModifier();
    this.statsModifier.attackRange.baseBonus = BONUS_ATTACK_RANGE;
  }

  onActivate(): void {
    this.targetUnit.stats.addModifier(this.statsModifier);
  }

  onDeactivate(): void {
    this.targetUnit.stats.removeModifier(this.statsModifier);
  }

  get bonusDamage(): number {
    return this.championHit ? EMPOWERED_BONUS_VS_CHAMPION : EMPOWERED_BONUS;
  }

  onHit(hit: OnHitEvent): void {
    // An echo is a propagator's re-application, not the swing this empowers —
    // and only a propagator is allowed to care about the difference, which is
    // exactly why a plain payload like this one drops it on the floor.
    if (hit.echo) return;
    if (this.stacks <= 0) return;

    hit.victim.takeDamage(this.bonusDamage, this.targetUnit, 'MAGIC', DAMAGE_LABEL);

    const strike = new AoePulse(this.targetUnit);
    strike.position = hit.victim.position.copy();
    strike.radius = 30;
    strike.lifeTime = 220;
    strike.color = [165, 200, 255];
    strike.fillAlpha = 38;
    this.game.objectManager.addObject(strike);

    this.stacks -= 1;
    if (this.stacks <= 0) this.deactivateBuff();
  }

  /**
   * One blade-mark per swing still owed, fanned above Shen's shoulder and
   * blooming in over the first frames rather than popping in. Countable at a
   * glance, which is the only thing this state is for.
   */
  draw(): void {
    if (this.stacks <= 0) return;
    const pos = this.targetUnit.position;
    const bloom = constrain(this.timeElapsed / 160, 0, 1);
    const radius = (this.targetUnit.animatedValues.displaySize / 2 + 9) * (0.72 + 0.28 * bloom);

    push();
    noFill();
    stroke(175, 210, 255, 215 * bloom);
    strokeWeight(3);
    for (let i = 0; i < this.stacks; i++) {
      const angle = -HALF_PI + (i - (this.stacks - 1) / 2) * 0.46;
      arc(pos.x, pos.y, radius * 2, radius * 2, angle - 0.15, angle + 0.15);
    }
    pop();
  }
}
