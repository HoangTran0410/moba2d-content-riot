import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct } from '../text';

const Spell = api.Spell;
const DamageReflect = api.buffs.DamageReflect;
const SpellObject = api.SpellObject;

/**
 * Giáp Gai's whole effect, as an item **passive**.
 *
 * Core presses a held item's passive once per life (`Champion.armPassives`)
 * and re-presses it after a respawn, so this spell's job is to hang one
 * permanent buff and be finished. `duration = 0` is what permanent means to
 * `Buff.update` — `if (this.duration && this.timeElapsed >= this.duration)` —
 * so nothing ages it out and nothing has to re-apply it every frame.
 *
 * No mana, no cooldown, and no `checkCastCondition`: a passive that can refuse
 * its own cast stays visibly unarmed for the rest of the life, because
 * `armPassives` marks it armed on the press rather than on the result.
 */

/** Share of every hit the spikes send back at whoever landed it. */
export const REFLECT_PERCENT = 0.25;

/**
 * Its own tag, not the bare `DamageReflect` class.
 *
 * `Buff.stackId` defaults to the constructor, and a champion holding Giáp Gai
 * while a spell of their own also reflects (Rammus W) would otherwise have the
 * two fight over one slot — `BuffAddType.REPLACE_EXISTING` means the ability
 * would silently *delete* the item the player paid 1100 gold for, or the item
 * would eat the ability. Two different sources of thorns are two buffs.
 */
export const REFLECT_STACK_ID = 'item_thornmail_reflect';

/** How long the spikes take to push out and settle back when it arms. */
export const FLARE_MS = 520;

/** Spikes around the rim. Enough to read as armour, few enough to count. */
export const SPIKE_COUNT = 12;

/** How far a spike stands out past the body at full extension. */
export const SPIKE_LENGTH = 17;

/** How far past the body the flare paints, for the display box. */
export const BOUNDING_MARGIN = 40;

const IRON_DARK: [number, number, number] = [48, 42, 40];

const IRON: [number, number, number] = [138, 126, 118];

const IRON_LIGHT: [number, number, number] = [222, 212, 200];

export default class Item_Thornmail extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_thornmail');
  name = 'Giáp Gai (Item_Thornmail)';
  description =
    `Nội tại: phản <span class="buff">${pct(REFLECT_PERCENT)}% sát thương</span> nhận vào` +
    ' về kẻ đã gây ra nó (tính trên đòn đánh gốc, trước khi khiên đỡ)';
  coolDown = 0;
  manaCost = 0;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: 0 },
    };
  }

  onSpellCast() {
    const reflect = new DamageReflect(0, this.owner, this.owner);
    reflect.stackId = REFLECT_STACK_ID;
    reflect.percent = REFLECT_PERCENT;
    reflect.image = this.image;
    // armed for as long as the item is held — not a bar's worth of news
    reflect.hudVisible = false;
    // Tied to the item, not the life: before core 1.5's `sourceSpell` sweep a
    // sold Giáp Gai kept reflecting for the rest of the match.
    reflect.sourceSpell = this;
    this.owner.addBuff(reflect);

    // One flare, and only at the moment the armour goes on. The *payout* is
    // already legible without any art of this pack's: `DamageReflect` puts its
    // own combat text on the attacker, which is where rule 3 of the VFX
    // standard wants an impact. A permanent ring on the wearer
    // would say the same thing every frame for the rest of the match and hide
    // whatever else is on that body.
    const flare = new Item_Thornmail_Flare(this.owner);
    // The body, not a buff: this flare is over in half a second, and the only
    // thing that must end it early is the wearer dying — otherwise it keeps
    // painting on the corpse and reappears at the fountain.
    flare.attachTo(this.owner);
    this.game.objectManager.addObject(flare);
  }
}

/** One spike's own jitter, rolled once so the rim does not machine itself. */
interface Spike {
  length: number;
  lean: number;
}

/**
 * Iron spikes shoving out of the wearer and settling back flush.
 *
 * Two layers and no more: the spikes (which *are* the item) and a single ring
 * that leaves with them. The read is "that one is wearing something that will
 * hurt to touch", at a glance, once.
 */
export class Item_Thornmail_Flare extends SpellObject {
  age = 0;

  _spikes: Spike[] = [];

  onAdded() {
    // Seeded once, here — `random()` inside `draw()` re-rolls every frame and
    // flickers instead of animating.
    for (let i = 0; i < SPIKE_COUNT; i++) {
      this._spikes.push({ length: random(0.7, 1.3), lean: random(-0.06, 0.06) });
    }
  }

  update() {
    if (this.dropIfAttachmentLost()) return;

    this.age += deltaTime;
    this.position.set(this.owner.position.x, this.owner.position.y);
    if (this.age >= FLARE_MS) this.toRemove = true;
  }

  draw() {
    const t = constrain(this.age / FLARE_MS, 0, 1);
    // Out fast, back slow: the spikes snap out over the first third and sink
    // flush over the rest, which is what makes it read as armour locking on
    // rather than as a generic pulse.
    const out = t < 0.33 ? 1 - (1 - t / 0.33) * (1 - t / 0.33) : 1 - (t - 0.33) / 0.67;
    const fade = 1 - t * t;
    const size = this.owner.animatedValues.displaySize;
    const radius = size / 2;
    const [dr, dg, db] = IRON_DARK;
    const [mr, mg, mb] = IRON;
    const [lr, lg, lb] = IRON_LIGHT;

    push();
    translate(this.position.x, this.position.y);

    for (let i = 0; i < SPIKE_COUNT; i++) {
      const spike = this._spikes[i];
      const angle = (i / SPIKE_COUNT) * TWO_PI + spike.lean;
      const inner = radius * 0.9;
      const outer = inner + SPIKE_LENGTH * spike.length * out;
      const width = 0.1;
      // Dark body under a light edge: a silhouette that holds over grass,
      // water and stone alike, which colour alone does not.
      fill(dr, dg, db, 240 * fade);
      noStroke();
      triangle(
        cos(angle - width) * inner,
        sin(angle - width) * inner,
        cos(angle + width) * inner,
        sin(angle + width) * inner,
        cos(angle) * outer,
        sin(angle) * outer
      );
      fill(lr, lg, lb, 200 * fade);
      triangle(
        cos(angle - width * 0.35) * inner,
        sin(angle - width * 0.35) * inner,
        cos(angle + width * 0.12) * inner,
        sin(angle + width * 0.12) * inner,
        cos(angle) * (outer - 3),
        sin(angle) * (outer - 3)
      );
    }

    // The plate the spikes are set in, gone with them.
    noFill();
    stroke(mr, mg, mb, 210 * fade);
    strokeWeight(3);
    circle(0, 0, radius * 1.8);

    pop();
  }

  getDisplayBoundingBox() {
    const r = this.owner.animatedValues.displaySize / 2 + SPIKE_LENGTH + BOUNDING_MARGIN;
    return this.squareDisplayBoundingBox(r * 2);
  }
}
