import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const SpellObject = api.SpellObject;

/**
 * Khăn Giải Thuật's active: everything anyone else did to you, off.
 *
 * `AttackableUnit.cleanse()` is core's and is the whole mechanic — it walks the
 * live buffs, drops every one that enables a `CROWD_CONTROL_FLAGS` bit, and
 * answers how many it took. Two rules live in there rather than here, and both
 * matter to how this reads in play:
 *
 *  - **Only what someone else did to you.** A buff whose `sourceUnit` is the
 *    wearer is left alone, so pressing this while your own Đồng Hồ Cát Zhonya
 *    has you in stasis does not cancel it. One item cancelling another is a
 *    bug with two buttons.
 *  - **A slow is not crowd control.** It is a stat modifier, not a status flag,
 *    and it stays. The description below says so rather than letting a player
 *    find out mid-fight.
 *
 * ## Why it declares `castableWhileControlled`
 *
 * Without it this item does nothing on the only occasion anybody buys one.
 * Every gate in `Spell` reads `owner.canCast`, and `Stats.updateActionState`
 * clears `CAN_CAST` for **Silenced, Charmed, Feared, Taunted, Stunned and
 * Suppressed** — six of the ten flags in `CROWD_CONTROL_FLAGS`. So the button
 * worked against a Root, a Disarm, a Ground or a Nearsight, and refused
 * against a stun.
 *
 * The flag is core's, narrow, and buys past crowd control and nothing else:
 * death, cooldown, mana and `checkCastCondition` all still apply. Overriding
 * `press()` to dodge the gate was the alternative and would have dodged the
 * cooldown and resource machinery with it.
 */

export const COOLDOWN_MS = 90_000;

/** How long the broken shackles take to fly clear and fade. */
export const BREAK_MS = 420;

/** Links flung off the body. Eight reads as "chains"; more reads as confetti. */
export const LINK_COUNT = 8;

/** How far a link travels from the body over its life. */
export const LINK_REACH = 62;

/** How far past the body the break paints, for the display box. */
export const BOUNDING_MARGIN = 40;

const MERCURY: [number, number, number] = [206, 226, 236];

const IRON: [number, number, number] = [64, 70, 78];

export default class Item_Quicksilver extends Spell {
  /**
   * The whole point of the item: it is a way *out* of crowd control, so it
   * must not be gated on being able to act. See the header.
   */
  castableWhileControlled = true;

  targetingMode = 'SELF' as const;
  image = api.asset('item_quicksilver_sash');
  name = 'Khăn Giải Thuật (Item_Quicksilver)';
  description =
    '<span class="buff">Gỡ bỏ mọi hiệu ứng khống chế</span> mà kẻ khác đã gây ra cho bạn' +
    ' (choáng, trói, câm lặng, khiêu khích...). <span>Làm chậm không bị gỡ.</span>';
  coolDown = COOLDOWN_MS;
  manaCost = 0;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: this.coolDown },
    };
  }

  onSpellCast() {
    const broken = this.owner.cleanse();

    // Drawn on every press, not only on a press that took something off. A
    // button that goes silent when it finds nothing reads as broken rather
    // than as wasted, and the ninety-second cooldown started either way — the
    // player has to be able to see that they spent it. `broken` still shapes
    // the effect: nothing to break paints the mercury sheen alone, without the
    // shackles, so the two outcomes are still tellable apart.
    const snap = new Item_Quicksilver_Break(this.owner);
    snap.broke = broken > 0;
    // The body, not a buff — this one has none to ride. See
    // `Item_Thornmail`'s own flare for why a short effect still attaches.
    snap.attachTo(this.owner);
    this.game.objectManager.addObject(snap);
  }
}

/** One flung shackle: where it went and how it tumbled. */
interface Link {
  angle: number;
  spin: number;
  reach: number;
}

/**
 * Shackles snapping off the body and flying clear, over one sheen of mercury.
 *
 * The motion is outward because the effect is a release — rule 4 of the VFX
 * standard, and the one this effect could most easily have got backwards. An
 * inward-collapsing shimmer over "everything holding you is gone" would tell
 * the player the opposite of what just happened.
 */
export class Item_Quicksilver_Break extends SpellObject {
  age = 0;

  /** False when the cleanse found nothing — see `Item_Quicksilver.onSpellCast`. */
  broke = true;

  _links: Link[] = [];

  onAdded() {
    // Seeded once, here: `random()` inside `draw()` re-rolls every frame.
    for (let i = 0; i < LINK_COUNT; i++) {
      this._links.push({
        angle: (i / LINK_COUNT) * TWO_PI + random(-0.2, 0.2),
        spin: random(-4, 4),
        reach: random(0.75, 1.25),
      });
    }
  }

  update() {
    if (this.dropIfAttachmentLost()) return;

    this.age += deltaTime;
    this.position.set(this.owner.position.x, this.owner.position.y);
    if (this.age >= BREAK_MS) this.toRemove = true;
  }

  draw() {
    const t = constrain(this.age / BREAK_MS, 0, 1);
    // snap out, then coast: fast on the break, slow as the pieces spend
    const out = 1 - (1 - t) * (1 - t);
    const fade = 1 - t;
    const size = this.owner.animatedValues.displaySize;
    const [mr, mg, mb] = MERCURY;
    const [ir, ig, ib] = IRON;

    push();
    translate(this.position.x, this.position.y);

    // The sheen: liquid metal running over him. This is the half that fires
    // even when there was nothing to break.
    noFill();
    stroke(mr, mg, mb, 230 * fade);
    strokeWeight(5 * fade + 1.5);
    circle(0, 0, size + 40 * out);

    if (this.broke) {
      for (const link of this._links) {
        const distance = size / 2 + LINK_REACH * link.reach * out;
        const x = cos(link.angle) * distance;
        const y = sin(link.angle) * distance;
        push();
        translate(x, y);
        rotate(link.angle + link.spin * out);
        // A broken link, not a closed one: the gap is what says it failed.
        noFill();
        stroke(ir, ig, ib, 245 * fade);
        strokeWeight(5);
        arc(0, 0, 15, 11, 0.7, TWO_PI - 0.7);
        stroke(mr, mg, mb, 235 * fade);
        strokeWeight(2);
        arc(0, 0, 15, 11, 0.7, TWO_PI - 0.7);
        pop();
      }
    }

    pop();
  }

  getDisplayBoundingBox() {
    const r = this.owner.animatedValues.displaySize / 2 + LINK_REACH + BOUNDING_MARGIN;
    return this.squareDisplayBoundingBox(r * 2);
  }
}
