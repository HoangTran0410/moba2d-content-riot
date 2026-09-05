import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { secs } from '../text';

const Spell = api.Spell;
const Stasis = api.buffs.Stasis;
const SpellObject = api.SpellObject;

/**
 * Đồng Hồ Cát Zhonya's active: two and a half seconds of being nowhere.
 *
 * `Stasis` is core's, and it already does the whole mechanic — untargetable
 * (so nothing can pick the statue and skillshots pass through), unable to
 * move, cast or attack, whatever it was casting or channelling cancelled
 * (`Stunned` is read by `Spell.observeInterrupts` every frame), immovable
 * against hostile displacements, non-colliding (`PhasesUnits`, so bodies walk
 * through the hourglass instead of piling against it), and
 * `modifyIncomingDamage` returning 0. This spell is the button, the clock and
 * the picture.
 *
 * **The picture is the point.** Core's `Stasis` paints a gold ring and a slow
 * sparkle, which says "something is on this champion" but not *what* and not
 * *how much longer* — and how much longer is the only question anyone standing
 * over the body has. The hourglass below is that number, drawn as the thing
 * the item is: sand running out. Nothing else is added on top, because an
 * effect nobody can find under three other effects has failed.
 */

export const DURATION_MS = 2_500;

/** Down from 90s — see `Item_Ghostblade.ts`'s note on the practice room's 20s ceiling. */
export const COOLDOWN_MS = 18_000;

/** How long the glass takes to close over the body. */
export const SEAL_MS = 260;

/** How far past the body the hourglass paints, for the display box. */
export const BOUNDING_MARGIN = 46;

const GLASS: [number, number, number] = [255, 226, 140];

const SAND: [number, number, number] = [232, 168, 52];

export default class Item_Zhonyas extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_zhonyas_hourglass');
  name = 'Đồng Hồ Cát Zhonya (Item_Zhonyas)';
  description =
    `Tự đóng băng bản thân trong <span class="time">${secs(DURATION_MS)} giây</span>:` +
    ' <span class="buff">không thể bị chọn làm mục tiêu và không nhận sát thương</span>,' +
    ' đổi lại không thể di chuyển hay dùng chiêu';
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
    const stasis = new Stasis(DURATION_MS, this.owner, this.owner);
    stasis.image = this.image;
    this.owner.addBuff(stasis);

    // Attached to the buff, not merely to the body: whatever ends the stasis
    // early ends the glass with it, so the picture and the rule can never
    // disagree about whether the champion is still untouchable.
    const glass = new Item_Zhonyas_Glass(this.owner);
    glass.attachTo(this.owner, stasis);
    this.game.objectManager.addObject(glass);
  }
}

/**
 * The hourglass: two bowls meeting at a waist, over the frozen champion, with
 * the sand level reading off how much of the 2.5 seconds is left.
 *
 * Deliberately drawn as an outline rather than a filled shape — the champion
 * inside it is the thing everyone is looking at, and a solid gold body over
 * the sprite would hide the very unit whose state it is reporting.
 */
export class Item_Zhonyas_Glass extends SpellObject {
  age = 0;

  update() {
    if (this.dropIfAttachmentLost()) return;

    this.age += deltaTime;
    this.position.set(this.owner.position.x, this.owner.position.y);
    // The buff is the real exit; this only bounds a cosmetic that somehow
    // outlived it.
    if (this.age >= DURATION_MS + 500) this.toRemove = true;
  }

  draw() {
    const buff = this._anchorBuff;
    const left = buff && buff.duration ? constrain(1 - buff.timeElapsed / buff.duration, 0, 1) : 0;
    // The glass closes over the first quarter-second, so the cast has a moment
    // rather than appearing at full size on frame one.
    const seal = constrain(this.age / SEAL_MS, 0, 1);
    const eased = 1 - (1 - seal) * (1 - seal);
    const size = this.owner.animatedValues.displaySize;
    const half = (size * 0.85 * eased) / 2;
    const waist = half * 0.16;
    const [gr, gg, gb] = GLASS;
    const [sr, sg, sb] = SAND;

    push();
    translate(this.position.x, this.position.y);

    // The two bowls, one outline. This is the silhouette that says "hourglass"
    // and nothing else in the game draws it.
    noFill();
    stroke(gr, gg, gb, 235);
    strokeWeight(3);
    beginShape();
    vertex(-half, -half);
    vertex(half, -half);
    vertex(waist, 0);
    vertex(half, half);
    vertex(-half, half);
    vertex(-waist, 0);
    endShape(CLOSE);
    // the waist itself, so the two bowls are visibly separate volumes
    line(-waist, 0, waist, 0);

    // The sand: the top bowl empties as the bottom fills, which is the clock.
    // Same colour in both, because it is the same sand.
    noStroke();
    fill(sr, sg, sb, 215);
    const upper = half * left;
    if (upper > 1) {
      beginShape();
      vertex(-half * (0.15 + 0.85 * left), -upper);
      vertex(half * (0.15 + 0.85 * left), -upper);
      vertex(waist, 0);
      vertex(-waist, 0);
      endShape(CLOSE);
    }
    const lower = half * (1 - left);
    if (lower > 1) {
      beginShape();
      vertex(-waist, 0);
      vertex(waist, 0);
      vertex(half * (0.15 + 0.85 * (1 - left)), lower);
      vertex(-half * (0.15 + 0.85 * (1 - left)), lower);
      endShape(CLOSE);
    }
    // the stream through the waist, so it reads as running rather than as two
    // static wedges
    if (left > 0.02) {
      stroke(sr, sg, sb, 235);
      strokeWeight(2);
      line(0, -half * 0.1, 0, half * (1 - left));
    }

    pop();
  }

  getDisplayBoundingBox() {
    const r = this.owner.animatedValues.displaySize / 2 + BOUNDING_MARGIN;
    return this.squareDisplayBoundingBox(r * 2);
  }
}
