import type { AttackableUnit } from '@moba2d/core/content/types';
import { Orianna_Ball, ballFor } from './Orianna_Q';
import { api } from '../packApi';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const Airborne = api.buffs.Airborne;
const Dash = api.buffs.Dash;
const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const PredefinedParticleSystems = api.helpers.PredefinedParticleSystems;
const GROUND_Z_INDEX = api.layers.GROUND_Z_INDEX;


/**
 * Lệnh: Sóng Âm. The Ball winds up, then drags everything around it inward.
 *
 * The windup is not padding: it is the whole fairness of the ability. The ring
 * closes onto the real radius over `WINDUP_MS`, which is the window a caught
 * champion has to walk out of it, and the shockwave fires from wherever the
 * Ball is *at the end* of that windup — so a Ball riding a running ally drags
 * its own moment with it, exactly as the record describes.
 *
 * The haul draws inward. A pull whose art sweeps outward reads as a knockback
 * that went wrong, so every stroke this thing paints after detonation travels
 * toward the centre.
 *
 * Reshaped from the record: the source ability stuns for 0.75s and throws
 * victims a flat 325 units, which on this map would clear a third of it and on
 * this health pool would be a 200-point nuke. Here it is a short `Airborne`
 * (which already takes the victim off their feet, so a separate stun would be
 * two words for one thing) and a haul that ends everyone the same short
 * distance from the Ball. The 110-second cooldown becomes the seam's 10s
 * ceiling.
 */
export const COOLDOWN_MS = 10_000;

export const MANA_COST = 90;

export const DAMAGE = 50;

export const RADIUS = 250;

/** Where the haul leaves its victims, measured from the Ball. */
export const PULL_STOP_DISTANCE = 60;

export const AIRBORNE_DURATION_MS = 500;

/** The telegraph. Long enough to be a decision, short enough to be an ultimate. */
export const WINDUP_MS = 500;

/** How fast a victim is dragged in. */
export const PULL_SPEED = 14;

/** The player-facing name core's death recap groups this damage by. */
export const DAMAGE_LABEL = 'Lệnh: Sóng Âm';

/** How long the collapse is painted after it lands. */
const AFTERGLOW_MS = 420;

const SPOKE_COUNT = 12;

/** Read once: the icon both displacement buffs wear in the victim's buff bar. */
const SHOCKWAVE_ICON = api.asset('spell_orianna_r');


export default class Orianna_R extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('spell_orianna_r');
  name = 'Lệnh: Sóng Âm (Orianna_R)';
  description = `Quả Cầu nạp năng lượng trong <span class="time">${WINDUP_MS / 1000} giây</span> rồi bung ra một chấn động bán kính <span class="buff">${RADIUS}</span>: <span class="damage magic">${DAMAGE} sát thương phép</span>, <span class="buff">hút mọi kẻ địch về phía Quả Cầu</span> và <span class="buff">Hất Tung</span> trong <span class="time">${AIRBORNE_DURATION_MS / 1000} giây</span>.`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;

  onSpellCast(): void {
    const wave = new Orianna_R_Shockwave(this.owner, ballFor(this.owner));
    this.game.objectManager.addObject(wave);
  }
}


export class Orianna_R_Shockwave extends SpellObject {
  /** A telegraph on the floor, so it never paints over the feet inside it. */
  zIndex = GROUND_Z_INDEX;

  /** The radius the damage really uses, and the radius the ring closes onto. */
  radius = RADIUS;

  detonated = false;

  private readonly ball: Orianna_Ball;
  private age = 0;

  constructor(owner: AttackableUnit, ball: Orianna_Ball) {
    super(owner);
    this.ball = ball;
    this.position = createVector(ball.position.x, ball.position.y);
  }

  update(): void {
    this.age += deltaTime;

    if (this.detonated) {
      if (this.age >= WINDUP_MS + AFTERGLOW_MS) this.toRemove = true;
      return;
    }

    // The shockwave belongs to the Ball, not to the ground it started over: it
    // rides with it right up to the instant it goes off.
    if (!this.ball.toRemove) this.position.set(this.ball.position.x, this.ball.position.y);

    if (this.age >= WINDUP_MS) {
      this.detonated = true;
      this.detonate();
    }
  }

  private detonate(): void {
    // Not vision gated: a blast is real for everyone standing in it.
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    });

    const debris = PredefinedParticleSystems.smoke([160, 215, 245], 0.25, 6);
    this.useParticles(debris);

    for (const victim of caught) {
      victim.takeDamage(DAMAGE, this.owner, 'MAGIC', DAMAGE_LABEL);

      const lifted = new Airborne(AIRBORNE_DURATION_MS, this.owner, victim);
      lifted.image = SHOCKWAVE_ICON;
      lifted.height = 10;
      victim.addBuff(lifted);

      const gap = victim.position.dist(this.position);
      if (gap > PULL_STOP_DISTANCE) {
        const destination = victim.position
          .copy()
          .sub(this.position)
          .setMag(PULL_STOP_DISTANCE)
          .add(this.position);

        const haul = new Dash(AIRBORNE_DURATION_MS, this.owner, victim);
        haul.image = SHOCKWAVE_ICON;
        haul.dashDestination = destination;
        haul.dashSpeed = PULL_SPEED;
        haul.showTrail = false;
        haul.cancelable = false;
        // They are being moved, not moving: a standing move order would walk
        // them straight back out the moment the haul let go.
        haul.stayAtDestination = false;
        victim.addBuff(haul);
      }

      // Something on the victim, where the hit landed.
      for (let i = 0; i < 5; i++) {
        const angle = (TWO_PI * i) / 5;
        debris.addParticle({
          x: victim.position.x + cos(angle) * 16,
          y: victim.position.y + sin(angle) * 16,
          size: 11,
          opacity: 225,
        });
      }
    }
  }

  draw(): void {
    push();
    translate(this.position.x, this.position.y);

    if (!this.detonated) {
      const t = constrain(this.age / WINDUP_MS, 0, 1);
      // t*t: the ring loiters, then slams shut — the last moment is the loud one
      const closing = 1 - t * t;

      // the radius the blast really uses, held still so it can be read and left
      noFill();
      stroke(30, 55, 80, 210);
      strokeWeight(5);
      circle(0, 0, this.radius * 2);
      stroke(175, 225, 250, 200);
      strokeWeight(2);
      circle(0, 0, this.radius * 2);

      // the closing ring: the countdown, drawn as the thing it counts down to
      stroke(245, 215, 150, 235);
      strokeWeight(3.5);
      circle(0, 0, this.radius * 2 * (0.25 + closing * 0.95));

      // the Ball winding up, tightening in step with the ring
      noStroke();
      fill(210, 240, 255, 90 + 120 * t);
      circle(0, 0, 20 + 26 * t);

      pop();
      return;
    }

    const t = constrain((this.age - WINDUP_MS) / AFTERGLOW_MS, 0, 1);
    const alpha = 240 * (1 - t);
    // 1-(1-t)^2: the collapse is fastest at the start
    const drawnIn = 1 - (1 - t) * (1 - t);

    noStroke();
    fill(110, 175, 225, alpha * 0.3);
    circle(0, 0, this.radius * 2 * (1 - drawnIn * 0.75));

    // the rim of the blast, still where the damage was
    noFill();
    stroke(200, 240, 255, alpha * 0.7);
    strokeWeight(3);
    circle(0, 0, this.radius * 2);

    // every stroke travels inward, because the ability pulls
    stroke(235, 220, 165, alpha);
    strokeWeight(3);
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const angle = (TWO_PI * i) / SPOKE_COUNT;
      const tail = this.radius * (1 - drawnIn * 0.85);
      const head = Math.max(tail - this.radius * 0.28, PULL_STOP_DISTANCE * 0.4);
      line(cos(angle) * tail, sin(angle) * tail, cos(angle) * head, sin(angle) * head);
    }

    // the crush at the middle, growing as the spokes arrive
    noStroke();
    fill(250, 240, 210, alpha * drawnIn);
    circle(0, 0, PULL_STOP_DISTANCE * 2 * drawnIn * 0.8);

    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(this.radius * 2 + 40);
  }
}
