import type {
  AttackableUnit,
  CastContext,
  CastSpec,
  ExecuteFallback,
  ExecuteSpell,
  TargetingRequest,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import { secs } from '../text';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const AttackableUnitClass = api.units.AttackableUnit;
const Circle = api.utils.Quadtree.Circle;
const Rectangle = api.utils.Quadtree.Rectangle;
const PredefinedFilters = api.combat.PredefinedFilters;
const TargetResolver = api.combat.TargetResolver;
const canSee = api.combat.Vision.canSee;
const effectiveRange = api.combat.Reach.effectiveRange;
const Untargetable = api.buffs.Untargetable;
const effectiveHealth = api.combat.ExecuteTargeting.effectiveHealth;
const pickExecuteTarget = api.combat.ExecuteTargeting.pickExecuteTarget;
const dmg = api.text.dmg;
const tint = api.text.tint;

/**
 * Below this much effective health — the bar plus every shield standing in
 * front of it — the blow simply kills. It is not "a lot of damage": there is no
 * amount of armour, no heal on the way, and no last point left over.
 */
export const EXECUTE_THRESHOLD = 32;

/** What everyone above the threshold gets instead. Ordinary, and it is meant to be. */
export const STRIKE_DAMAGE = 30;

/** The X sits on the ground this long before anything comes out of it. */
export const WINDUP_MS = 350;

export const R_RANGE = 420;

/** How far from the X a body can wander and still be caught by it. */
export const STRIKE_RADIUS = 120;

export const R_COOLDOWN_MS = 10_000;

export const R_MANA_COST = 60;

const LABEL = 'Tử Thần Đáy Sâu';

/** Alive, on the field, and something a blade can reach. */
export const isStrikeTarget = (candidate: unknown): candidate is AttackableUnit =>
  candidate instanceof AttackableUnitClass &&
  candidate.targetable &&
  !candidate.toRemove &&
  !candidate.isDead;

/**
 * Death from Below — the champion, in one button.
 *
 * The whole ability is the threshold. Above it this is a mediocre nuke; below
 * it there is no calculation to do, because the answer is always "they die".
 * That promise is only worth anything if the player can *see* it before
 * pressing, which is what implementing core's `ExecuteSpell` buys: the same two
 * methods feed `ExecuteMarks`' ring on screen and `pickExecuteTarget`'s choice
 * of body, so the mark can never promise a kill the cast does not deliver.
 *
 * And a kill hands the button straight back. A fed Pyke chaining three of these
 * across a teamfight is the fantasy, and it is in the record — the cooldown
 * refund, not the shared-gold payout, which is the passive and is not shipped
 * here.
 */
export default class Pyke_R extends Spell implements ExecuteSpell {
  image = api.asset('spell_pyke_r');
  name = 'Tử Thần Đáy Sâu (Pyke_R)';
  description =
    `Pyke đánh dấu chỗ đứng của mục tiêu bằng một chữ X, rồi sau <span class="time">${secs(WINDUP_MS)} giây</span> đâm lên từ dưới đất.` +
    ` Kẻ địch còn dưới <span class="buff">${EXECUTE_THRESHOLD} máu hiệu dụng</span> (tính cả khiên) bị` +
    ` ${tint('hành quyết ngay lập tức')}; số còn lại chỉ nhận` +
    ` ${dmg(STRIKE_DAMAGE, 'MAGIC')}.` +
    ` Trong lúc chờ, Pyke <span class="buff">lặn xuống đất và không thể bị chọn làm mục tiêu</span>,` +
    ` rồi <span class="buff">trồi lên ngay tại chỗ đánh dấu</span>.` +
    ` Nếu nhát đâm kết liễu mục tiêu, chiêu cuối <span class="buff">hồi ngay lập tức</span>`;
  coolDown = R_COOLDOWN_MS;
  manaCost = R_MANA_COST;

  range = R_RANGE;

  /** With nobody killable in range, the lowest bar is still the right pick. */
  readonly executeFallback: ExecuteFallback = 'weakest';

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'PRESS',
      targeting: 'UNIT',
      castTimeMs: 0,
      resource: { commitAt: 'release', refundOn: ['TARGET_INVALID', 'OUT_OF_RANGE'] },
      cooldown: { startAt: 'release', durationMs: this.coolDown },
    };
  }

  /**
   * `targetTeam: 'ENEMY'` is load-bearing, not decoration. `TargetResolver`
   * defaults it to `'ANY'`, whose candidate list includes the caster — so with
   * the cursor over open ground the nearest-body fallback resolves *Pyke*, and
   * the ultimate executes its own owner. Four abilities shipped in this pack
   * exactly that way.
   */
  get targetingRequest(): Readonly<TargetingRequest> {
    return {
      range: this.range,
      targetTeam: 'ENEMY',
      queryCandidates: () => this.game.objectManager.objects,
      isTargetable: candidate => isStrikeTarget(candidate),
      getTargetInfo: candidate =>
        isStrikeTarget(candidate)
          ? {
              position: candidate.position,
              teamId: candidate.teamId,
              selectionRadius: candidate.animatedValues?.displaySize
                ? candidate.animatedValues.displaySize / 2
                : candidate.collisionRadius,
            }
          : null,
      // Pointing roughly at a fight should take the one who dies to it, not the
      // one who happens to be nearest the cursor. Same answer the ring on
      // screen is already painting.
      pickWithoutAim: (candidates, nearestToCursor) => {
        const doomed = pickExecuteTarget(this);
        return doomed && candidates.includes(doomed) ? doomed : nearestToCursor;
      },
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

  executeCandidates(): AttackableUnit[] {
    return this.game.objectManager.queryObjects({
      area: new Circle({
        x: this.owner.position.x,
        y: this.owner.position.y,
        r: effectiveRange(this.range, this.owner),
      }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
  }

  /**
   * The real formula, not an estimate — the strike below computes the same two
   * numbers. Under the threshold the blow is worth exactly the pool it has to
   * clear (rounded up, because `takeDamage` rounds before it compares), so
   * `isLethal` answers true for precisely the bodies the cast actually kills.
   */
  executeDamageAgainst(target: AttackableUnit): number {
    const pool = effectiveHealth(target);
    if (pool >= EXECUTE_THRESHOLD) return STRIKE_DAMAGE;
    return Math.max(STRIKE_DAMAGE, Math.max(1, Math.ceil(pool)));
  }

  onSpellCast(context: CastContext): void {
    const target = context.target;
    if (!isStrikeTarget(target)) return;

    // He goes under, and while he is under nothing can touch him. This is the
    // half of Death From Below that was missing: the ability read as a delayed
    // ranged nuke, with Pyke standing exactly where he was, in the open, for
    // the whole 350ms he is supposed to be gone. The untargetable window is
    // what makes the ultimate an escape as well as an execution, and it is why
    // pressing it into a losing fight is a decision rather than a mistake.
    const submerged = new Untargetable(WINDUP_MS, this.owner, this.owner);
    submerged.image = this.image;
    submerged.stackId = 'pyke_r_submerged';
    this.owner.addBuff(submerged);

    const dive = new Pyke_R_Dive(this.owner);
    dive.from = this.owner.position.copy();
    dive.to = target.position.copy();
    this.game.objectManager.addObject(dive);

    const mark = new Pyke_R_Mark(this.owner);
    // The X is a place, not a leash: it is stamped where the target stands now
    // and stays there, so stepping out of it before the blade arrives is the
    // whole of the counterplay.
    mark.position = target.position.copy();
    mark.strike = () => this.strikeAt(target, mark.position);
    this.game.objectManager.addObject(mark);
  }

  /** The blade comes up. Everything the ultimate decides, it decides here. */
  private strikeAt(target: AttackableUnit, at: p5.Vector): void {
    // He comes up where the X is, not where he went down. The blade was always
    // drawn erupting out of the mark; Pyke standing 400px away watching it
    // happen was the part that never made sense.
    //
    // `blinkOwnerTo` and not a bare `position.set`: it is the one mover that
    // answers to terrain and to the things that are allowed to stop a blink,
    // which a written coordinate is not.
    this.blinkOwnerTo(at.x, at.y);

    const blade = new Pyke_R_Strike(this.owner);
    blade.position = at.copy();
    this.game.objectManager.addObject(blade);

    if (target.isDead || target.toRemove) return;
    if (target.position.dist(at) > STRIKE_RADIUS) return;

    const pool = effectiveHealth(target);
    if (pool < EXECUTE_THRESHOLD) {
      blade.executed = true;
      // TRUE, and sized to the whole pool: an execution is not a big hit that
      // armour or a shield gets a say in.
      target.takeDamage(Math.max(1, Math.ceil(pool)), this.owner, 'TRUE', LABEL);
    } else {
      target.takeDamage(STRIKE_DAMAGE, this.owner, 'MAGIC', LABEL);
    }

    // Alive one line above the hit, so `isDead` here is this blow and nothing
    // else — `takeDamage` is synchronous, which is what makes that readable.
    if (!target.isDead) return;
    this.currentCooldown = 0;
  }

  private isValidTarget(target: unknown): target is AttackableUnit {
    return (
      isStrikeTarget(target) &&
      target !== this.owner &&
      target.teamId !== this.owner.teamId &&
      canSee(this.owner, target) &&
      this.owner.position.dist(target.position) <= effectiveRange(this.range, this.owner, target)
    );
  }
}

/**
 * The X scratched into the ground, and the clock.
 *
 * Ground art, so it paints under the feet of whoever is standing in it rather
 * than over them — a mark nobody can see themselves standing on is not a
 * warning. Two bone blades crossing, drawn from their ends inward as the
 * windup runs down, so the moment they meet is the moment the blow lands.
 */
export class Pyke_R_Mark extends SpellObject {
  zIndex = api.layers.GROUND_Z_INDEX;

  age = 0;
  struck = false;

  /** What to do when the blades meet. Set by the spell that stamped this. */
  strike: (() => void) | null = null;

  /** How long the scar stays after the blow, purely so it does not vanish mid-frame. */
  lingerMs = 220;

  update(): void {
    if (this.toRemove) return;
    this.age += deltaTime;

    if (!this.struck && this.age >= WINDUP_MS) {
      this.struck = true;
      this.strike?.();
    }
    if (this.age >= WINDUP_MS + this.lingerMs) this.toRemove = true;
  }

  draw(): void {
    const closing = constrain(this.age / WINDUP_MS, 0, 1);
    // wind-in: the two strokes accelerate toward each other
    const drawn = closing * closing;
    const after = this.struck
      ? constrain((this.age - WINDUP_MS) / this.lingerMs, 0, 1)
      : 0;
    const fade = 1 - after;
    const arm = STRIKE_RADIUS * 0.62;

    push();
    translate(this.position.x, this.position.y);

    // the ring the strike really covers, so the X is not lying about its size
    noFill();
    stroke(38, 92, 96, 110 * fade);
    strokeWeight(2);
    circle(0, 0, STRIKE_RADIUS * 2);

    // the two strokes of the X, growing inward from their far ends
    stroke(228, 214, 176, (150 + 90 * drawn) * fade);
    strokeWeight(6 * fade + 1);
    for (const lean of [1, -1]) {
      const ex = arm * lean;
      const ey = arm;
      line(ex, -ey, ex * (1 - drawn), -ey * (1 - drawn));
      line(-ex, ey, -ex * (1 - drawn), ey * (1 - drawn));
    }

    // a hot centre once they have met
    if (this.struck) {
      noStroke();
      fill(255, 236, 198, 180 * fade);
      circle(0, 0, 26 * fade + 6);
    }
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(STRIKE_RADIUS * 2 + 40);
  }
}

/**
 * What comes out of the X: a bone blade driven up through the ground from
 * below, and the ring of grave-water it throws off.
 *
 * White when it took the head, drowned teal when it did not — the same read
 * this pack's other execute uses, on deliberately different geometry (that one
 * falls from above, this one comes up from underneath).
 */
export class Pyke_R_Strike extends SpellObject {
  age = 0;
  lifeTime = 460;
  executed = false;
  height = 210;

  /** Grave-water thrown off the blade, seeded once so it does not flicker. */
  _spray: { angle: number; reach: number; size: number }[] = [];

  onAdded(): void {
    for (let i = 0; i < 14; i++) {
      this._spray.push({
        angle: random(0, TWO_PI),
        reach: random(0.5, 1.4),
        size: random(3, 9),
      });
    }
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    // snap out: the blade is already through the ground on the first frame
    const risen = 1 - (1 - t) * (1 - t);
    const fade = 1 - t;
    const [r, g, b] = this.executed ? [246, 240, 226] : [104, 196, 190];

    push();
    translate(this.position.x, this.position.y);

    // the ground opening
    noStroke();
    fill(12, 34, 38, 200 * fade);
    ellipse(0, 4, 74 * risen + 20, 26 * risen + 8);

    // the blade, driven upward out of the hole
    const reach = this.height * risen;
    stroke(r, g, b, 235 * fade);
    strokeWeight(11 * fade + 2);
    line(0, 0, 0, -reach);
    stroke(255, 255, 255, 150 * fade);
    strokeWeight(3);
    line(0, 0, 0, -reach);

    // the point
    noStroke();
    fill(r, g, b, 240 * fade);
    triangle(-13, -reach + 26, 13, -reach + 26, 0, -reach - 16);

    // grave-water thrown out along the ground
    for (const drop of this._spray) {
      const out = drop.reach * 74 * risen;
      fill(r, g, b, 200 * fade);
      circle(
        Math.cos(drop.angle) * out,
        Math.sin(drop.angle) * out * 0.45 - risen * 16,
        drop.size * fade + 1
      );
    }
    pop();
  }

  getDisplayBoundingBox() {
    const pad = this.height + 60;
    return new Rectangle({
      x: this.position.x - pad,
      y: this.position.y - pad,
      w: pad * 2,
      h: pad * 2,
      data: this,
    });
  }
}


/**
 * Pyke going under, and the water closing over him.
 *
 * The champion body itself keeps being drawn by the engine — a pack cannot
 * hide one — so this does the next best thing and makes the *ground* tell the
 * story: a spreading ring of dark water where he went down, and a rising
 * pressure ring where he is about to come up. Between them a low, fast wake
 * runs along the line he is travelling under, which is what stops the two
 * rings reading as two unrelated puddles.
 *
 * `Untargetable` draws its own halo around him for the same window, so the
 * "you cannot hit me" half is stated twice — once on his body by core, once on
 * the floor by this. That is deliberate: the body says it to the player who
 * owns him, the floor says it to everyone else, and a defensive window nobody
 * else can read is a defensive window that gets people killed.
 */
export class Pyke_R_Dive extends SpellObject {
  zIndex = api.layers.GROUND_Z_INDEX;

  from: p5.Vector = createVector();
  to: p5.Vector = createVector();
  age = 0;
  lifeTime = WINDUP_MS;

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    const fade = 1 - t;

    push();

    // where he went down: a ring spreading and dimming, like something heavy
    // entering water
    noFill();
    stroke(58, 96, 108, 200 * fade);
    strokeWeight(3 * fade + 1);
    circle(this.from.x, this.from.y, 30 + 90 * t);
    stroke(150, 220, 230, 150 * fade * fade);
    strokeWeight(2);
    circle(this.from.x, this.from.y, 14 + 60 * t);

    // the wake: a short dark streak travelling the line, so the two ends read
    // as one journey rather than two effects
    const head = constrain(t * 1.15, 0, 1);
    const tail = Math.max(0, head - 0.32);
    stroke(42, 78, 92, 190 * (1 - Math.abs(0.5 - t) * 1.2));
    strokeWeight(9);
    line(
      this.from.x + (this.to.x - this.from.x) * tail,
      this.from.y + (this.to.y - this.from.y) * tail,
      this.from.x + (this.to.x - this.from.x) * head,
      this.from.y + (this.to.y - this.from.y) * head
    );

    // where he is coming up: pressure building, tightening as the clock runs out
    const swell = 1 - (1 - t) * (1 - t);
    stroke(160, 235, 245, 90 + 150 * swell);
    strokeWeight(2 + 3 * swell);
    circle(this.to.x, this.to.y, 96 * (1 - swell) + 22);
    pop();
  }

  getDisplayBoundingBox() {
    // Both ends and the line between them, so the wake is not culled when the
    // camera holds only the far half of the dive.
    this.position.set((this.from.x + this.to.x) / 2, (this.from.y + this.to.y) / 2);
    const span = Math.hypot(this.to.x - this.from.x, this.to.y - this.from.y);
    return this.squareDisplayBoundingBox(span + 200);
  }
}
