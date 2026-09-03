import type {
  AttackableUnit,
  CancelReason,
  CastContext,
  CastSpec,
  Dash,
  Slow,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const MissileSpellObject = api.MissileSpellObject;
const DashBuff = api.buffs.Dash;
const SlowBuff = api.buffs.Slow;
const BuffAddType = api.enums.BuffAddType;
const SpellForm = api.enums.SpellForm;
const CastBar = api.vfx.CastBar;
const unitCastBarAnchor = api.vfx.unitCastBarAnchor;
const ChargeRangeTelegraph = api.vfx.ChargeRangeTelegraph;
const VfxGroup = api.vfx.VfxGroup;
const Rectangle = api.utils.Quadtree.Rectangle;
const AoePulse = api.AoePulse;
const dmg = api.text.dmg;

/** Physical, and small: Q is a hook first and a poke a long way second. */
export const Q_DAMAGE = 22;

export const Q_SLOW_PERCENT = 0.3;

export const Q_SLOW_MS = 1_000;

/** How far the harpoon flies at a full pull. */
export const HARPOON_RANGE = 420;

/** How far it flies on a tap — a stab, not a throw. */
export const MIN_HARPOON_RANGE = 150;

/** How long the pull takes to reach its full length. */
export const RANGE_CHARGE_MS = 900;

/** The button gives up on its own after this, and refunds half the mana. */
export const MAX_CHARGE_MS = 2_500;

/** What holding the pose costs him in footspeed while he lines it up. */
export const CHARGE_SLOW_PERCENT = 0.15;

export const Q_CHARGE_SLOW_STACK_ID = 'pyke_q_charge_slow';

/** How long the body takes to arrive. Long enough to watch, short enough to trust. */
export const PULL_DURATION_MS = 300;

/**
 * The pull is spent in frames, because `Dash` steps once per frame — so the
 * duration above has to be converted at the rate the engine actually runs.
 * Exported so the test can state "230px of travel over the pull" rather than
 * re-deriving a speed nobody would recognise.
 */
export const PULL_FRAMES = Math.round(PULL_DURATION_MS / (1_000 / 60));

/** Where the victim ends up: inside a melee swing, not inside Pyke's body. */
export const PULL_STOP_DISTANCE = 70;

export const Q_COOLDOWN_MS = 8_000;

export const Q_MANA_COST = 30;

/** Its own slot, so nothing else's slow can evict this one or be evicted by it. */
export const Q_SLOW_STACK_ID = 'pyke_q_skewer_slow';

/** The player-facing half of the name — what the death recap groups by. */
const LABEL = 'Đâm Thấu Xương';

/**
 * Bone Skewer.
 *
 * The wiki's version is a charge: tap for a short stab, hold for the long
 * harpoon. It shipped as the full-reach throw and nothing else, because "charge
 * activations are a whole separate cast-spec shape and only one spell in this
 * pack uses one" — which was true when it was written and has not been for a
 * while. Pantheon Q and Varus Q both charge now, and the shape they share is
 * what this borrows: `HOLD_RELEASE`, a `ChargeRangeTelegraph` growing along the
 * aim line, a `CastBar` over his head, and a slow he wears for holding the pose.
 *
 * Getting the range back is the point. A hook that is always 420 long is a
 * yes-or-no question asked at maximum distance; one that grows while you hold
 * it is a decision about whether the extra 270px is worth standing still for,
 * with the answer painted on the ground for the person you are aiming at.
 */
export default class Pyke_Q extends Spell {
  image = api.asset('spell_pyke_q');
  /**
   * Reach is the only thing this charge buys — the damage is flat — and it is
   * bought in full by `RANGE_CHARGE_MS`, well inside a `MAX_CHARGE_MS` window
   * that ends in a cancel rather than a throw.
   */
  static aiChargeReleaseAtMs = RANGE_CHARGE_MS;

  name = 'Đâm Thấu Xương (Pyke_Q)';
  description =
    `<b>Giữ để rút dây</b>: tầm phóng lớn dần từ <span>${MIN_HARPOON_RANGE}px</span> lên` +
    ` <span>${HARPOON_RANGE}px</span> sau <span class="time">${secs(RANGE_CHARGE_MS)} giây</span>,` +
    ` trong lúc đó Pyke <span class="buff">tự làm chậm ${pct(CHARGE_SLOW_PERCENT)}%</span>.` +
    ` Thả ra để phóng lao xương. Kẻ địch <span class="buff">đầu tiên</span> trúng lao nhận` +
    ` ${dmg(Q_DAMAGE, 'PHYSICAL')}, bị <span class="buff">Làm Chậm ${pct(Q_SLOW_PERCENT)}%</span> trong <span class="time">${secs(Q_SLOW_MS)} giây</span> và bị` +
    ` <span class="buff">kéo về phía Pyke</span> trong <span class="time">${secs(PULL_DURATION_MS)} giây</span>, dừng lại ngay trong tầm đánh của hắn`;
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_MANA_COST;

  range = HARPOON_RANGE;

  private chargeMs = 0;
  private aimContext?: CastContext;
  private chargeSlow?: Slow;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'HOLD_RELEASE',
      targeting: 'DIRECTION',
      charge: { maxDurationMs: MAX_CHARGE_MS, releaseAtMax: false },
      resource: { commitAt: 'start', refundOn: ['MAX_DURATION', 'DEATH', 'SILENCE', 'STUN'] },
      cooldown: { startAt: 'end', durationMs: this.coolDown },
      // Winding the arm back: he keeps walking, but every piece of crowd
      // control takes the throw away.
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
              () => this.aimDirection,
              () => this.currentRange,
              () => this.chargeMs / RANGE_CHARGE_MS
            ),
          ]),
      },
    };
  }

  onCastStart(context: CastContext): void {
    this.chargeMs = 0;
    this.aimContext = context;
    const slow = new SlowBuff(MAX_CHARGE_MS, this.owner, this.owner);
    slow.percent = CHARGE_SLOW_PERCENT;
    slow.stackId = Q_CHARGE_SLOW_STACK_ID;
    this.chargeSlow = slow;
    this.owner.addBuff(slow);
  }

  onChargeUpdate(_context: CastContext, elapsedMs: number): void {
    this.chargeMs = elapsedMs;
  }

  hold(context: CastContext): boolean {
    this.aimContext = context;
    return super.hold(context);
  }

  release(context: CastContext): boolean {
    this.aimContext = context;
    return super.release(context);
  }

  onUpdate(): void {
    if (this.state !== 'CHARGING') return;
    if (this.owner.isDead) this.cancel('DEATH');
    else if (!this.owner.canCast) this.cancel('SILENCE');
  }

  onRelease(context: CastContext): void {
    this.removeChargeSlow();
    const aim = this.aimContext ?? context;
    const origin = this.owner.position;
    const direction = this.directionTo(aim, origin.x, origin.y);
    const reach = this.currentRange;

    const harpoon = new Pyke_Q_Harpoon(this.owner);
    harpoon.destination = createVector(
      origin.x + direction.x * reach,
      origin.y + direction.y * reach
    );
    harpoon.icon = this.image;
    this.game.objectManager.addObject(harpoon);
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

  /** How long the rope is right now — `MIN` at a tap, `HARPOON_RANGE` at a full pull. */
  get currentRange(): number {
    return (
      MIN_HARPOON_RANGE +
      (HARPOON_RANGE - MIN_HARPOON_RANGE) * Math.min(1, this.chargeMs / RANGE_CHARGE_MS)
    );
  }

  private get aimDirection(): { x: number; y: number } {
    const aim = this.aimContext;
    return aim ? this.directionTo(aim, this.owner.position.x, this.owner.position.y) : { x: 0, y: 0 };
  }

  /**
   * Live aim off the cursor, falling back to a heading that is never (0,0) —
   * the same trap Varus Q documents: a cursor resting on Pyke himself makes
   * `context.direction` the zero vector, and a harpoon thrown at its own origin
   * is a throw that never happened.
   */
  private directionTo(context: CastContext, x: number, y: number): { x: number; y: number } {
    const dx = context.cursorWorld.x - x;
    const dy = context.cursorWorld.y - y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return this.firingDirection(context);
    return { x: dx / length, y: dy / length };
  }

  private removeChargeSlow(): void {
    this.chargeSlow?.deactivateBuff();
    this.chargeSlow = undefined;
  }

  drawPreview(): void {
    super.drawPreview(this.currentRange);
  }
}

/**
 * Where a body being hauled in should come to rest: `PULL_STOP_DISTANCE` from
 * Pyke along the line it is already on. Shared by the hit (which sets the pull
 * up) and by every frame after it (which keeps the pull aimed at Pyke as he
 * walks), so the two can never disagree about where "in" is.
 */
const restingPointFor = (puller: AttackableUnit, victim: AttackableUnit): p5.Vector => {
  const outward = p5.Vector.sub(victim.position, puller.position);
  if (outward.mag() <= PULL_STOP_DISTANCE) return victim.position.copy();
  return p5.Vector.add(puller.position, outward.setMag(PULL_STOP_DISTANCE));
};

/**
 * The harpoon itself, and then the rope.
 *
 * It survives its own hit (`removeOnMaxHit = false`) for one reason, and it is
 * the VFX standard's fifth rule: the pull has to be *drawn* coming inward. A
 * spear that vanished on contact while the body slid toward Pyke reads as the
 * body being shoved by nothing. So on impact the spear turns around, its
 * destination becomes Pyke, and it reels home beside the victim at the same
 * speed they travel — one motion, two objects, no argument about direction.
 *
 * The `Dash` is the only thing that moves the victim. Writing `position`
 * directly would answer to nothing — not to a cleanse, not to a spell shield —
 * which is the bug this pack's other hook already paid for once.
 */
export class Pyke_Q_Harpoon extends MissileSpellObject {
  speed = 13;
  size = 30;

  /** One victim. The spear stops on the first thing it touches. */
  maxHitCount = 1;
  removeOnMaxHit = false;

  /** Pyke's own icon, for the buffs this thing applies. */
  icon: ReturnType<typeof api.asset> | null = null;

  victim: AttackableUnit | null = null;
  drag: Dash | null = null;

  /** Flips on impact; everything the draw does differently hangs off it. */
  reeling = false;

  /** Rope slack, seeded once so the chain does not boil frame to frame. */
  _slack: number[] = [];

  onAdded(): void {
    super.onAdded();
    for (let i = 0; i < 9; i++) this._slack.push(random(-1, 1));
  }

  onHit(enemy: AttackableUnit): void {
    enemy.takeDamage(Q_DAMAGE, this.owner, 'PHYSICAL', LABEL);

    const chill = new SlowBuff(Q_SLOW_MS, this.owner, enemy) as Slow;
    chill.percent = Q_SLOW_PERCENT;
    // Renewed, never stacked: two hooks landing back to back must read as one
    // 30% slow, not as 60%.
    chill.buffAddType = BuffAddType.RENEW_EXISTING;
    chill.stackId = Q_SLOW_STACK_ID;
    if (this.icon) chill.image = this.icon;
    enemy.addBuff(chill);

    const barb = new AoePulse(this.owner);
    barb.position = enemy.position.copy();
    barb.radius = 34;
    barb.lifeTime = 260;
    barb.color = [235, 214, 168];
    barb.fillAlpha = 30;
    this.game.objectManager.addObject(barb);

    this.reeling = true;
    // Inward, from this frame on — the rope, the spear and the body all travel
    // the same way.
    this.destination = this.owner.position;
    // And the spear stops dying on arrival, because it gets home *first* on a
    // close hook: the retract covers the whole distance while the body only
    // covers what is left over `PULL_STOP_DISTANCE`. Removing it there would
    // take `onRemoved` with it and cut the pull off partway. It now lives
    // exactly as long as the rope is taut — see `update`.
    this.removeOnArrive = false;

    const rest = restingPointFor(this.owner, enemy);
    const travel = enemy.position.dist(rest);
    if (travel <= 0) return;

    const haul = new DashBuff(PULL_DURATION_MS + 400, this.owner, enemy) as Dash;
    haul.showTrail = false;
    haul.cancelable = false;
    haul.dashSpeed = travel / PULL_FRAMES;
    haul.dashDestination = rest;
    if (this.icon) haul.image = this.icon;
    enemy.addBuff(haul);

    this.victim = enemy;
    this.drag = haul;
  }

  update(): void {
    super.update();
    if (!this.reeling) return;

    // The rope outlives the spear's own journey home and ends with the pull.
    if (!this.victim || !this.drag || this.drag.toRemove || this.victim.isDead) {
      this.toRemove = true;
      return;
    }

    // The pull tracks Pyke: he is free to keep walking while the rope is taut,
    // and the body should still arrive beside him rather than beside where he
    // used to be.
    this.drag.dashDestination = restingPointFor(this.owner, this.victim);
  }

  onRemoved(): void {
    this.drag?.deactivateBuff?.();
  }

  draw(): void {
    const anchor = this.owner.position;
    const dx = this.position.x - anchor.x;
    const dy = this.position.y - anchor.y;
    const heading = Math.atan2(dy, dx);
    const span = Math.hypot(dx, dy);

    push();

    // The rope. Slack on the way out, snapped straight and bright on the way
    // back — the single clearest read on "this one is caught".
    const sag = this.reeling ? 0 : 7;
    noFill();
    stroke(24, 58, 62, 200);
    strokeWeight(this.reeling ? 5 : 3);
    beginShape();
    for (let i = 0; i <= 8; i++) {
      const along = i / 8;
      const bow = Math.sin(along * PI) * sag * this._slack[i];
      vertex(anchor.x + dx * along - dy * (bow / (span || 1)), anchor.y + dy * along + dx * (bow / (span || 1)));
    }
    endShape();

    if (this.reeling) {
      // Barbs sliding down the rope toward Pyke: the motion states the pull.
      noStroke();
      for (let i = 0; i < 4; i++) {
        const along = ((frameCount / 22 + i * 0.25) % 1);
        const back = 1 - along;
        fill(178, 236, 226, 150 * back + 40);
        circle(anchor.x + dx * back, anchor.y + dy * back, 7);
      }
    }

    // The spear head. Point-first outbound, and turned around while reeling so
    // it comes home barb-first, the way a hook actually returns.
    push();
    translate(this.position.x, this.position.y);
    rotate(this.reeling ? heading : heading + PI);
    noStroke();
    fill(232, 224, 196);
    triangle(-18, 0, 9, -8, 9, 8);
    fill(196, 182, 148);
    triangle(-18, 0, 2, -4, 2, 4);
    // two barbs swept back from the point
    stroke(214, 204, 172);
    strokeWeight(3);
    line(-6, -3, 6, -11);
    line(-6, 3, 6, 11);
    pop();

    pop();
  }

  /** The rope spans from Pyke to the spear, so the box has to hold both ends. */
  getDisplayBoundingBox() {
    const pad = this.size;
    return new Rectangle({
      x: Math.min(this.position.x, this.owner.position.x) - pad,
      y: Math.min(this.position.y, this.owner.position.y) - pad,
      w: Math.abs(this.position.x - this.owner.position.x) + pad * 2,
      h: Math.abs(this.position.y - this.owner.position.y) + pad * 2,
      data: this,
    });
  }
}
