import type {
  AttackableUnit,
  CastContext,
  CastSpec,
  TargetingRequest,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const withinRange = api.combat.Reach.withinRange;
const effectiveRange = api.combat.Reach.effectiveRange;
const TargetResolver = api.combat.TargetResolver;
const canSee = api.combat.Vision.canSee;
const StatAmp = api.buffs.StatAmp;
const AttackableUnit = api.units.AttackableUnit;
const Rectangle = api.utils.Quadtree.Rectangle;
const SpellObject = api.SpellObject;


export const R_RANGE = 380;

export const R_DAMAGE = 46;

/** "healing himself for the same amount" — the record's own words, kept literal. */
export const R_HEAL = R_DAMAGE;

/**
 * The real ability ramps this from 20% to 40% over its drain window. Rescaled
 * to one flat share taken up front: this pack's numbers land in one hit
 * (`R_DAMAGE`/`R_HEAL` above are single instants, not a DoT/HoT), so a
 * resistance steal that only *finished* ramping four seconds later would be
 * paying out on a clock nothing else in the cast is still running.
 */
export const R_RESIST_STEAL_PERCENT = 0.35;

/** How long both the debuff and its mirrored buff on Trundle last. */
export const R_DURATION_MS = 5_000;

/** Trundle swells while he is holding someone's stolen resistances. */
export const R_SIZE_GROWTH = 0.12;

/** The target shrinks by roughly two thirds as much, matching the record's ratio. */
export const R_SIZE_SHRINK = 0.08;


/**
 * Subjugate. The reason this champion is in the pack at all: nothing else here
 * moves a resistance stat *off* one unit and *onto* another in the same cast.
 * Every existing shred (`Vi_W`, `Nasus_E`, ...) only ever subtracts — the
 * number it removes goes nowhere. This one has to balance.
 *
 * The two sides use different slots on purpose:
 *
 * - The victim's reduction is `percentBonus` — the outer multiplier in
 *   `((base + baseBonus) * (1 + percentBaseBonus) + flatBonus) * (1 + percentBonus)`
 *   — so it shreds a share of *everything* they are holding: base kit
 *   resistance, levels, and every point of armour or magic resist they
 *   bought. Writing it as `percentBaseBonus` instead was a real bug once in
 *   this pack (`Vi_W`'s header tells that story): that slot only ever sees
 *   `base + baseBonus`, so a reduction living there quietly ignores every
 *   item the target owns and the tooltip's percentage stops being true the
 *   moment they go to the shop.
 * - Trundle's gain is a `flatBonus` — a plain number, snapshotted once at
 *   cast from the target's *actual* current armour and magic resist
 *   (`stats.armor.value` / `stats.magicResist.value`), multiplied by the same
 *   `R_RESIST_STEAL_PERCENT`. That is what makes "the same amount" in the
 *   record's own text literally true at the instant the cast lands.
 *
 * Those two facts do not stay reconciled for the *whole* duration, and that is
 * a real, deliberate simplification worth stating plainly: the victim's
 * `percentBonus` keeps tracking their armour live, so if they buy another
 * armour item mid-drain the debuff starts eating a bigger number than the one
 * Trundle is holding, and if a separate shred drops their armour further, the
 * debuff's own percentage stacks on top of an already-reduced value. Trundle's
 * side never re-snapshots, so past the moment of cast the two numbers are only
 * guaranteed equal *at cast*, not for the rest of the buff's life. Re-reading
 * the target's stats every tick and rebuilding both `StatAmp`s would keep them
 * pinned together, at the cost of turning the two buffs from set-and-forget
 * timers into something the object manager has to poll — v2 work, not this one.
 */
export default class Trundle_R extends Spell {
  image = api.asset('spell_trundle_r');
  name = 'Chinh Phục (Trundle_R)';
  description =
    `Rút sinh lực của một tướng địch, gây <span class="damage magic">${R_DAMAGE} sát thương phép</span>` +
    ` và hồi lại cho bản thân đúng bằng lượng đó. Cướp` +
    ` <span class="buff">${pct(R_RESIST_STEAL_PERCENT)}% giáp và kháng phép hiện tại</span> của mục tiêu` +
    ` và nhận đúng lượng đã cướp cho bản thân trong <span class="time">${secs(R_DURATION_MS)} giây</span>.`;
  coolDown = 10_000;
  manaCost = 100;

  range = R_RANGE;

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
      // The one rule with a body count behind it in this pack: omit
      // `targetTeam` and resolution defaults to 'ANY', which includes Trundle
      // himself — an empty-ground cast would then resolve *him* as the
      // nearest valid target and Subjugate would drain its own caster.
      targetTeam: 'ENEMY',
      queryCandidates: () => this.game.objectManager.objects,
      isTargetable: candidate => isDrainTarget(candidate),
      getTargetInfo: candidate =>
        isDrainTarget(candidate)
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
    const target = context.target;
    if (!isDrainTarget(target)) return;

    // Snapshotted once, right here — everything both `StatAmp`s below are
    // built from, and the reason the header above can promise "equal at
    // cast" instead of merely "equal on average".
    const stolenArmor = Math.max(0, target.stats.armor.value) * R_RESIST_STEAL_PERCENT;
    const stolenMagicResist = Math.max(0, target.stats.magicResist.value) * R_RESIST_STEAL_PERCENT;

    target.takeDamage(R_DAMAGE, this.owner, 'MAGIC', 'Chinh Phục');
    this.owner.takeHeal(R_HEAL, this.owner);

    const gain = new Trundle_R_Buff(R_DURATION_MS, this.owner, this.owner);
    gain.image = this.image;
    gain.bonuses = {
      armor: { flatBonus: stolenArmor },
      magicResist: { flatBonus: stolenMagicResist },
      size: { percentBaseBonus: R_SIZE_GROWTH },
    };
    this.owner.addBuff(gain);

    if (!target.isDead) {
      const drain = new Trundle_R_Debuff(R_DURATION_MS, this.owner, target);
      drain.image = this.image;
      drain.bonuses = {
        armor: { percentBonus: -R_RESIST_STEAL_PERCENT },
        magicResist: { percentBonus: -R_RESIST_STEAL_PERCENT },
        size: { percentBaseBonus: -R_SIZE_SHRINK },
      };
      // "Trundle will lose the buff if the target loses the debuff" — the
      // record states this one-directional link and no other, so only the
      // victim's expiry (early cleanse included) reaches across to end
      // Trundle's side; Trundle losing his own buff early has no such rule.
      drain.addDeactivateListener(() => {
        if (!gain.toRemove) gain.deactivateBuff();
      });
      target.addBuff(drain);
    }

    const tether = new Trundle_R_Tether(this.owner, target);
    tether.lifeTime = R_DURATION_MS;
    this.game.objectManager.addObject(tether);
  }

  drawPreview(): void {
    super.drawPreview(effectiveRange(this.range, this.owner));
  }

  private isValidTarget(target: unknown): target is AttackableUnit {
    return (
      isDrainTarget(target) &&
      target.teamId !== this.owner.teamId &&
      canSee(this.owner, target) &&
      withinRange(this.range, this.owner, target)
    );
  }
}


export const isDrainTarget = (target: unknown): target is AttackableUnit =>
  target instanceof AttackableUnit && target.targetable && !target.toRemove && !target.isDead;


/**
 * Its own class rather than a bare `StatAmp`, purely so the buff bar reads
 * "Chinh Phục" instead of "Tăng Chỉ Số" twice — `Buff`'s constructor already
 * keys `stackId` off `new.target`, so a distinct subclass is a distinct
 * stacking identity for free, the same reason `ChoGath_R_Growth` does not
 * also hand-write a string one.
 */
export class Trundle_R_Buff extends StatAmp {
  name = 'Chinh Phục: Nhận Sức Mạnh';
}


export class Trundle_R_Debuff extends StatAmp {
  name = 'Chinh Phục: Bị Cướp Sức Mạnh';
}


/**
 * The visible half of the transfer: motes of stolen resistance pulled off the
 * victim and travelling *into* Trundle for as long as both buffs stand. The
 * direction is the whole point — a beam flowing the other way would tell the
 * player the opposite of what the cast just did (`docs/VFX_STANDARD.md`'s
 * "the motion has to agree with the effect").
 */
export class Trundle_R_Tether extends SpellObject {
  private victim: AttackableUnit;
  age = 0;
  lifeTime = R_DURATION_MS;

  /** Where each mote sits along the tether, seeded once so the flow does not re-roll. */
  private _offsets: number[] = [];

  constructor(owner: AttackableUnit, victim: AttackableUnit) {
    super(owner);
    this.victim = victim;
    this.position = victim.position.copy();
  }

  onAdded(): void {
    for (let i = 0; i < 8; i++) this._offsets.push(random(0, 1));
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime || this.owner.isDead || this.victim.isDead) {
      this.toRemove = true;
      return;
    }
    this.position.set(this.victim.position.x, this.victim.position.y);
  }

  draw(): void {
    const t = this.age / this.lifeTime;
    const grow = Math.min(1, this.age / 220);
    const fade = t > 0.85 ? (1 - t) / 0.15 : 1;
    const ax = this.victim.position.x;
    const ay = this.victim.position.y;
    const bx = this.owner.position.x;
    const by = this.owner.position.y;
    const dx = bx - ax;
    const dy = by - ay;
    const nx = -dy;
    const ny = dx;
    const bow = 0.08 * sin(this.age / 500);

    push();
    // Sickly troll-magic green rather than this kit's ice-blue: the wall and
    // the field already own that hue, and a drain reads as *life leaving a
    // body*, which this pack's cool-magic vocabulary already reserves greens
    // and violets for over amber/physical.
    noFill();
    stroke(70, 40, 60, 120 * fade * grow);
    strokeWeight(7);
    this._ribbon(ax, ay, bx, by, nx, ny, bow, grow);
    stroke(140, 235, 150, 200 * fade * grow);
    strokeWeight(2.5);
    this._ribbon(ax, ay, bx, by, nx, ny, bow, grow);

    // motes travelling from the victim toward Trundle
    noStroke();
    for (const offset of this._offsets) {
      const u = (offset + (this.age / 900) * grow) % 1;
      const curve = 4 * u * (1 - u);
      const x = ax + dx * u + nx * bow * curve;
      const y = ay + dy * u + ny * bow * curve;
      fill(210, 255, 200, 220 * fade * grow);
      circle(x, y, 7 - u * 2.5);
      fill(90, 200, 110, 140 * fade * grow);
      circle(x, y, 14 - u * 4);
    }

    // the drain point on the victim, so the hit reads on the body it landed on
    noFill();
    stroke(120, 220, 140, 200 * fade * grow);
    strokeWeight(3);
    const victimSize = this.victim.animatedValues?.displaySize ?? 40;
    circle(ax, ay, victimSize * 0.6 + 10);
    pop();
  }

  private _ribbon(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    nx: number,
    ny: number,
    bow: number,
    grow: number
  ): void {
    const reach = grow;
    beginShape();
    for (let i = 0; i <= 10; i++) {
      const u = (i / 10) * reach;
      const curve = 4 * u * (1 - u);
      vertex(ax + (bx - ax) * u + nx * bow * curve, ay + (by - ay) * u + ny * bow * curve);
    }
    endShape();
  }

  getDisplayBoundingBox() {
    const ax = this.victim.position.x;
    const ay = this.victim.position.y;
    const bx = this.owner.position.x;
    const by = this.owner.position.y;
    const pad = 60;
    return new Rectangle({
      x: Math.min(ax, bx) - pad,
      y: Math.min(ay, by) - pad,
      w: Math.abs(bx - ax) + pad * 2,
      h: Math.abs(by - ay) + pad * 2,
      data: this,
    });
  }
}
