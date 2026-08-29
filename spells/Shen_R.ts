import type {
  AttackableUnit,
  CastContext,
  CastSpec,
  Champion,
  Rectangle,
  TargetingRequest,
} from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Shield = api.buffs.Shield;
const SpellObject = api.SpellObject;
const AoePulse = api.AoePulse;
const ChampionUnit = api.units.Champion;
const TargetResolver = api.combat.TargetResolver;
const canSee = api.combat.Vision.canSee;
const withinRange = api.combat.Reach.withinRange;
const SpellForm = api.enums.SpellForm;
const QuadtreeRectangle = api.utils.Quadtree.Rectangle;

/**
 * Nhất Thống — a true channel that ends somewhere else entirely.
 *
 * `SpellForm.CHANNELED` and nothing weaker: this is the one form that breaks on
 * the caster's own movement, which is the whole tension of the ability — Shen
 * commits to standing still for the better part of two seconds in order to be
 * somewhere he is not. `AIMED`/`HELD`/`TETHERED` all survive moving and would
 * turn a decision into a free reposition.
 *
 * Its range is stated as a number rather than left implicit because the
 * targeting layer needs one, but it is not a range in the sense the other three
 * spells have one: a rescue that cannot reach the lane in trouble is not a
 * rescue. Four thousand units is past the far corner of any board this pack
 * ships, which is the honest way to spell "anywhere" through an API that wants
 * a distance.
 *
 * `targetTeam: 'ALLY'` plus an explicit `press()` override is mandatory, not
 * stylistic: without the team the resolver defaults to `'ANY'`, and a cursor on
 * empty ground resolves *the caster* — which for this spell would be a free
 * self-shield with no travel, i.e. a different ability.
 */

export const SHIELD_ALLY = 55;

/** Smaller for Shen: he chose to be there, she did not. */
export const SHIELD_SELF = 35;

export const SHIELD_DURATION_MS = 3_500;

export const CHANNEL_DURATION_MS = 1_600;

export const COOLDOWN_MS = 10_000;

export const MANA_COST = 80;

/** Effectively global — past the far corner of any board in this pack. */
export const RESCUE_RANGE = 4_000;

/** Its own slot, so nothing else granting a `Shield` fights this for it. */
export const SHIELD_STACK_ID = 'shen_r_shield';

/** He lands beside her, not inside her. */
export const ARRIVAL_OFFSET = 44;

/**
 * The channel's own heartbeat. Nothing is paid out per tick — Stand United pays
 * once, at the end — but `ChannelSpec` wants an interval, and a short one keeps
 * the runtime's phase and the cast bar in step.
 */
const CHANNEL_TICK_MS = 200;


export default class Shen_R extends Spell {
  image = api.asset('spell_shen_r');
  name = 'Nhất Thống (Shen_R)';
  description =
    `Shen tụ khí trong <span class="buff">${CHANNEL_DURATION_MS / 1000} giây</span>, nhắm vào` +
    ` một tướng đồng minh <span class="buff">ở bất cứ đâu trên bản đồ</span>.` +
    ` Kênh xong, Shen dịch chuyển tới bên cạnh đồng minh; đồng minh nhận` +
    ` <span class="buff">${SHIELD_ALLY} lá chắn</span> và Shen nhận` +
    ` <span class="buff">${SHIELD_SELF} lá chắn</span> trong` +
    ` <span class="buff">${SHIELD_DURATION_MS / 1000} giây</span>.` +
    ` Di chuyển sẽ ngắt kênh, và không thể tự chọn chính mình — đây là chiêu đi cứu người.`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;

  range = RESCUE_RANGE;

  _tether: Shen_R_Tether | null = null;

  /**
   * No `vfx.channelLoop` cast bar, deliberately. `castSpec` is read once, on
   * the opening press, and frozen for the rest of the match — so the
   * `castspec-frozen` seam allows the getter to name only fields that cannot
   * change (`coolDown`, `owner`, `range`, …), and a progress closure reading a
   * per-cast `this._channelElapsedMs` is exactly what it forbids. The progress
   * lives on `Shen_R_Tether` instead, which is where a rescue's progress
   * belongs anyway: the enemy diving the ally needs to see the timer, and the
   * tether is drawn at *her* end as well as his.
   */
  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'PRESS',
      targeting: 'UNIT',
      channel: { durationMs: CHANNEL_DURATION_MS, tickEveryMs: CHANNEL_TICK_MS },
      interrupts: SpellForm.CHANNELED,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'end', durationMs: this.coolDown },
    };
  }

  get targetingRequest(): Readonly<TargetingRequest> {
    return {
      range: this.range,
      targetTeam: 'ALLY',
      queryCandidates: () => this.game.objectManager.objects,
      isTargetable: candidate => isRescueTarget(this.owner, candidate),
      getTargetInfo: candidate =>
        isRescueTarget(this.owner, candidate)
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
    if (this.state !== 'CHANNELING') return;
    // She died, walked into fog, or stopped being a legal target: the rescue
    // has nowhere to arrive, so it ends here rather than at the far end.
    if (!this.isValidTarget(this.castContext?.target)) this.cancel('TARGET_INVALID');
  }

  onSpellCast(context: CastContext): void {
    this.owner.stopMovement?.();

    const target = context.target;
    if (!isRescueTarget(this.owner, target)) return;

    this._tether = new Shen_R_Tether(this.owner, target, CHANNEL_DURATION_MS);
    this.game.objectManager.addObject(this._tether);
  }

  onCancel(): void {
    this.endChannel();
  }

  onComplete(context: CastContext): void {
    this.endChannel();

    const target = context.target;
    if (!isRescueTarget(this.owner, target)) return;

    // He arrives from the side he was standing on — beside her, along the line
    // he actually crossed.
    const dx = this.owner.position.x - target.position.x;
    const dy = this.owner.position.y - target.position.y;
    const span = Math.hypot(dx, dy);
    const landingX = target.position.x + (span > 0 ? dx / span : 1) * ARRIVAL_OFFSET;
    const landingY = target.position.y + (span > 0 ? dy / span : 0) * ARRIVAL_OFFSET;

    this.owner.position.set(landingX, landingY);
    // Otherwise he immediately walks back to wherever he was standing.
    this.owner.moveTo?.(landingX, landingY);

    grantGuard(this.owner, target, SHIELD_ALLY);
    grantGuard(this.owner, this.owner, SHIELD_SELF);

    const arrival = new AoePulse(this.owner);
    arrival.position = this.owner.position.copy();
    arrival.radius = 74;
    arrival.lifeTime = 400;
    arrival.color = [150, 195, 250];
    arrival.rings = 3;
    arrival.fillAlpha = 30;
    this.game.objectManager.addObject(arrival);
  }

  /** Idempotent: a clean finish, a cancel and a death all arrive here. */
  endChannel(): void {
    this._tether?.close();
    this._tether = null;
  }

  private isValidTarget(target: unknown): target is Champion {
    return (
      isRescueTarget(this.owner, target) &&
      canSee(this.owner, target) &&
      target.teamId === this.owner.teamId &&
      withinRange(this.range, this.owner, target)
    );
  }
}


/**
 * A living allied champion who is not Shen.
 *
 * `target !== owner` is the rule this predicate exists for: Stand United is a
 * rescue, and a Shen who can name himself has a second, better Ki Barrier on a
 * ten-second cooldown instead of a reason to look at the minimap.
 */
export const isRescueTarget = (owner: AttackableUnit, target: unknown): target is Champion =>
  target instanceof ChampionUnit &&
  target !== owner &&
  target.targetable &&
  !target.toRemove &&
  !target.isDead;

const grantGuard = (source: AttackableUnit, target: AttackableUnit, amount: number): void => {
  const guard = new Shield(SHIELD_DURATION_MS, source, target);
  guard.amount = amount;
  guard.stackId = SHIELD_STACK_ID;
  guard.color = [150, 195, 250];
  target.addBuff(guard);
};


/**
 * What the channel looks like from the outside: a gate drawn *at the ally*,
 * closing a little further every frame, fed by discrete motes leaving Shen.
 *
 * Anchored on her rather than on him, because the information the ability
 * actually carries is "help is coming *here*, in about a second" and the enemy
 * diving her is the one who has to read it. It carries the channel clock at
 * both ends — the gate at hers, a closing ring at his — which is the cast bar
 * this spell's `castSpec` is not allowed to build (see the getter's own note).
 * It spans two points, so the display box has to hold both, and it is a
 * `SpellObject` rather than art hung off either champion because either end can
 * be culled or fogged while the other is the one being watched.
 */
export class Shen_R_Tether extends SpellObject {
  target: AttackableUnit;
  age = 0;
  lifeTime: number;

  /** Where each mote starts along the line, seeded once so it cannot flicker. */
  _motes: number[] = [];

  constructor(owner: AttackableUnit, target: AttackableUnit, lifeTime: number) {
    super(owner);
    this.target = target;
    this.lifeTime = lifeTime;
    this.position = owner.position.copy();
  }

  close(): void {
    this.toRemove = true;
  }

  onAdded(): void {
    for (let i = 0; i < 7; i++) this._motes.push(i / 7);
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
    this.position.set(this.owner.position.x, this.owner.position.y);
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    const ax = this.owner.position.x;
    const ay = this.owner.position.y;
    const bx = this.target.position.x;
    const by = this.target.position.y;
    const gate = (this.target.animatedValues?.displaySize ?? 40) + 34 - 22 * t;

    push();
    // the motes, leaving him and arriving at her
    noStroke();
    for (const mote of this._motes) {
      const along = (mote + t * 1.6) % 1;
      const x = ax + (bx - ax) * along;
      const y = ay + (by - ay) * along;
      fill(175, 210, 255, 190 * (1 - along * 0.5));
      circle(x, y, 7 - along * 2.5);
    }

    // the gate closing around her: two arcs swinging shut as the channel runs
    noFill();
    stroke(160, 200, 250, 120 + 110 * t);
    strokeWeight(3);
    const sweep = 0.5 + 1.7 * t;
    arc(bx, by, gate, gate, -HALF_PI - sweep / 2, -HALF_PI + sweep / 2);
    arc(bx, by, gate, gate, HALF_PI - sweep / 2, HALF_PI + sweep / 2);

    // The channel's own clock, drawn under Shen's feet — this is the cast bar,
    // moved somewhere `castSpec` is allowed not to know about.
    stroke(150, 190, 250, 200);
    strokeWeight(2.5);
    arc(ax, ay, 46, 46, -HALF_PI, -HALF_PI + TWO_PI * t);
    pop();
  }

  getDisplayBoundingBox(): Rectangle {
    const ax = this.owner.position.x;
    const ay = this.owner.position.y;
    const bx = this.target.position.x;
    const by = this.target.position.y;
    const pad = 70;
    return new QuadtreeRectangle({
      x: Math.min(ax, bx) - pad,
      y: Math.min(ay, by) - pad,
      w: Math.abs(bx - ax) + pad * 2,
      h: Math.abs(by - ay) + pad * 2,
      data: this,
    });
  }
}
