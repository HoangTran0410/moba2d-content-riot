import type {
  AttackableUnit as AttackableUnitType,
  CastContext,
  CastSpec,
  TargetingRequest,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const StatAmp = api.buffs.StatAmp;
const SpellObject = api.SpellObject;
const TargetResolver = api.combat.TargetResolver;
const withinRange = api.combat.Reach.withinRange;
const effectiveRange = api.combat.Reach.effectiveRange;
const canSee = api.combat.Vision.canSee;
const AttackableUnit = api.units.AttackableUnit;
const heal = api.text.heal;

/**
 * Ơn Phước Mikael — the shop's answer to a chain of crowd control landing on
 * somebody who is not the person holding the item.
 *
 * ## Why it grants `healingReceived` rather than raw healing
 *
 * The heal is the small half. What Mikael's actually buys in the source game is
 * the *window*: the ally is out of the stun, and the healer standing behind
 * them now has three seconds in which everything they pour in lands harder.
 * Core has exactly that stat — `healingReceived`, the amplifier the heal cut is
 * the negative of — and until now one item in the whole shop granted it, as a
 * flat passive on Mặt Nạ Hắc Ám.
 *
 * Granting it as a **timed buff on somebody else** is the shape the stat was
 * missing: it composes multiplicatively with a Vết Thương Sâu on the same body
 * (`combat/Healing.ts` multiplies the boost and the cut, so the order they
 * arrive in cannot change the answer), which makes this a real counter-play
 * button against a wound rather than a strictly-worse one.
 *
 * ## Why it is an ally-targeted active and not an aura
 *
 * Vòng Sắt Mặt Trời already covers "and everyone standing with me". A second
 * item with the same shape would be the same decision at a different price.
 * This one asks *which ally*, which is the interesting question at the moment
 * a carry is being focused, and it is why the cleanse is single-target in the
 * source game too.
 */

export const HEAL = 25;

/** How much more every heal on them lands for, and for how long. */
export const HEALING_BOOST = 0.35;

export const BOOST_MS = 3_000;

export const RANGE = 420;

/** Down from 55s — see `Item_Ghostblade.ts`'s note on the practice room's 20s ceiling. */
export const COOLDOWN_MS = 14_000;

export const BOOST_STACK_ID = 'item_mikael_boost';

/** How long the ribbon between the two bodies stays up. Telegraph only. */
export const RIBBON_MS = 620;

/** Ionian white-gold: a blessing, so it reads warm and clean rather than bright. */
const BLESSING: [number, number, number] = [255, 238, 200];


export const isBlessingTarget = (target: unknown): target is AttackableUnitType =>
  target instanceof AttackableUnit && target.targetable && !target.toRemove && !target.isDead;


export default class Item_Mikael extends Spell {
  image = api.asset('item_mikaels_blessing');
  name = 'Ơn Phước Mikael (Item_Mikael)';
  description =
    `Kích hoạt: gỡ một hiệu ứng <span class="buff">khống chế</span> khỏi đồng minh và hồi` +
    ` ${heal(HEAL)} máu; trong <span class="time">${secs(BOOST_MS)} giây</span>` +
    ` sau đó mọi hiệu ứng hồi máu lên đồng minh đó mạnh hơn ${pct(HEALING_BOOST)}%`;
  coolDown = COOLDOWN_MS;
  manaCost = 0;

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
      // Without this, `TargetResolver` defaults to `'ANY'` — which includes
      // enemies, and a cleanse-and-heal pressed on the person stunning you is
      // the whole item working backwards.
      targetTeam: 'ALLY',
      queryCandidates: () => this.game.objectManager.objects,
      isTargetable: candidate => isBlessingTarget(candidate),
      getTargetInfo: candidate =>
        isBlessingTarget(candidate)
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
    if (!isBlessingTarget(target)) return;

    // Core's own cleanse: it walks the live buffs and drops every one enabling
    // a `CROWD_CONTROL_FLAGS` bit. Deliberately not written here — Khăn Giải
    // Thuật presses the same button on its own holder, and two cleanses that
    // disagreed about what counts as crowd control would be two items.
    target.cleanse?.();

    // The boost is added *before* the heal, so the item's own heal is the first
    // thing it amplifies — otherwise the button reads as weaker than it is at
    // exactly the moment a player is watching it.
    const boost = new StatAmp(BOOST_MS, this.owner, target);
    boost.name = 'Ơn Phước';
    boost.stackId = BOOST_STACK_ID;
    boost.image = this.image;
    boost.bonuses = { healingReceived: { baseBonus: HEALING_BOOST } };
    target.addBuff(boost);

    target.takeHeal(HEAL, this.owner);

    this.game.objectManager.addObject(new Item_Mikael_Ribbon(this.owner, target));
  }

  drawPreview(): void {
    super.drawPreview(effectiveRange(this.range, this.owner));
  }

  private isValidTarget(target: unknown): target is AttackableUnitType {
    return (
      isBlessingTarget(target) &&
      canSee(this.owner, target) &&
      target.teamId === this.owner.teamId &&
      withinRange(this.range, this.owner, target)
    );
  }
}


/**
 * The blessing crossing between the two bodies.
 *
 * A ribbon rather than a bloom on the target, because the item's whole cost is
 * that somebody *chose* this ally — a bloom says "someone was saved" and a
 * ribbon says "she saved him", which is the fact the rest of the team needs in
 * order to know the button is now on cooldown.
 */
export class Item_Mikael_Ribbon extends SpellObject {
  age = 0;
  target: AttackableUnitType;

  constructor(owner: AttackableUnitType, target: AttackableUnitType) {
    super(owner);
    this.target = target;
    this.position = owner.position.copy();
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= RIBBON_MS || this.target.toRemove) this.toRemove = true;
    this.position.set(this.owner.position.x, this.owner.position.y);
  }

  draw(): void {
    const t = constrain(this.age / RIBBON_MS, 0, 1);
    const fade = 1 - t * t;
    const [r, g, b] = BLESSING;
    const from = this.position;
    const to = this.target.position;

    push();
    // the thread, drawn as a shallow arc so it never reads as a laser
    noFill();
    stroke(r, g, b, 210 * fade);
    strokeWeight(3);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 - 34 * (1 - t);
    beginShape();
    vertex(from.x, from.y);
    quadraticVertex(midX, midY, to.x, to.y);
    endShape();

    // and the release: a ring that settles on the ally rather than on the presser
    const settle = 1 - (1 - t) * (1 - t);
    stroke(r, g, b, 190 * fade);
    strokeWeight(2.5);
    circle(to.x, to.y, 26 + 44 * settle);
    noStroke();
    fill(r, g, b, 60 * fade);
    circle(to.x, to.y, 20 + 30 * settle);
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox((RANGE + 80) * 2);
  }
}
