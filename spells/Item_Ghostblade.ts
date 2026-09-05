import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Speedup = api.buffs.Speedup;
const SpellObject = api.SpellObject;

/**
 * Kiếm Ma Youmuu's active: five seconds of moving like a ghost.
 *
 * Nothing but movement speed, on purpose. The item's stats are the damage; the
 * button is the gap-close and the escape, and an active that also hit would
 * make the shop's cheapest attack-damage finisher the best ability in the game
 * for 1200 gold.
 */

export const DURATION_MS = 5_000;

export const SPEED_PERCENT = 0.4;

/**
 * Down from 45s to 12s: the practice room's 20s cooldown ceiling now covers
 * item actives too, because a rehearsal has no use for a button that only
 * comes back once a minute — gold-bought or not.
 */
export const COOLDOWN_MS = 12_000;

/** The unsheathe: one ring thrown off him as the blade comes out. */
export const DRAW_MS = 340;

/** A new wisp is laid down on this clock, not per frame, so they space out. */
export const WISP_INTERVAL_MS = 70;

export const WISP_LIFETIME_MS = 420;

/** Below this, he is standing still and the last known heading is kept. */
export const HEADING_EPSILON = 0.35;

/** How far past the body the wake paints, for the display box. */
export const BOUNDING_MARGIN = 110;

/** Cosmetic-only ceiling; the buff ending or the caster dying is the real exit. */
export const HARD_STOP_MS = DURATION_MS + 1_000;

const SPECTRE: [number, number, number] = [150, 120, 210];

export default class Item_Ghostblade extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_youmuus_ghostblade');
  name = 'Kiếm Ma Youmuu (Item_Ghostblade)';
  description =
    `<span class="buff">Tăng tốc ${pct(SPEED_PERCENT)}%</span> trong` +
    ` <span class="time">${secs(DURATION_MS)} giây</span>`;
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
    const haste = new Speedup(DURATION_MS, this.owner, this.owner);
    haste.percent = SPEED_PERCENT;
    haste.image = this.image;
    this.owner.addBuff(haste);

    const wake = new Item_Ghostblade_Wake(this.owner);
    wake.attachTo(this.owner, haste);
    this.game.objectManager.addObject(wake);
  }
}

/** One wisp peeled off the runner, in the frame he was travelling in. */
interface Wisp {
  across: number;
  age: number;
}

/**
 * A violet wake and a countdown ring.
 *
 * Two layers, and each carries a different fact: the wisps say *which way and
 * how fast*, the ring says *how much longer*. Core's `Speedup` already throws
 * its own white motion lines, so this deliberately does not draw a third set
 * — it recolours the read instead, because "that one is hasted" and "that one
 * is hasted **by Youmuu's**" have to be tellable apart by an enemy deciding
 * whether they can still walk away.
 */
export class Item_Ghostblade_Wake extends SpellObject {
  age = 0;

  _wisps: Wisp[] = [];
  _wispTimer = 0;
  /** Latched heading. Never (0,0): it starts at +x and only ever turns. */
  _headingX = 1;
  _headingY = 0;
  _lastX = 0;
  _lastY = 0;

  onAdded() {
    this._lastX = this.owner.position.x;
    this._lastY = this.owner.position.y;
  }

  update() {
    if (this.dropIfAttachmentLost()) return;

    this.age += deltaTime;
    const at = this.owner.position;
    this.position.set(at.x, at.y);
    if (this.age >= HARD_STOP_MS) {
      this.toRemove = true;
      return;
    }

    const dx = at.x - this._lastX;
    const dy = at.y - this._lastY;
    this._lastX = at.x;
    this._lastY = at.y;
    const step = Math.hypot(dx, dy);
    // A direction is never allowed to be (0,0): standing still keeps the last
    // heading rather than collapsing the wake onto one point.
    if (step > HEADING_EPSILON) {
      this._headingX = dx / step;
      this._headingY = dy / step;
    }

    this._wispTimer += deltaTime;
    // Only while he is actually moving. A wake streaming off a parked
    // champion reads as decoration; the whole thing this item bought is travel.
    if (this._wispTimer >= WISP_INTERVAL_MS && step > HEADING_EPSILON) {
      this._wispTimer = 0;
      const r = this.owner.animatedValues.displaySize / 2;
      this._wisps.push({ across: random(-r * 0.8, r * 0.8), age: 0 });
    }

    let i = 0;
    while (i < this._wisps.length) {
      const wisp = this._wisps[i];
      wisp.age += deltaTime;
      if (wisp.age >= WISP_LIFETIME_MS) this._wisps.splice(i, 1);
      else i++;
    }
  }

  draw() {
    const size = this.owner.animatedValues.displaySize;
    const buff = this._anchorBuff;
    const left = buff && buff.duration ? constrain(1 - buff.timeElapsed / buff.duration, 0, 1) : 0;
    const heading = Math.atan2(this._headingY, this._headingX);
    const [pr, pg, pb] = SPECTRE;

    push();
    translate(this.position.x, this.position.y);

    push();
    // travel space: +x is forward, so a wisp is a line pointing backwards and
    // nothing has to be re-derived per wisp
    rotate(heading);
    noFill();
    for (const wisp of this._wisps) {
      const t = wisp.age / WISP_LIFETIME_MS;
      const fade = 1 - t;
      const drift = -t * 60;
      stroke(pr, pg, pb, 190 * fade);
      strokeWeight(3 * fade + 1);
      line(drift, wisp.across, drift - 34 * fade, wisp.across);
    }
    pop();

    // How much of the five seconds is left, in the same violet, so the ring
    // and the wake are obviously one effect.
    noFill();
    stroke(pr * 0.35, pg * 0.35, pb * 0.35, 130);
    strokeWeight(4);
    circle(0, 0, size + 22);
    stroke(pr, pg, pb, 230);
    strokeWeight(4);
    arc(0, 0, size + 22, size + 22, -HALF_PI, -HALF_PI + TWO_PI * left);

    // The unsheathe, gone in the first fifth of the life.
    if (this.age < DRAW_MS) {
      const t = this.age / DRAW_MS;
      noFill();
      stroke(pr, pg, pb, 220 * (1 - t));
      strokeWeight(6 * (1 - t) + 1.5);
      circle(0, 0, size + 110 * t);
    }

    pop();
  }

  getDisplayBoundingBox() {
    const r = this.owner.animatedValues.displaySize / 2 + BOUNDING_MARGIN;
    return this.squareDisplayBoundingBox(r * 2);
  }
}
