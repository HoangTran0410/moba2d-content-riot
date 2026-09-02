import type { Buff } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const Invisible = api.buffs.Invisible;
const Speedup = api.buffs.Speedup;
const EventType = api.enums.EventType;
const Rectangle = api.utils.Quadtree.Rectangle;

/** How long he stays under, if nothing he does brings him up first. */
export const DIVE_MS = 4_000;

/** The shove off the wall the dive opens with. */
export const SPEEDUP_START_PERCENT = 0.6;

/** What is left of it by the time he surfaces — ordinary walking pace. */
export const SPEEDUP_END_PERCENT = 0.15;

export const W_COOLDOWN_MS = 10_000;

export const W_MANA_COST = 40;

/** One slot each, so the two halves of the dive never fight over one. */
export const W_STEALTH_STACK_ID = 'pyke_w_dive_stealth';
export const W_RUSH_STACK_ID = 'pyke_w_dive_rush';

/**
 * Ghostwater Dive.
 *
 * Two rules make this a repositioning tool instead of a chase tool, and losing
 * either turns it into an ordinary stealth. The speed **decays**: it is at its
 * best the instant he vanishes, and by the end he is walking. And it **breaks**
 * the moment he does anything — a swing, any cast — so the stealth buys the
 * approach and never covers the kill.
 */
export default class Pyke_W extends Spell {
  /**
   * The first ability in this repository to declare `Escape`, and it is the
   * flag's textbook shape: rangeless, not the ultimate, stealth and a
   * decaying speed burst, with this file's own header calling it a
   * repositioning tool rather than a chase tool. It scores below zero in
   * every fighting scene by construction — that is the ability working, not
   * a mistake.
   */
  static aiRoles = api.enums.SpellRole.Escape;

  targetingMode = 'SELF' as const;
  image = api.asset('spell_pyke_w');
  name = 'Lặn Mất Tăm (Pyke_W)';
  description =
    `Pyke lặn xuống nước trong <span class="time">${secs(DIVE_MS)} giây</span>:` +
    ` <span class="buff">Tàng Hình</span> và <span class="buff">Tăng Tốc ${pct(SPEEDUP_START_PERCENT)}%</span>, giảm dần còn <span class="buff">${pct(SPEEDUP_END_PERCENT)}%</span>` +
    ` khi hết thời gian. <span class="buff">Đánh thường hoặc dùng bất kỳ chiêu nào</span> sẽ khiến hắn nổi lên ngay lập tức`;
  coolDown = W_COOLDOWN_MS;
  manaCost = W_MANA_COST;

  onSpellCast(): void {
    const rush = new Pyke_W_Rush(DIVE_MS, this.owner, this.owner);
    // Set before `addBuff`: `Speedup.onCreate` reads `percent` into the stats
    // modifier, and after that the field alone moves nothing.
    rush.percent = SPEEDUP_START_PERCENT;
    rush.stackId = W_RUSH_STACK_ID;
    rush.image = this.image;

    const dive = new Pyke_W_Stealth(DIVE_MS, this.owner, this.owner);
    dive.stackId = W_STEALTH_STACK_ID;
    dive.image = this.image;
    dive.rush = rush;
    // The runtime emits ON_POST_CAST_SPELL immediately after this hook returns,
    // with *this* spell as the payload — without naming it here the dive would
    // break itself on the cast that opened it.
    dive.origin = this;

    this.owner.addBuff(rush);
    this.owner.addBuff(dive);

    const water = new Pyke_W_Object(this.owner);
    water.attachTo(this.owner, dive);
    this.game.objectManager.addObject(water);
  }
}

/**
 * The stealth half, and the whole of the "it breaks" rule.
 *
 * Both listeners are unsubscribed in `onDeactivate`. Without that they outlive
 * the buff by the rest of the match and surface a Pyke who is not submerged —
 * the same bookkeeping the spellblade item's buff carries, for the same reason.
 */
export class Pyke_W_Stealth extends Invisible {
  name = 'Lặn Mất Tăm';

  /** The speed half, ended together with this one: one dive, not two buffs. */
  rush: Buff | null = null;

  /** The cast that created this. Its own ON_POST_CAST_SPELL must not break it. */
  origin: unknown = null;

  private stopWatching: (() => void)[] = [];

  onActivate(): void {
    this.stopWatching.push(
      this.game.eventManager.on(
        EventType.ON_POST_CAST_SPELL,
        (spell: { owner?: unknown; countsAsAbilityCast?: boolean }) => {
          if (!spell || spell.owner !== this.targetUnit) return;
          if (spell === this.origin) return;
          // A basic attack, Hồi Thành and an item arming itself all report
          // false here; the swing is caught by ON_ATTACK_HIT instead.
          if (spell.countsAsAbilityCast === false) return;
          this.surface();
        }
      )
    );

    this.stopWatching.push(
      this.game.eventManager.on(EventType.ON_ATTACK_HIT, (hit: { attacker?: unknown }) => {
        if (!hit || hit.attacker !== this.targetUnit) return;
        this.surface();
      })
    );
  }

  onDeactivate(): void {
    for (const stop of this.stopWatching) stop();
    this.stopWatching = [];
    this.rush?.deactivateBuff();
  }

  /** He comes up. Idempotent — `deactivateBuff` latches. */
  surface(): void {
    this.deactivateBuff();
  }
}

/**
 * The speed half, and the decay.
 *
 * `Speedup` folds `percent` into a `StatsModifier` once, in `onCreate`, and the
 * stat adds that modifier's numbers into its own — so moving the field alone
 * afterwards moves nothing. Retuning means pulling the modifier back out,
 * rewriting it and putting it back, which is what `retune` does.
 */
export class Pyke_W_Rush extends Speedup {
  name = 'Dòng Nước Ngầm';

  onUpdate(): void {
    super.onUpdate();
    // Before `onActivate` the modifier is not on the unit yet, and removing it
    // would subtract numbers that were never added.
    if (!this._activated || this._deactivated) return;

    const span = this.duration || 1;
    const spent = constrain(this.timeElapsed / span, 0, 1);
    this.retune(SPEEDUP_START_PERCENT + (SPEEDUP_END_PERCENT - SPEEDUP_START_PERCENT) * spent);
  }

  private retune(next: number): void {
    if (Math.abs(next - this.percent) < 1e-6) return;
    this.targetUnit.stats.removeModifier(this.statsModifier);
    this.percent = next;
    this.statsModifier.speed.percentBaseBonus = next;
    this.targetUnit.stats.addModifier(this.statsModifier);
  }
}

/**
 * The water: a ring thrown off the surface where he went under, and then a dark
 * slick sliding along under him for as long as he stays down.
 *
 * Ground art — it is the surface of the water, so it paints under everyone's
 * feet rather than over them. Deliberately unlike this pack's other stealth,
 * which is a green smoke puff and a broken outline: this one is one dark shape
 * with a wake, and no outline at all, because the only tell Pyke gives his own
 * team is where the water is moving.
 */
export class Pyke_W_Object extends SpellObject {
  zIndex = api.layers.GROUND_Z_INDEX;

  age = 0;
  splashMs = 520;
  splashRadius = 74;

  /** The wake behind him, seeded once so it does not re-roll every frame. */
  _wake: number[] = [];

  get _submerged(): boolean {
    return !!this._anchorBuff && !this.attachmentLost;
  }

  onAdded(): void {
    for (let i = 0; i < 6; i++) this._wake.push(random(0.4, 1));
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.splashMs && !this._submerged) this.toRemove = true;
  }

  draw(): void {
    if (this.age < this.splashMs) this._drawSplash();
    if (this._submerged) this._drawSlick();
  }

  /** Where he went under: one ring opening and settling. */
  _drawSplash(): void {
    const opened = constrain(this.age / this.splashMs, 0, 1);
    const eased = 1 - (1 - opened) * (1 - opened);
    const fade = 1 - opened;

    push();
    translate(this.position.x, this.position.y);
    noFill();
    stroke(58, 128, 132, 190 * fade);
    strokeWeight(4 * fade + 1);
    ellipse(0, 0, this.splashRadius * 2 * eased, this.splashRadius * 1.3 * eased);
    stroke(150, 210, 205, 130 * fade);
    strokeWeight(2);
    ellipse(0, 0, this.splashRadius * 1.3 * eased, this.splashRadius * 0.85 * eased);
    pop();
  }

  /** Where he is now: a slick with a wake trailing the way he came. */
  _drawSlick(): void {
    const here = this.owner.position;
    const behind = p5.Vector.sub(here, this.owner.destination);
    const heading = Math.atan2(behind.y, behind.x);
    const size = this.owner.animatedValues.displaySize;

    push();
    translate(here.x, here.y);
    noStroke();
    fill(14, 40, 46, 130);
    ellipse(0, 0, size * 1.5, size * 1.05);
    fill(30, 74, 78, 110);
    ellipse(0, 0, size * 0.95, size * 0.65);

    rotate(heading);
    for (let i = 0; i < this._wake.length; i++) {
      const back = (i + 1) / this._wake.length;
      fill(60, 130, 130, 90 * (1 - back));
      circle(size * 0.7 * back * this._wake[i], 0, size * 0.32 * (1 - back * 0.6) + 3);
    }
    pop();
  }

  /** Covers the splash left behind and the body it now rides on. */
  getDisplayBoundingBox() {
    const pad = this.splashRadius + 40;
    return new Rectangle({
      x: Math.min(this.position.x, this.owner.position.x) - pad,
      y: Math.min(this.position.y, this.owner.position.y) - pad,
      w: Math.abs(this.position.x - this.owner.position.x) + pad * 2,
      h: Math.abs(this.position.y - this.owner.position.y) + pad * 2,
      data: this,
    });
  }
}
