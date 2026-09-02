import { api } from '../packApi';
import { pct, secs } from '../text';

const Airborne = api.buffs.Airborne;
const Charm = api.buffs.Charm;
const Fear = api.buffs.Fear;
const Root = api.buffs.Root;
const Silence = api.buffs.Silence;
const Slow = api.buffs.Slow;
const Stun = api.buffs.Stun;
const CROWD_CONTROL = [Stun, Root, Slow, Silence, Fear, Charm, Airborne];
const Spell = api.Spell;
const AoePulse = api.AoePulse;
const StatAmp = api.buffs.StatAmp;

export const DURATION = 7000;

export const BONUS_DAMAGE = 10;

export const SPEED_PERCENT = 0.25;

/**
 * All of it. `Stats.tenacity` maxes at 1, and core floors every disable it
 * shortens at `TENACITY_FLOOR_MS` (300ms) so a stun remains a stun — so this
 * is not literal immunity, it is every disable in the game clipped to a third
 * of a second. That is the closest this engine gets to Ragnarok's promise, and
 * it is close enough that the promise still reads: nothing holds Olaf still.
 */
export const TENACITY = 1;

/** One breath of the ember ring, and it is slow on purpose — see the class. */
const PULSE_MS = 1_150;

/** How long a footfall stays burning behind him. */
const EMBER_LIFE_MS = 620;

/** How far he has to travel before he drops another one. */
const EMBER_STEP_PX = 26;


/** Every buff Ragnarok tears off. Anything that takes Olaf's turn away from him. */



/**
 * Ragnarok: not a stat line but an escape.
 *
 * It strips the crowd control already on Olaf the instant it is pressed — the
 * point of the ultimate is being the one champion a stun does not stop, so it
 * has to *undo* one. **And then it has to keep undoing them**, which is the
 * half that was missing: stripping on cast only, a stun landing one second
 * later held him for the remaining six seconds of his own ultimate, which is
 * the exact situation the ability exists to deny. `docs/abilities/olaf/r.json`
 * says he "becomes immune to disables" for the duration, not at the start of
 * it. Core 1.16 has `tenacity`, so the duration now carries it.
 */
export default class Olaf_R extends Spell {
  /**
   * `Buff` alone: it cleanses crowd control and grants attack damage, speed
   * and near-tenacity. No damage, no shield, and an ultimate can never be a
   * retreat candidate.
   */
  static aiRoles = api.enums.SpellRole.Buff;

  targetingMode = 'SELF' as const;
  image = api.asset('spell_olaf_r');
  name = 'Tận Thế Ragnarok (Olaf_R)';
  description =
    `Gỡ bỏ <span class="buff">mọi hiệu ứng khống chế</span> đang dính, và trong` +
    ` <span class="time">${secs(DURATION)} giây</span> nhận <span class="buff">+${BONUS_DAMAGE} sát thương đánh thường</span>` +
    ` cùng <span class="buff">+${pct(SPEED_PERCENT)}% tốc chạy</span>.` +
    ` Trong lúc đó mọi hiệu ứng khống chế mới chỉ còn <span class="time">0.3 giây</span>`;
  coolDown = 10000;
  manaCost = 50;

  onSpellCast() {
    for (const buff of this.owner.buffs) {
      if (CROWD_CONTROL.some(kind => buff instanceof kind)) buff.deactivateBuff();
    }

    const amp = new Olaf_R_Ragnarok(DURATION, this.owner, this.owner);
    amp.stackId = 'olaf_r';
    amp.image = this.image;
    amp.bonuses = {
      attackDamage: { baseBonus: BONUS_DAMAGE },
      speed: { percentBaseBonus: SPEED_PERCENT },
      tenacity: { baseBonus: TENACITY },
    };
    this.owner.addBuff(amp);

    const burst = new AoePulse(this.owner);
    burst.radius = 120;
    burst.lifeTime = 500;
    burst.color = [255, 120, 60];
    burst.style = 'shards';
    burst.spokes = 12;
    this.game.objectManager.addObject(burst);
  }
}


/**
 * Ragnarok, for the seven seconds it lasts.
 *
 * The ultimate was a `StatAmp` and a 500ms burst on cast, and then nothing:
 * for the rest of its duration the strongest button Olaf has was invisible.
 * Neither he nor the people fighting him could tell it was up, which for an
 * ability whose whole promise is "a stun does not stop this man" is the worst
 * thing it could have been — the enemy's decision to try a stun anyway is only
 * a mistake if they could have known.
 *
 * Two layers, and both are deliberately unlike W's.
 *
 *   - **The ember ring** sits at his feet and breathes on a 1.15s clock, where
 *     W's tempo beat snaps at the swing interval. Slow against fast is what
 *     stops the two reading as the same effect stacked twice, and both being
 *     up at once is the normal case for this champion.
 *   - **The trail** is dropped by distance travelled rather than by time, so
 *     it thickens when he is actually moving. That makes it the +25% speed
 *     made visible rather than a decoration that runs whether or not the
 *     bonus is doing anything.
 *
 * The ring shrinks as the buff runs down, so the clock is the shape rather
 * than a separate arc — one fewer thing on a champion who already has W's.
 */
export class Olaf_R_Ragnarok extends StatAmp {
  name = 'Ragnarok';

  /** Where he has been, newest last. Cosmetic only. */
  private _embers: { x: number; y: number; age: number }[] = [];
  private _lastX = 0;
  private _lastY = 0;
  private _seeded = false;

  onUpdate(): void {
    const pos = this.targetUnit.position;
    if (!this._seeded) {
      this._lastX = pos.x;
      this._lastY = pos.y;
      this._seeded = true;
    }

    if (Math.hypot(pos.x - this._lastX, pos.y - this._lastY) >= EMBER_STEP_PX) {
      this._lastX = pos.x;
      this._lastY = pos.y;
      this._embers.push({ x: pos.x, y: pos.y, age: 0 });
    }

    // Aged here and never in `draw`, so the trail decays at the same rate
    // whether or not the camera is looking at him.
    let i = 0;
    while (i < this._embers.length) {
      this._embers[i].age += deltaTime;
      if (this._embers[i].age >= EMBER_LIFE_MS) this._embers.splice(i, 1);
      else i++;
    }
  }

  /** How much trail is burning right now — the drawing's own number, for a test. */
  get emberCount(): number {
    return this._embers.length;
  }

  draw(): void {
    if (this.targetUnit.isDead) return;

    const pos = this.targetUnit.position;
    const size = this.targetUnit.animatedValues.displaySize;
    const left = this.duration ? constrain(1 - this.timeElapsed / this.duration, 0, 1) : 1;
    const breath = 0.5 + 0.5 * sin((this.timeElapsed / PULSE_MS) * TWO_PI);

    push();

    // the trail: hot where it was just laid, ash where it is about to go out
    noStroke();
    for (const ember of this._embers) {
      const t = ember.age / EMBER_LIFE_MS;
      const fade = 1 - t;
      fill(255, 120 + 80 * fade, 50, 150 * fade);
      circle(ember.x, ember.y, (7 + 9 * fade) * (0.6 + 0.4 * fade));
      fill(255, 232, 190, 120 * fade * fade);
      circle(ember.x, ember.y, 4 * fade + 1);
    }

    // the ring at his feet, breathing, and shrinking as the fury runs out
    const ring = (size * 0.75 + 16) * (0.55 + 0.45 * left) * (0.94 + 0.1 * breath);
    noFill();
    stroke(60, 20, 10, 190);
    strokeWeight(7);
    ellipse(pos.x, pos.y + size * 0.28, ring * 2, ring * 0.7);
    stroke(255, 128 + 70 * breath, 60, 220);
    strokeWeight(4);
    ellipse(pos.x, pos.y + size * 0.28, ring * 2, ring * 0.7);
    stroke(255, 236, 200, 130 + 90 * breath);
    strokeWeight(1.5);
    ellipse(pos.x, pos.y + size * 0.28, ring * 1.7, ring * 0.6);
    pop();
  }
}
