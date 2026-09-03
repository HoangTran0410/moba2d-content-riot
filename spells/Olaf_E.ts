import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Circle = api.utils.Quadtree.Circle;
const effectiveRange = api.combat.Reach.effectiveRange;
const PredefinedFilters = api.combat.PredefinedFilters;
const Spell = api.Spell;
const Rectangle = api.utils.Quadtree.Rectangle;
const SpellObject = api.SpellObject;
const PredefinedParticleSystems = api.helpers.PredefinedParticleSystems;
const dmg = api.text.dmg;
const tint = api.text.tint;


export const RANGE = 170;

// A third of a LOL2D champion's ~100 health pool: the ceiling of the 15-35 band
// a basic ability gets here, rather than the 40 carried over from the wiki.
export const DAMAGE = 33;

export const HEALTH_COST = 8;


/**
 * Reckless Swing: the biggest single hit in the game for its cooldown, and it
 * costs Olaf health rather than mana — the reason to keep W up.
 */
export default class Olaf_E extends Spell {
  // Auto-locks its own target; see "auto-locking spells" in docs/ADDING_SPELLS.md.
  targetingMode = 'SELF' as const;
  image = api.asset('spell_olaf_e');
  name = 'Bổ Củi (Olaf_E)';
  description =
    `Bổ rìu vào kẻ địch gần nhất trong <span>${RANGE}px</span>: ${dmg(DAMAGE, 'TRUE')},` +
    ` đổi lại Olaf ${tint(`tự mất ${HEALTH_COST} máu`)}`;
  coolDown = 5000;
  manaCost = 0;

  range = RANGE;

  checkCastCondition() {
    // Never lethal to its own caster: a cost is a cost, not a suicide button.
    return !!this._findTarget() && this.owner.stats.health.value > HEALTH_COST;
  }

  onSpellCast() {
    const target = this._findTarget();
    if (!target) return;

    // The health is spent on the commitment, not on the connection — he has
    // already thrown himself into the swing by the time it lands.
    this.owner.stats.health.baseValue = Math.max(
      1,
      this.owner.stats.health.baseValue - HEALTH_COST
    );

    // The damage waits for the axe. It used to land on the cast frame with a
    // generic shard burst painted on the victim, so the ability was a noise and
    // a health bar dropping — no arm, no axe, nothing that read as a swing.
    const swing = new Olaf_E_Swing(this.owner, target);
    this.game.objectManager.addObject(swing);
  }

  _findTarget() {
    const enemies = this.game.objectManager.queryObjects({
      area: new Circle({
        x: this.owner.position.x,
        y: this.owner.position.y,
        r: effectiveRange(this.range, this.owner),
      }),
      filters: [
        PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId),
        PredefinedFilters.visibleTo(this.owner),
      ],
    });
    let nearest = null;
    let nearestDistance = Infinity;
    for (const enemy of enemies) {
      const distance = this.owner.position.dist(enemy.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    }
    return nearest;
  }

  drawPreview() {
    super.drawPreview(effectiveRange(this.range, this.owner));
  }
}


/** He hauls the axe back for this long before it comes down. */
export const WINDUP_MS = 190;

/** The chop itself, from full cock to contact. */
export const CHOP_MS = 110;

export const RECOVER_MS = 240;


/**
 * The dark backing every bright stroke in this swing is drawn over.
 *
 * The chop was white-on-red at 2–5px and it vanished in a fight: over a
 * lit-up teamfight, pale strokes are indistinguishable from every other pale
 * stroke on screen, and this is the biggest single hit in the game — the one
 * effect a player most needs to see land. An outline is what makes a shape
 * legible against an unknown background, which is the same reason Katarina's
 * dagger has one.
 */
const INK: [number, number, number] = [16, 10, 8];

/**
 * The colour of the edge, which is the colour of the number it produces.
 *
 * Reckless Swing deals TRUE damage, and `DAMAGE_TEXT_COLOR.TRUE` is cyan. The
 * cut and the figure that comes off the health bar agreeing is the cheapest
 * legibility there is: the eye that caught the flash already knows what kind of
 * hit it was before it reads the number.
 */
const EDGE: [number, number, number] = [95, 216, 245];


/**
 * Reckless Swing, as a swing.
 *
 * Three beats the player has to be able to read, because this is a melee
 * commitment that costs Olaf health: he hauls the axe back over his shoulder
 * (the tell — the victim gets ~190ms to walk out of 170px), it comes down, and
 * only on contact does anything take damage. The recovery hangs the cut in the
 * air so the trade is legible after the fact.
 *
 * Not an `AoePulse`: the shared shard burst is a *blast*, and this is one man
 * hitting one man with an axe. The cut is a single arc through the body plus
 * Olaf's own blood coming off him, which is the half of the trade that the old
 * version never showed at all.
 */
export class Olaf_E_Swing extends SpellObject {
  /**
   * Over the bodies, not under them.
   *
   * A swing that paints beneath the man it is hitting is a swing nobody sees
   * connect — which is most of what "hard to see in a fight" meant here.
   */
  zIndex = api.layers.SPELL_EFFECT_Z_INDEX;

  target: AttackableUnit;
  age = 0;
  lifeTime = WINDUP_MS + CHOP_MS + RECOVER_MS;
  hasLanded = false;
  /** Frozen at cast: the swing goes where he aimed it, not where they ran to. */
  aim: p5.Vector;

  particleSystem = PredefinedParticleSystems.randomMovingParticlesDecreaseSize('#c8202a', 0.4);

  constructor(owner: AttackableUnit, target: AttackableUnit) {
    super(owner);
    this.target = target;
    this.aim = target.position.copy();
    this.position = owner.position.copy();
  }

  onAdded() {
    this.useParticles(this.particleSystem);
  }

  update() {
    this.age += deltaTime;

    if (!this.hasLanded && this.age >= WINDUP_MS + CHOP_MS) {
      this.hasLanded = true;
      // still track the body, so a target that stepped aside is still hit where
      // it stands — the ability auto-locks, it is not a skillshot
      if (!this.target.isDead && !this.target.toRemove) {
        this.aim = this.target.position.copy();
        this.target.takeDamage(DAMAGE, this.owner, 'TRUE');
      }
      for (let i = 0; i < 14; i++) {
        this.particleSystem.addParticle({
          x: this.aim.x + random(-18, 18),
          y: this.aim.y + random(-18, 18),
          r: random(5, 12),
        });
      }
      // his own blood, thrown off him — the health he just paid
      for (let i = 0; i < 6; i++) {
        this.particleSystem.addParticle({
          x: this.owner.position.x + random(-14, 14),
          y: this.owner.position.y + random(-14, 14),
          r: random(4, 9),
        });
      }
    }

    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw() {
    const ox = this.owner.position.x;
    const oy = this.owner.position.y;
    const heading = Math.atan2(this.aim.y - oy, this.aim.x - ox);
    const reach = Math.min(RANGE, Math.hypot(this.aim.x - ox, this.aim.y - oy) + 24);

    push();
    translate(ox, oy);
    rotate(heading);

    if (this.age < WINDUP_MS) {
      // WINDUP — the axe hauled back over his shoulder, further the closer it
      // gets to coming down
      const k = constrain(this.age / WINDUP_MS, 0, 1);
      const back = -2.1 - k * 0.55;
      push();
      rotate(back);
      this._drawAxe(1.25);
      pop();

      // Where it will fall, and the window to leave. This was a 2px line at a
      // quarter alpha, which is not a warning — it is a hint. A filled wedge
      // that fills up as the clock runs down is something a victim can act on,
      // and the ability costs Olaf health precisely so that they get to.
      noStroke();
      fill(EDGE[0], EDGE[1], EDGE[2], 26 + 44 * k);
      arc(0, 0, reach * 2, reach * 2, -0.55, 0.55, PIE);
      noFill();
      stroke(INK[0], INK[1], INK[2], 150 + 80 * k);
      strokeWeight(6);
      arc(0, 0, reach * 2, reach * 2, -0.55, 0.55);
      stroke(EDGE[0], EDGE[1], EDGE[2], 140 + 110 * k);
      strokeWeight(2.5);
      arc(0, 0, reach * 2, reach * 2, -0.55, 0.55);
      pop();
      return;
    }

    const chop = constrain((this.age - WINDUP_MS) / CHOP_MS, 0, 1);
    // ease-in: an axe accelerates on the way down
    const swept = chop * chop;
    const after = constrain((this.age - WINDUP_MS - CHOP_MS) / RECOVER_MS, 0, 1);
    const fade = 1 - after;

    // the cut: a single crescent carved from the cock angle round to the target
    const from = -2.65;
    const to = 0;
    const edge = from + (to - from) * swept;

    const live = chop < 1 ? 1 : fade;
    const lo = Math.min(from, edge);
    const hi = Math.max(from, edge);
    const span = reach * 1.7;

    noFill();
    // dark first and widest, so the trail has an edge whatever it is over
    stroke(INK[0], INK[1], INK[2], 210 * live);
    strokeWeight(20 * live + 3);
    arc(0, 0, span, span, lo, hi);
    stroke(EDGE[0], EDGE[1], EDGE[2], 170 * live);
    strokeWeight(13 * live + 2);
    arc(0, 0, span, span, lo, hi);
    stroke(255, 253, 250, 250 * live);
    strokeWeight(5 * live + 1);
    arc(0, 0, span, span, lo, hi);

    // the axe itself, riding the leading edge
    if (chop < 1) {
      push();
      rotate(edge);
      this._drawAxe(1.35);
      pop();
    }
    pop();

    // the wound, in world space on the body that took it
    if (this.hasLanded && fade > 0) {
      push();
      translate(this.aim.x, this.aim.y);
      rotate(heading);
      // The moment of contact, and it is the loudest thing here on purpose.
      // A 34px flash on a 33-damage hit — the biggest in the game for its
      // cooldown — was smaller than the health bar it emptied.
      const flash = 1 - constrain(after / 0.34, 0, 1);
      if (flash > 0) {
        noStroke();
        fill(EDGE[0], EDGE[1], EDGE[2], 190 * flash);
        circle(0, 0, 92 * (1 - flash * 0.6));
        fill(255, 253, 250, 245 * flash);
        circle(0, 0, 46 * (1 - flash) + 12);
      }
      // one gash, not a burst: this was an axe, not an explosion
      stroke(INK[0], INK[1], INK[2], 230 * fade);
      strokeWeight(13 * fade + 2);
      line(-30, -16, 30, 16);
      stroke(190, 30, 34, 235 * fade);
      strokeWeight(7 * fade + 1);
      line(-26, -14, 26, 14);
      stroke(255, 235, 228, 220 * fade);
      strokeWeight(3 * fade + 1);
      line(-22, -12, 22, 12);
      pop();
    }
  }

  /**
   * One axe, drawn once, at whatever scale the caller wants it.
   *
   * It was written out twice at two different sizes and two different steel
   * colours, so the weapon he winds up was not the weapon that came down. It is
   * also bigger now: a 54-unit axe swung through a 170-unit arc reads as a
   * spark, and the dark backing is what lets it read at all over a body.
   */
  private _drawAxe(scaleBy: number): void {
    push();
    scale(scaleBy);
    // haft
    stroke(INK[0], INK[1], INK[2], 245);
    strokeWeight(11);
    line(-6, 0, 40, 0);
    stroke(104, 78, 58, 245);
    strokeWeight(7);
    line(-6, 0, 40, 0);

    // head, with its own rim so it does not melt into the haft
    stroke(INK[0], INK[1], INK[2], 245);
    strokeWeight(4);
    fill(214, 224, 238, 250);
    quad(34, -6, 58, -22, 68, 4, 38, 12);
    // the edge itself, in the colour of the damage it deals
    noStroke();
    fill(EDGE[0], EDGE[1], EDGE[2], 210);
    quad(58, -22, 68, 4, 62, 6, 54, -18);
    pop();
  }

  getDisplayBoundingBox() {
    const minX = Math.min(this.owner.position.x, this.aim.x) - RANGE;
    const minY = Math.min(this.owner.position.y, this.aim.y) - RANGE;
    const maxX = Math.max(this.owner.position.x, this.aim.x) + RANGE;
    const maxY = Math.max(this.owner.position.y, this.aim.y) + RANGE;
    return new Rectangle({ x: minX, y: minY, w: maxX - minX, h: maxY - minY, data: this });
  }
}