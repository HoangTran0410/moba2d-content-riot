import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const StatAmp = api.buffs.StatAmp;
const SpellObject = api.SpellObject;
const PredefinedParticleSystems = api.helpers.PredefinedParticleSystems;

export const DURATION = 6000;

export const ATTACK_SPEED_PERCENT = 0.5;

export const OMNIVAMP = 0.4;

export const ON_HIT_DAMAGE = 4;


/** The axes fall in and cross. Accelerating, so they land rather than arrive. */
export const SLAM_MS = 320;

/** The frost star thrown off the crossing, after the axes touch down. */
export const SHATTER_MS = 460;

export const AXE_COUNT = 2;

/** Where the axes ride once they have settled, past his own body. */
export const ORBIT_MARGIN = 26;

export const SPIN_MS_PER_TURN = 1400;

export const RUNE_COUNT = 4;

/** One pass of the flicker around the rune ring. */
export const RUNE_CYCLE_MS = 1600;

/** How often a drop of life is drawn back into him — the omnivamp, made visible. */
export const VAMP_INTERVAL_MS = 190;

export const DROP_INTERVAL_MS = VAMP_INTERVAL_MS;

/**
 * The swing rhythm the buff actually buys, in ms. A base 620ms swing divided by
 * the attack-speed multiplier: derived from the stat so the beat on screen and
 * the number in the tooltip cannot drift apart.
 */
export const BEAT_MS = 620 / (1 + ATTACK_SPEED_PERCENT);

export const DROP_LIFETIME_MS = 620;

export const FROST_INTERVAL_MS = 110;

export const BOUNDING_MARGIN = 160;

/** Cosmetic-only ceiling; the buff ending or Olaf dying is the real exit. */
export const HARD_STOP_MS = DURATION + 1200;


/**
 * Four staves, in unit coordinates, drawn as bare line segments. Angular and
 * asymmetric on purpose: runes have to look *carved*, and a curve anywhere in
 * here would turn them into decorative squiggles.
 */
export const RUNES: number[][][] = [
  [
    [0, -1, 0, 1],
    [0, -1, 0.72, -0.3],
    [0, 0.15, 0.72, 0.95],
  ],
  [
    [0, -1, 0, 1],
    [0, -0.85, 0.8, -0.05],
    [0.8, -0.05, 0, 0.7],
  ],
  [
    [-0.7, 1, 0, -1],
    [0, -1, 0.7, 1],
    [-0.38, 0.1, 0.38, 0.1],
  ],
  [
    [0, -1, 0, 1],
    [-0.72, -0.55, 0.72, 0.55],
    [-0.72, 0.55, 0.72, -0.55],
  ],
];


/**
 * Vicious Strikes.
 *
 * ## What is drawn, and what was cut
 *
 * This ran six simultaneous layers for six seconds: a ring of four carved
 * runes lighting in sequence, life-drop motes, two orbiting axes, a duration
 * arc, a tempo beat with a flare over his body, and a ten-spiked frost star at
 * the crossing. Every one of them was defensible alone and the sum was
 * unreadable — a buff you cannot see past is a buff that makes the fight
 * harder to play, which is the opposite of what a self-buff is for.
 *
 * What survives is what the buff *is*. The beat, because attack speed is the
 * only half a player can act on. The drops, because they travel *inward* and
 * that direction is the whole message of omnivamp. The axes, because they are
 * Olaf. The duration arc, because a timed buff needs a clock.
 *
 * What went: the runes, which said nothing and occupied the most space; and
 * the frost star, which contradicted the note two layers below it saying
 * nothing about Vicious Strikes is cold. `RUNES` and `RUNE_COUNT` stay
 * exported — the shapes are good and the next ability that wants carved staves
 * should not redraw them — but nothing in this file paints them now.
 *
 * This used to carry its own `ON_ATTACK_HIT` subscription to do the healing —
 * about thirty lines of subscribe/unsubscribe bookkeeping duplicated across
 * four spells. `omnivamp` is a stat now (see `Stats.ts`), so the whole ability
 * is the buff, and the vamp works on Olaf's abilities too, which is what
 * "toàn phần" means.
 */
export default class Olaf_W extends Spell {
  /**
   * `Buff` alone: attack speed, on-hit damage and omnivamp. No target, no
   * shield.
   */
  static aiRoles = api.enums.SpellRole.Buff;

  targetingMode = 'SELF' as const;
  image = api.asset('spell_olaf_w');
  name = 'Nổi Khùng (Olaf_W)';
  description =
    `Trong <span class="time">${secs(DURATION)} giây</span>: <span class="buff">+${pct(ATTACK_SPEED_PERCENT)}% tốc độ đánh</span>,` +
    ` <span class="buff">+${ON_HIT_DAMAGE} sát thương mỗi đòn đánh</span> và` +
    ` <span class="buff">hút ${pct(OMNIVAMP)}% máu từ mọi sát thương gây ra</span>`;
  coolDown = 10000;
  manaCost = 30;

  onSpellCast() {
    const amp = new StatAmp(DURATION, this.owner, this.owner);
    amp.stackId = 'olaf_w';
    amp.image = this.image;
    amp.name = 'Đòn Hiểm';
    amp.bonuses = {
      attackSpeed: { percentBaseBonus: ATTACK_SPEED_PERCENT },
      onHitDamage: { baseBonus: ON_HIT_DAMAGE },
      omnivamp: { baseBonus: OMNIVAMP },
    };
    this.owner.addBuff(amp);

    // +50% attack speed and 40% omnivamp means the enemy has six seconds to
    // decide to disengage, and they can only make that call if they can see it.
    // Norse, and only Norse: frost off the steel, blood on the edge, carved
    // staves — no glow, no orb, nothing anyone else in the game uses.
    const strikes = new Olaf_W_Object(this.owner);
    strikes.attachTo(this.owner, amp);
    this.game.objectManager.addObject(strikes);
  }
}


interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}


/**
 * Two axes riding Olaf for the duration of Vicious Strikes. They orbit *and*
 * spin on their own heads, which is what stops a pair of orbiting sprites from
 * reading as a decorative ring: real thrown steel tumbles.
 */
export class Olaf_W_Object extends SpellObject {
  age = 0;

  _drops: Drop[] = [];
  _dropTimer = 0;
  _frostTimer = 0;

  particleSystem = PredefinedParticleSystems.smoke([196, 228, 248], 0.55, 6);

  onAdded() {
    this.game.objectManager.addObject(this.particleSystem);
    // Frost is emitted on a clock; onRemoved() drains it, so a gap between
    // puffs cannot delete the system mid-buff.
    this.particleSystem.autoRemoveIfEmpty = false;
    this._frost(8);
  }

  onRemoved() {
    this.particleSystem.autoRemoveIfEmpty = true;
  }

  /** Where an axe head is right now, in world space, so frost trails the blade. */
  _axeHead(index: number): { x: number; y: number } {
    const r = this.owner.animatedValues.displaySize / 2;
    const orbit = r + ORBIT_MARGIN;
    const a = (TWO_PI * index) / AXE_COUNT + (this.age / SPIN_MS_PER_TURN) * TWO_PI;
    return {
      x: this.owner.position.x + cos(a) * orbit,
      y: this.owner.position.y + sin(a) * orbit,
    };
  }

  _frost(count: number) {
    for (let i = 0; i < count; i++) {
      const head = this._axeHead(i % AXE_COUNT);
      this.particleSystem.addParticle({
        x: head.x + random(-6, 6),
        y: head.y + random(-6, 6),
        size: random(7, 15),
        opacity: random(60, 120),
      });
    }
  }

  update() {
    if (this.dropIfAttachmentLost()) return;

    this.age += deltaTime;
    this.position.set(this.owner.position.x, this.owner.position.y);

    if (this.age >= HARD_STOP_MS) {
      this.toRemove = true;
      return;
    }

    this._frostTimer += deltaTime;
    if (this._frostTimer >= FROST_INTERVAL_MS) {
      this._frostTimer = 0;
      this._frost(AXE_COUNT);
    }

    // Omnivamp, drawn as what it is: life coming *back*. These rise off the
    // ground around him and are drawn inward until his body absorbs them.
    // They used to be blood flung off the axe head and falling away, which is
    // the picture for a wound, and reads as the opposite of what W does.
    if (this.age >= SLAM_MS) {
      this._dropTimer += deltaTime;
      if (this._dropTimer >= VAMP_INTERVAL_MS) {
        this._dropTimer = 0;
        const a = random(TWO_PI);
        const d = this.owner.animatedValues.displaySize * random(0.9, 1.5);
        this._drops.push({
          x: cos(a) * d,
          y: sin(a) * d,
          vx: 0,
          vy: 0,
          age: 0,
        });
      }
    }

    let i = 0;
    while (i < this._drops.length) {
      const drop = this._drops[i];
      drop.age += deltaTime;
      // accelerating inward: absorbed, not merely drifting past
      const pull = 0.16 + (drop.age / DROP_LIFETIME_MS) * 0.34;
      drop.vx -= drop.x * pull * 0.06;
      drop.vy -= drop.y * pull * 0.06 + 0.05; // slight lift, so it climbs him
      drop.x += drop.vx;
      drop.y += drop.vy;
      const reached = Math.hypot(drop.x, drop.y) < 6;
      if (reached || drop.age >= DROP_LIFETIME_MS) this._drops.splice(i, 1);
      else i++;
    }
  }

  /** One axe, haft along +x, head at the far end. Drawn in its own space. */
  _drawAxe(scaleFactor: number) {
    push();
    scale(scaleFactor);
    // haft
    stroke(58, 40, 24, 245);
    strokeWeight(6);
    line(-16, 0, 17, 0);
    stroke(124, 90, 54, 245);
    strokeWeight(3);
    line(-16, 0, 17, 0);
    // a leather grip at the butt, so the haft has a near end and a far end
    stroke(38, 28, 18, 245);
    strokeWeight(7);
    line(-16, 0, -8, 0);

    // the head: a broad bearded wedge, dark bevel first then cold steel
    noStroke();
    fill(46, 58, 70, 245);
    beginShape();
    vertex(11, -6);
    vertex(23, -16);
    vertex(32, 0);
    vertex(23, 16);
    vertex(11, 6);
    endShape(CLOSE);
    fill(188, 214, 232, 250);
    beginShape();
    vertex(13, -4);
    vertex(23, -13);
    vertex(29, 0);
    vertex(23, 13);
    vertex(13, 4);
    endShape(CLOSE);
    // the honed edge, and the rime clinging to it
    stroke(246, 252, 255, 250);
    strokeWeight(2);
    noFill();
    beginShape();
    vertex(23, -13);
    vertex(29, 0);
    vertex(23, 13);
    endShape();
    stroke(150, 214, 250, 200);
    strokeWeight(1.5);
    line(16, -7, 26, -9);
    line(16, 7, 26, 9);
    pop();
  }

  draw() {
    const size = this.owner.animatedValues.displaySize;
    const r = size / 2;
    const buff = this._anchorBuff;
    const left = buff && buff.duration ? constrain(1 - buff.timeElapsed / buff.duration, 0, 1) : 0;
    const rawSlam = constrain(this.age / SLAM_MS, 0, 1);
    // accelerating: they drop under weight rather than gliding into place
    const slam = rawSlam * rawSlam;
    const orbit = lerp(r * 2.6, r + ORBIT_MARGIN, slam);
    const spin = (this.age / SPIN_MS_PER_TURN) * TWO_PI;

    push();
    translate(this.position.x, this.position.y);

    // The ring the duration arc and the tempo beat are measured against. It
    // used to carry four carved runes lighting in sequence; see the note above
    // the class on why they are gone.
    const runeR = r + 44;

    // The healing itself. Each mote brightens as it closes on him, so the eye
    // follows it *in* — the direction is the whole message.
    noStroke();
    for (const drop of this._drops) {
      const home = constrain(1 - Math.hypot(drop.x, drop.y) / (r * 3), 0, 1);
      fill(lerp(150, 255, home), lerp(20, 90, home), lerp(24, 70, home), 235);
      circle(drop.x, drop.y, 4 + 3 * home);
    }

    // The axes. On the way in they fall from above the ring and cross; after
    // that they orbit and tumble.
    for (let i = 0; i < AXE_COUNT; i++) {
      const a = (TWO_PI * i) / AXE_COUNT + spin;
      push();
      translate(cos(a) * orbit, sin(a) * orbit - (1 - slam) * 150);
      rotate(a + HALF_PI + spin * 1.6);
      this._drawAxe(lerp(1.35, 1, slam));
      pop();
    }

    // How much of the frenzy is left. Red, not frost: nothing about Vicious
    // Strikes is cold, and the blue was borrowed from an ability he does not have.
    noFill();
    stroke(58, 20, 18, 130);
    strokeWeight(4);
    circle(0, 0, runeR * 2 + 22);
    stroke(255, 108, 74, 235);
    strokeWeight(4);
    arc(0, 0, runeR * 2 + 22, runeR * 2 + 22, -HALF_PI, -HALF_PI + TWO_PI * left);

    // THE TEMPO. The attack-speed half of the buff, and the only part of it a
    // player can act on, so it gets the loudest element: a beat snapping outward
    // on the actual swing interval the bonus buys. Derived from
    // ATTACK_SPEED_PERCENT rather than a hand-picked number, so retuning the
    // stat retunes the picture with it.
    if (this.age >= SLAM_MS) {
      const beat = ((this.age - SLAM_MS) % BEAT_MS) / BEAT_MS;
      const kick = 1 - beat;
      noFill();
      stroke(255, 160, 90, 210 * kick * kick);
      strokeWeight(5 * kick + 1);
      circle(0, 0, r * 1.6 + beat * r * 1.7);
      // and a hot rim at the top of each beat. A filled disc over his body,
      // which is what this was, hides the one thing on screen the player is
      // steering — the beat has to be readable *around* Olaf, not instead of him.
      noFill();
      stroke(255, 190, 130, 190 * kick * kick);
      strokeWeight(6 * kick + 1);
      circle(0, 0, r * 1.25);
    }

    // The crossing: one hot ring thrown off the axes touching down, and then
    // it is over. This was a ten-spiked frost star with a white flash and a red
    // splash under it — three shapes, in a palette this file's own duration
    // ring already says is wrong for the ability ("nothing about Vicious
    // Strikes is cold"). The moment deserves a mark; it did not deserve the
    // loudest element in a six-second buff.
    if (this.age >= SLAM_MS && this.age < SLAM_MS + SHATTER_MS) {
      const t = (this.age - SLAM_MS) / SHATTER_MS;
      const fade = 1 - t;
      noFill();
      stroke(255, 150, 96, 235 * fade * fade);
      strokeWeight(5 * fade + 1);
      circle(0, 0, size * 0.8 + 190 * t);
    }

    pop();
  }

  getDisplayBoundingBox() {
    const r = this.owner.animatedValues.displaySize / 2 + BOUNDING_MARGIN;
    return this.squareDisplayBoundingBox(r * 2);
  }
}