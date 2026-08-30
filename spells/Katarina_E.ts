import type { AttackableUnit, CastContext, CastSpec } from '@moba2d/core/content/types';
import { Katarina_Blade_Impact, Katarina_Dagger } from './Katarina_Q';
import { KATARINA_BLOOD, KATARINA_STEEL, KATARINA_DAGGER_SLASH_DAMAGE } from './Katarina_Q';
import { api } from '../packApi';

const Circle = api.utils.Quadtree.Circle;
const effectiveRange = api.combat.Reach.effectiveRange;
const PredefinedFilters = api.combat.PredefinedFilters;
const AttackableUnit = api.units.AttackableUnit;
const Spell = api.Spell;
const SpellObject = api.SpellObject;




export const KATARINA_E_RANGE = 420;

export const KATARINA_E_STRIKE_DAMAGE = 14;

export const KATARINA_E_STRIKE_RADIUS = 130;

export const KATARINA_E_DAGGER_DAMAGE = KATARINA_DAGGER_SLASH_DAMAGE;

export const KATARINA_E_Q_REFUND_MS = 1_500;


export default class Katarina_E extends Spell {
  image = api.asset('spell_katarina_e');
  name = 'Ám Sát (Katarina_E)';
  description = `Dịch chuyển tức thời tới một <b>kẻ địch, đồng minh, lính, quái, trụ</b> hoặc <b>con dao</b> trong tầm — <b>không có mục tiêu thì không dùng được</b>, không thể nhảy vào chỗ trống.
    Nếu tới kẻ địch, gây <span class="damage magic">${KATARINA_E_STRIKE_DAMAGE} sát thương phép</span>.
    Nếu tới con dao, kích hoạt <b>xoay kiếm diện rộng</b> gây
    <span class="damage magic">${KATARINA_DAGGER_SLASH_DAMAGE} sát thương phép</span> và hồi lại phần lớn thời gian hồi chiêu Ám Sát.`;
  coolDown = 10_000;
  manaCost = 0;
  range = KATARINA_E_RANGE;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'PRESS',
      targeting: 'POINT',
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'release', durationMs: this.coolDown },
    };
  }

  /**
   * Every body Shunpo may land on: an ally, an enemy, a minion, a camp, a
   * turret — anything that is a unit and is not Katarina herself.
   *
   * Deliberately not filtered by team. Shunpo is a *reposition* first and a
   * gap-closer second, and stepping to a friendly minion to escape is as much
   * the ability as stepping to a champion to kill one.
   */
  private unitsInRange(): AttackableUnit[] {
    const reach = effectiveRange(this.range, this.owner);
    const found = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.owner.position.x, y: this.owner.position.y, r: reach }),
      filters: [PredefinedFilters.type(AttackableUnit), PredefinedFilters.visibleTo(this.owner)],
    }) as AttackableUnit[];

    const kept: AttackableUnit[] = [];
    for (const unit of found) {
      if (unit === this.owner || unit.isDead || unit.toRemove) continue;
      if (!(unit instanceof AttackableUnit)) continue;
      kept.push(unit);
    }
    return kept;
  }

  /** Her own daggers close enough to step to, whatever the cursor is doing. */
  private daggersInRange(): Katarina_Dagger[] {
    const reach = effectiveRange(this.range, this.owner);
    const kept: Katarina_Dagger[] = [];
    for (const dagger of Katarina_Dagger.aliveFor(this.owner)) {
      const gap = Math.hypot(
        dagger.position.x - this.owner.position.x,
        dagger.position.y - this.owner.position.y
      );
      if (gap <= reach) kept.push(dagger);
    }
    return kept;
  }

  /**
   * Shunpo goes *to* something, or it does not go.
   *
   * It used to blink to bare ground whenever the cursor was not within 90px of
   * a unit or a dagger — a 420px free teleport on a 10s cooldown, which is a
   * different and much stronger ability than the one the tooltip describes.
   * The candidate set is now the whole cast range and the cursor picks which
   * of them, so aiming at a gap between two bodies steps to the nearer one
   * instead of into the gap.
   */
  checkCastCondition(): boolean {
    if (this.owner.grounded) return false;
    return this.daggersInRange().length > 0 || this.unitsInRange().length > 0;
  }

  onSpellCast(context: CastContext): void {
    const reach = effectiveRange(this.range, this.owner);
    const aim = context?.cursorWorld ?? this.aimPoint;
    const origin = createVector(this.owner.position.x, this.owner.position.y);

    // A dagger under the cursor wins outright — that is the combo the whole
    // kit is built around, and it should never lose a tie to a passing minion.
    let snappedDagger = Katarina_Dagger.snapTarget(this.owner, aim.x, aim.y);
    if (snappedDagger) {
      const gap = Math.hypot(
        snappedDagger.position.x - origin.x,
        snappedDagger.position.y - origin.y
      );
      if (gap > reach) snappedDagger = null;
    }

    let targetUnit: AttackableUnit | null = null;
    if (!snappedDagger) {
      let closestDist = Infinity;
      for (const unit of this.unitsInRange()) {
        const d = Math.hypot(unit.position.x - aim.x, unit.position.y - aim.y);
        if (d < closestDist) {
          closestDist = d;
          targetUnit = unit;
        }
      }
    }

    // Nothing to step to. Re-asked here rather than trusted from
    // `checkCastCondition` because the only candidate can die or walk out
    // between the two.
    let anchor: { x: number; y: number } | null = snappedDagger
      ? { x: snappedDagger.position.x, y: snappedDagger.position.y }
      : targetUnit
        ? { x: targetUnit.position.x, y: targetUnit.position.y }
        : this.nearestDaggerTo(aim);
    if (!anchor) return;

    let arrivalX = anchor.x;
    let arrivalY = anchor.y;

    // Clamp distance to max reach
    const finalSpan = Math.hypot(arrivalX - origin.x, arrivalY - origin.y);
    if (finalSpan > reach) {
      arrivalX = origin.x + ((arrivalX - origin.x) / finalSpan) * reach;
      arrivalY = origin.y + ((arrivalY - origin.y) / finalSpan) * reach;
    }

    if (!this.blinkOwnerTo(arrivalX, arrivalY)) return;

    // Afterimage & Arrival effects
    this.game.objectManager.addObject(
      new Katarina_E_Afterimage(this.owner, origin.x, origin.y, arrivalX, arrivalY)
    );
    this.game.objectManager.addObject(new Katarina_E_Arrival(this.owner, arrivalX, arrivalY));

    // If destination is near a dagger (or snapped dagger), consume & slash
    const daggerAtArrival: Katarina_Dagger | null =
      snappedDagger ?? Katarina_Dagger.snapTarget(this.owner, arrivalX, arrivalY);
    if (daggerAtArrival) {
      daggerAtArrival.consumeAndSlash();
    }

    // Single target strike if an enemy was targeted / is at arrival
    this.strike(arrivalX, arrivalY, targetUnit);
  }

  /** The dagger nearest the cursor, when the cursor named nothing at all. */
  private nearestDaggerTo(aim: { x: number; y: number }): { x: number; y: number } | null {
    let chosen: Katarina_Dagger | null = null;
    let closest = Infinity;
    for (const dagger of this.daggersInRange()) {
      const gap = Math.hypot(dagger.position.x - aim.x, dagger.position.y - aim.y);
      if (gap < closest) {
        closest = gap;
        chosen = dagger;
      }
    }
    return chosen ? { x: chosen.position.x, y: chosen.position.y } : null;
  }

  private strike(x: number, y: number, explicitTarget: AttackableUnit | null): void {
    let chosen: AttackableUnit | null =
      explicitTarget instanceof AttackableUnit ? explicitTarget : null;
    if (!chosen || chosen.teamId === this.owner.teamId || chosen.isDead || chosen.toRemove) {
      const candidates = this.game.objectManager.queryObjects({
        area: new Circle({ x, y, r: effectiveRange(KATARINA_E_STRIKE_RADIUS, this.owner) }),
        filters: [
          PredefinedFilters.type(AttackableUnit),
          PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId),
          PredefinedFilters.visibleTo(this.owner),
        ],
      }) as AttackableUnit[];

      let nearestDistance = Infinity;
      chosen = null;
      for (const candidate of candidates) {
        if (!(candidate instanceof AttackableUnit)) continue;
        const gap = Math.hypot(candidate.position.x - x, candidate.position.y - y);
        if (gap < nearestDistance) {
          nearestDistance = gap;
          chosen = candidate;
        }
      }
    }

    if (
      chosen &&
      chosen instanceof AttackableUnit &&
      typeof chosen.takeDamage === 'function' &&
      chosen.teamId !== this.owner.teamId
    ) {
      chosen.takeDamage(KATARINA_E_STRIKE_DAMAGE, this.owner, 'MAGIC');
      this.game.objectManager.addObject(
        new Katarina_Blade_Impact(this.owner, chosen.position.x, chosen.position.y, 42)
      );
    }
  }

  drawPreview(): void {
    super.drawPreview(effectiveRange(this.range, this.owner));
  }
}


/** The red silhouette left behind, stretched along the teleport trajectory. */
export class Katarina_E_Afterimage extends SpellObject {
  lifeTime = 320;
  age = 0;
  toX: number;
  toY: number;

  constructor(owner: AttackableUnit, x: number, y: number, toX: number, toY: number) {
    super(owner);
    this.position = createVector(x, y);
    this.toX = toX;
    this.toY = toY;
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    const fade = 1 - t;
    const dx = this.toX - this.position.x;
    const dy = this.toY - this.position.y;
    const length = Math.hypot(dx, dy) || 1;
    const stretch = 26 + 22 * t;

    push();
    noStroke();
    fill(KATARINA_BLOOD[0], KATARINA_BLOOD[1], KATARINA_BLOOD[2], 160 * fade);
    ellipse(this.position.x, this.position.y, 30 * fade + 8, stretch * fade + 8);
    stroke(KATARINA_BLOOD[0], KATARINA_BLOOD[1], KATARINA_BLOOD[2], 140 * fade);
    strokeWeight(3 * fade + 1);
    const drawn = Math.min(length, 120) * (1 - t * 0.4);
    line(
      this.position.x,
      this.position.y,
      this.position.x + (dx / length) * drawn,
      this.position.y + (dy / length) * drawn
    );
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox((120 + 30) * 2);
  }
}


/**
 * Arrival flash. Steel blades collapse inward onto Katarina.
 */
export class Katarina_E_Arrival extends SpellObject {
  lifeTime = 320;
  age = 0;
  blades: number[] = [];

  constructor(owner: AttackableUnit, x: number, y: number) {
    super(owner);
    this.position = createVector(x, y);
    for (let i = 0; i < 8; i++) this.blades.push(random(0, TWO_PI));
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    const closing = 1 - (1 - t) * (1 - t);
    const fade = 1 - t;

    push();
    stroke(KATARINA_STEEL[0], KATARINA_STEEL[1], KATARINA_STEEL[2], 230 * fade);
    strokeWeight(2.5);
    noFill();
    for (const angle of this.blades) {
      const outer = 70 * (1 - closing) + 16;
      const inner = outer - 18;
      line(
        this.position.x + cos(angle) * outer,
        this.position.y + sin(angle) * outer,
        this.position.x + cos(angle) * inner,
        this.position.y + sin(angle) * inner
      );
    }
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(120);
  }
}