import type { AttackableUnit, CancelReason, CastContext, CastSpec, Rectangle, Slow, Vec2 } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Monster = api.units.Monster;
const SpellForm = api.enums.SpellForm;
const BeamSpellObject = api.BeamSpellObject;
const Spell = api.Spell;
const Slow = api.buffs.Slow;
const CastBar = api.vfx.CastBar;
const unitCastBarAnchor = api.vfx.unitCastBarAnchor;
const ChargeRangeTelegraph = api.vfx.ChargeRangeTelegraph;
const VfxGroup = api.vfx.VfxGroup;
const AttackableUnit = api.units.AttackableUnit;
const MissileSpellObject = api.MissileSpellObject;
const TrailSystem = api.helpers.TrailSystem;
const SpellObject = api.SpellObject;
const dmg = api.text.dmg;


const HOLD_THRESHOLD_MS = 350;

const MAX_CHARGE_MS = 4_000;

const RANGE = 700;

const MIN_RANGE = 100;

const RANGE_CHARGE_MS = 1_500;

// The tap-cast is a melee stab: short, wide, and nothing like the thrown spear.
// Exported so tests assert the geometry is wired from these, not a copy of the
// numbers — retuning a value should not mean editing the suite.
export const THRUST_REACH = 210;

export const THRUST_WIDTH = 100;

export const THRUST_BACKSWING = 40;


type SpearTarget = AttackableUnit & {
  readonly unitType?: 'minion';
};


/**
 * What the spear is worth, and against whom.
 *
 * Exported one constant at a time rather than left inline, because the
 * description now quotes every one of them: a tooltip that said only "đâm
 * giáo" was the complaint that started this, and the cure for it is a
 * description built from the same numbers the arithmetic below uses. Retuning
 * one of these retunes the sentence.
 */
export const BASE_DAMAGE = 20;

export const MINION_MULTIPLIER = 0.7;

export const MONSTER_MULTIPLIER = 0.8;

/** Every body the spear pierces after the first. */
export const SUBSEQUENT_MULTIPLIER = 0.5;

/** Below this share of their maximum, the spear finishes the job. */
export const EXECUTE_THRESHOLD = 0.2;

export const EXECUTE_MULTIPLIER = 2;

/** How much winding up the throw costs him in footspeed. */
export const CHARGE_SLOW_PERCENT = 0.1;


export const damageMultiplier = (target: SpearTarget): number =>
  target instanceof Monster
    ? MONSTER_MULTIPLIER
    : target.unitType === 'minion'
      ? MINION_MULTIPLIER
      : 1;


export const spearDamage = (target: SpearTarget, subsequent: boolean): number => {
  const executeMultiplier =
    target.stats.health.value < target.stats.maxHealth.value * EXECUTE_THRESHOLD
      ? EXECUTE_MULTIPLIER
      : 1;
  return (
    BASE_DAMAGE *
    damageMultiplier(target) *
    executeMultiplier *
    (subsequent ? SUBSEQUENT_MULTIPLIER : 1)
  );
};


/**
 * Draws the spear pointing along +x in already-translated local coordinates.
 * Shared so the thrown spear and the melee thrust show the same weapon.
 */
const drawSpearBody = (half: number, blade: number): void => {
  // haft: dark wood with a bronze highlight along the top
  stroke(84, 52, 26, 245);
  strokeWeight(blade * 0.34);
  line(-half * 0.95, 0, half * 0.34, 0);
  stroke(206, 160, 92, 220);
  strokeWeight(blade * 0.1);
  line(-half * 0.95, -blade * 0.09, half * 0.34, -blade * 0.09);

  noStroke();
  fill(176, 132, 68, 235);
  ellipse(-half * 0.95, 0, blade * 0.36, blade * 0.7);

  // socket collar, kept slim so it does not read as a bead on the shaft
  fill(198, 150, 78, 240);
  quad(
    half * 0.28,
    -blade * 0.22,
    half * 0.4,
    -blade * 0.18,
    half * 0.4,
    blade * 0.18,
    half * 0.28,
    blade * 0.22
  );

  // narrow leaf blade, drawn over the collar so the point stays the far end
  fill(255, 248, 224, 250);
  beginShape();
  vertex(half, 0);
  bezierVertex(half * 0.72, -blade * 0.85, half * 0.52, -blade * 0.55, half * 0.38, 0);
  bezierVertex(half * 0.52, blade * 0.55, half * 0.72, blade * 0.85, half, 0);
  endShape(CLOSE);

  // mid-rib keeps the blade from reading as a flat blob at speed
  stroke(198, 146, 58, 190);
  strokeWeight(blade * 0.08);
  line(half * 0.44, 0, half * 0.93, 0);
};


export default class Pantheon_Q extends Spell {
  image = api.asset('spell_pantheon_q');
  /**
   * The thrown form's reach is full at `RANGE_CHARGE_MS`, against a
   * `MAX_CHARGE_MS` window that `releaseAtMax: false` turns into a cancel.
   * Everything after it is a spear that gets no longer and a bot that is not
   * looking at the fight.
   */
  static aiChargeReleaseAtMs = RANGE_CHARGE_MS;

  name = 'Ngọn Giáo Sao Băng (Pantheon_Q)';
  description =
    `<b>Thả sớm</b> (dưới <span class="time">${secs(HOLD_THRESHOLD_MS)} giây</span>): đâm một nhát giáo` +
    ` rộng <span>${THRUST_WIDTH}px</span>, xa <span>${THRUST_REACH}px</span> ngay trước mặt.` +
    ` <b>Giữ</b> để ném một ngọn giáo <span class="buff">xuyên qua mọi kẻ địch</span>:` +
    ` tầm ném lớn dần từ <span>${MIN_RANGE}px</span> lên <span>${RANGE}px</span> sau` +
    ` <span class="time">${secs(RANGE_CHARGE_MS)} giây</span> tích lực.` +
    ` Cả hai đều gây ${dmg(BASE_DAMAGE, 'PHYSICAL')}` +
    ` — <span class="buff">${pct(MINION_MULTIPLIER)}%</span> lên lính,` +
    ` <span class="buff">${pct(MONSTER_MULTIPLIER)}%</span> lên quái,` +
    ` <span class="buff">${pct(SUBSEQUENT_MULTIPLIER)}%</span> cho những mục tiêu bị xuyên tiếp theo —` +
    ` và <span class="buff">nhân đôi</span> lên kẻ địch còn dưới` +
    ` <span class="buff">${pct(EXECUTE_THRESHOLD)}% máu</span>.` +
    ` Trong lúc tích lực Pantheon <span class="buff">bị làm chậm ${pct(CHARGE_SLOW_PERCENT)}%</span>` +
    ` và mọi hiệu ứng khống chế đều huỷ cú ném.`;
  coolDown = 4_000;
  manaCost = 25;

  private chargeMs = 0;
  private chargeSlow?: Slow;
  private wasThrust = false;
  private castDirection: Vec2 = { x: 0, y: 0 };
  private aimContext?: CastContext;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'TAP_OR_HOLD',
      targeting: 'DIRECTION',
      charge: { maxDurationMs: MAX_CHARGE_MS, releaseAtMax: false },
      resource: { commitAt: 'start', refundOn: ['MAX_DURATION', 'DEATH', 'SILENCE', 'STUN'] },
      cooldown: { startAt: 'end', durationMs: this.coolDown },
      // Winding up the throw: Pantheon may reposition while he charges, but
      // every piece of crowd control takes the spear away.
      interrupts: SpellForm.AIMED,
      vfx: {
        castLoop: context =>
          new VfxGroup([
            new CastBar(
              context,
              () => this.chargeMs / MAX_CHARGE_MS,
              undefined,
              () => unitCastBarAnchor(this.owner)
            ),
            new ChargeRangeTelegraph(
              () => this.owner.position,
              () => this.castDirection,
              () => this.currentRange,
              () => this.chargeMs / RANGE_CHARGE_MS
            ),
          ]),
      },
    };
  }

  onCastStart(context: CastContext): void {
    this.chargeMs = 0;
    this.wasThrust = false;
    // Not `context.direction` raw: a press whose aim landed on Pantheon would
    // leave the telegraph pointing nowhere until the first `hold` corrected it.
    this.castDirection = this.firingDirection(context);
    this.aimContext = context;
    this.chargeSlow = new Slow(MAX_CHARGE_MS, this.owner, this.owner);
    this.chargeSlow.percent = CHARGE_SLOW_PERCENT;
    this.chargeSlow.stackId = 'pantheon_q_charge_slow';
    this.owner.addBuff(this.chargeSlow);
  }

  onChargeUpdate(_context: CastContext, elapsedMs: number): void {
    this.chargeMs = elapsedMs;
  }

  hold(context: CastContext): boolean {
    this.aimContext = context;
    this.castDirection = this.directionTo(context);
    return super.hold(context);
  }

  release(context: CastContext): boolean {
    this.aimContext = context;
    this.castDirection = this.directionTo(context);
    return super.release(context);
  }

  onUpdate(): void {
    if (this.state !== 'CHARGING') return;
    if (this.owner.isDead) this.cancel('DEATH');
    else if (!this.owner.canCast) this.cancel('SILENCE');
  }

  onRelease(context: CastContext): void {
    this.removeChargeSlow();
    const start = { x: this.owner.position.x, y: this.owner.position.y };
    const direction = this.directionTo(this.aimContext ?? context);
    if (this.chargeMs <= HOLD_THRESHOLD_MS) {
      this.createThrust(start, direction);
      this.wasThrust = true;
      return;
    }

    const spear = new Pantheon_Q_Spear(this.owner);
    spear.chargeRatio = Math.min(1, this.chargeMs / RANGE_CHARGE_MS);
    spear.destination = createVector(
      start.x + direction.x * this.currentRange,
      start.y + direction.y * this.currentRange
    );
    this.game.objectManager.addObject(spear);
  }

  onCancel(_context: CastContext, reason: CancelReason): void {
    this.removeChargeSlow();
    if (
      reason === 'MAX_DURATION' ||
      reason === 'DEATH' ||
      reason === 'SILENCE' ||
      reason === 'STUN'
    ) {
      this.changeResource(this.owner.stats.mana, -this.effectiveManaCost / 2);
    }
  }

  onComplete(_context: CastContext): void {
    if (this.wasThrust) this.currentCooldown = this.reducedCooldown(this.coolDown * 0.4);
  }

  private createThrust(start: Vec2, direction: Vec2): void {
    const beam = new BeamSpellObject(
      this.owner,
      {
        start: {
          x: start.x - direction.x * THRUST_BACKSWING,
          y: start.y - direction.y * THRUST_BACKSWING,
        },
        end: { x: start.x + direction.x * THRUST_REACH, y: start.y + direction.y * THRUST_REACH },
        width: THRUST_WIDTH,
      },
      {
        candidateFilter: target =>
          target instanceof AttackableUnit &&
          target.targetable &&
          !target.isDead &&
          target.teamId !== this.owner.teamId,
        onHit: target => target.takeDamage(spearDamage(target, false), this.owner, 'PHYSICAL'),
      }
    );
    this.game.objectManager.addObject(beam);

    // BeamSpellObject is hit detection only, and instant beams are removed the
    // frame they resolve — without this the tap-cast landed damage with no
    // visual at all.
    const thrust = new Pantheon_Q_Thrust(this.owner);
    thrust.aimDirection = direction;
    thrust.reach = THRUST_REACH;
    thrust.laneWidth = THRUST_WIDTH;
    this.game.objectManager.addObject(thrust);
  }

  private removeChargeSlow(): void {
    this.chargeSlow?.deactivateBuff();
    this.chargeSlow = undefined;
  }

  get currentRange(): number {
    return MIN_RANGE + (RANGE - MIN_RANGE) * Math.min(1, this.chargeMs / RANGE_CHARGE_MS);
  }

  /**
   * Live aim off the cursor, falling back to a direction that is never (0,0).
   *
   * The old fallback was `context.direction`, which is itself (0,0) whenever
   * the aim landed on Pantheon — a cursor on top of him, or a bot with no
   * cursor at all aiming at a `destination` parked on its own feet. That threw
   * a spear nowhere: a lane whose start equals its end hits nothing and draws
   * nothing. `firingDirection` resolves it off his own heading, which is the
   * rule `Game.facing()` states for the touch layer.
   */
  private directionTo(context: CastContext): Vec2 {
    const dx = context.cursorWorld.x - this.owner.position.x;
    const dy = context.cursorWorld.y - this.owner.position.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return this.firingDirection(context);
    return { x: dx / length, y: dy / length };
  }
}


export class Pantheon_Q_Spear extends MissileSpellObject {
  speed = 1_400 / 60;
  size = 32;
  visualWidth = 126;
  visualHeight = 42;
  maxHitCount = Infinity;
  /** 0..1 — how long the throw was wound up; drives glow and speed streaks. */
  chargeRatio = 0;

  trailSystem = new TrailSystem({
    trailColor: '#FD8A',
    trailSize: this.visualHeight * 0.4,
    trailLifeTime: 300,
  });

  draw(): void {
    const angle = Math.atan2(
      this.destination.y - this.position.y,
      this.destination.x - this.position.x
    );
    const half = this.visualWidth / 2;
    const blade = this.visualHeight * 0.4;
    const charge = this.chargeRatio;

    push();
    translate(this.position.x, this.position.y);
    rotate(angle);

    // Starlight burning along the haft, heavier the longer the throw was wound
    // up. It stops short of the tip: extended past the blade with round caps it
    // painted a gold blob in front of the point and blunted the spear.
    blendMode(ADD);
    strokeCap(SQUARE);
    noFill();
    stroke(255, 170, 70, 55 + 60 * charge);
    strokeWeight(10 + 12 * charge);
    line(-half * 1.05, 0, half * 0.3, 0);
    stroke(255, 236, 190, 90 + 70 * charge);
    strokeWeight(3.5 + 4 * charge);
    line(-half * 1.05, 0, half * 0.3, 0);

    // speed streaks trailing the haft, so a full charge reads as a hard throw
    if (charge > 0.05) {
      stroke(255, 220, 150, 90 * charge);
      strokeWeight(1.5);
      for (const offset of [-blade * 0.5, blade * 0.5]) {
        line(-half * (1.1 + 0.5 * charge), offset, -half * 0.5, offset * 0.45);
      }
    }
    blendMode(BLEND);
    strokeCap(ROUND);

    drawSpearBody(half, blade);

    pop();
  }

  onHit(enemy: AttackableUnit): void {
    enemy.takeDamage(spearDamage(enemy, this.hitTargets.length > 1), this.owner, 'PHYSICAL');
  }
}


/** The melee tap-cast: a spear lunge down the lane BeamSpellObject just hit. */
export class Pantheon_Q_Thrust extends SpellObject {
  position = this.owner.position.copy();
  aimDirection: Vec2 = { x: 1, y: 0 };
  reach = 560;
  laneWidth = 120;
  age = 0;
  lifeTime = 280;

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    const fade = 1 - t;
    // Punch out over the first third, then drift back: a thrust reads as a
    // stab, where a constant-length beam reads as a laser.
    const reach = t < 0.33 ? Math.pow(t / 0.33, 0.55) : 1 - ((t - 0.33) / 0.67) * 0.22;
    const tip = this.reach * reach;
    const halfLane = this.laneWidth / 2;
    const spearHalf = 63;
    const blade = 21;

    push();
    translate(this.position.x, this.position.y);
    rotate(Math.atan2(this.aimDirection.y, this.aimDirection.x));

    blendMode(ADD);
    strokeCap(SQUARE);

    // the lane that was actually hit, so the tap has readable range
    noStroke();
    fill(255, 186, 88, 40 * fade);
    quad(0, -halfLane * 0.4, tip, -halfLane, tip, halfLane, 0, halfLane * 0.4);

    // white-hot core along the lunge
    noFill();
    stroke(255, 208, 128, 150 * fade);
    strokeWeight(halfLane * 0.5 * fade + 3);
    line(0, 0, tip * 0.9, 0);
    stroke(255, 250, 226, 230 * fade);
    strokeWeight(halfLane * 0.16 * fade + 2);
    line(0, 0, tip, 0);

    // shock ring where the point lands
    stroke(255, 236, 190, 200 * fade);
    strokeWeight(3 * fade + 1);
    circle(tip, 0, halfLane * (0.5 + t * 1.6));
    blendMode(BLEND);
    strokeCap(ROUND);

    // the weapon itself, riding the leading edge
    push();
    translate(tip - spearHalf, 0);
    drawSpearBody(spearHalf, blade);
    pop();

    pop();
  }

  // the lunge reaches far past `position`, so the box must cover the whole lane
  getDisplayBoundingBox(): Rectangle {
    const pad = this.reach + this.laneWidth;
    return this.squareDisplayBoundingBox(pad * 2);
  }
}