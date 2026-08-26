import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const VectorUtils = api.utils.VectorUtils;
const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const PredefinedParticleSystems = api.helpers.PredefinedParticleSystems;
const SPELL_EFFECT_Z_INDEX = api.layers.SPELL_EFFECT_Z_INDEX;


/**
 * Lệnh: Tấn Công, and the Ball every other Orianna ability is a command to.
 *
 * This module owns the Ball because Q is the command that first puts it
 * somewhere — the same reason `Soraka_Q` owns Rejuvenation and W reads it back.
 * W, E and R all import `ballFor` from here.
 *
 * **The Ball is the champion.** It is one `SpellObject` per Orianna that lives
 * in the world between casts, in one of two states:
 *
 *   - *carried* — riding a champion (Orianna at the start, or whoever E last
 *     named), orbiting their body so it reads as carried and not as stuck to
 *     them;
 *   - *placed* — standing at a fixed point, bobbing.
 *
 * It moves between the two by flying, and a flight is the only time it deals
 * damage: every enemy the sphere sweeps through takes `BALL_PASS_DAMAGE` once
 * per flight. Q ends a flight *placed*; E ends one *carried* by the ally.
 *
 * Dropped from the wiki record deliberately:
 *   - the leash (the real Ball snaps back to Orianna when she walks too far
 *     from it, and pays a Shockwave cooldown for it). Nothing here needs a
 *     tether to stay legible, and a Ball that teleports home mid-fight is one
 *     more invisible rule for a player to lose a duel to;
 *   - Q's 150-unit minimum throw, its "reduced to 70% past the first target"
 *     falloff, and the innate's 0.01s global cooldown — wiki minutiae that a
 *     ~100 point health pool cannot express;
 *   - the passive (Clockwork Windup): this pack's champions ship Q W E R.
 */
export const COOLDOWN_MS = 5_000;

export const MANA_COST = 25;

/** How far from Orianna the Ball may be sent. Also the cast preview radius. */
export const MAX_REACH = 420;

/** How far from a carried champion's centre the Ball rides. */
export const BALL_ORBIT_RADIUS = 26;

/** Units per frame in the air — the same clock `MissileSpellObject` runs on. */
export const BALL_FLIGHT_SPEED = 9;

/** What the sphere costs an enemy it sweeps through. Once per enemy per flight. */
export const BALL_PASS_DAMAGE = 14;

/** The sphere's own half-width — wider than a flight step, so nothing tunnels. */
export const BALL_RADIUS = 13;

/** The player-facing name core's death recap groups the pass-through damage by. */
export const PASS_DAMAGE_LABEL = 'Lệnh: Tấn Công';

/** Radians per millisecond the Ball turns around whoever is carrying it. */
const ORBIT_SPEED = 0.0025;

/** How far the placed Ball rides up and down, purely in the paint. */
const BOB_HEIGHT = 5;

const SPARK_COUNT = 5;


/**
 * One Ball per Orianna, keyed on her.
 *
 * A `WeakMap` rather than a field on the champion: a pack may not add state to
 * a core unit, and the entry has to disappear with the unit rather than pin a
 * dead champion in memory for the rest of the match.
 */
const balls = new WeakMap<AttackableUnit, Orianna_Ball>();


/**
 * Orianna's Ball, created the first time she commands it and reused for the
 * rest of her life. Never call `new Orianna_Ball` outside this function: two
 * Balls is the one bug this whole champion is built to make impossible.
 */
export const ballFor = (owner: AttackableUnit): Orianna_Ball => {
  const existing = balls.get(owner);
  if (existing && !existing.toRemove) return existing;

  const ball = new Orianna_Ball(owner);
  balls.set(owner, ball);
  owner.game.objectManager.addObject(ball);
  return ball;
};


export default class Orianna_Q extends Spell {
  targetingMode = 'POINT' as const;
  image = api.asset('spell_orianna_q');
  name = 'Lệnh: Tấn Công (Orianna_Q)';
  description = `Ra lệnh cho Quả Cầu bay tới vị trí chỉ định và <span class="buff">ở lại đó</span>, gây <span class="damage">${BALL_PASS_DAMAGE} sát thương phép</span> lên mọi kẻ địch nó xuyên qua trên đường bay. Tầm ra lệnh <span class="buff">${MAX_REACH}</span>.`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;
  range = MAX_REACH;

  onSpellCast(): void {
    const { to } = VectorUtils.getVectorWithMaxRange(this.owner.position, this.aimPoint, this.range);
    ballFor(this.owner).commandToPoint(to);
  }

  drawPreview(): void {
    super.drawPreview(this.range);
  }
}


interface BallSpark {
  angle: number;
  length: number;
  /** Turns per unit of the Ball's own spin, signed so the sparks counter-orbit. */
  rate: number;
}


export class Orianna_Ball extends SpellObject {
  /** Above the floor and below the HUD: the Ball is a body, not a decal. */
  zIndex = SPELL_EFFECT_Z_INDEX;

  /** The champion carrying it, or null while it is flying or standing. */
  carrier: AttackableUnit | null = this.owner;

  /** Where it is headed. Non-null exactly while it is in the air. */
  flightTo: p5.Vector | null = null;

  /** The body a flight is homing on, so E still lands on a moving ally. */
  private flightAnchor: AttackableUnit | null = null;

  /** Fired once when a flight lands, then dropped. E hangs its shield here. */
  private onArrive: (() => void) | null = null;

  /** Everyone this *flight* has already swept through. Cleared per command. */
  private readonly flightHits = new Set<AttackableUnit>();

  private orbitAngle = 0;
  private age = 0;
  private sparks: BallSpark[] = [];

  get isFlying(): boolean {
    return this.flightTo !== null;
  }

  get isCarried(): boolean {
    return this.flightTo === null && this.carrier !== null;
  }

  get isPlaced(): boolean {
    return this.flightTo === null && this.carrier === null;
  }

  /** Q: fly to a spot on the ground and stand there. */
  commandToPoint(spot: p5.Vector): void {
    this.beginFlight(spot);
  }

  /**
   * E: fly to an allied champion and ride them from then on.
   *
   * Already on that ally, there is no flight to make — the arrival is now,
   * which is also what stops a self-cast from throwing the Ball off Orianna
   * and back onto her.
   */
  commandToAlly(ally: AttackableUnit, onArrive?: () => void): void {
    if (this.carrier === ally && !this.isFlying) {
      onArrive?.();
      return;
    }
    this.beginFlight(ally.position);
    this.flightAnchor = ally;
    this.onArrive = onArrive ?? null;
  }

  private beginFlight(spot: { x: number; y: number }): void {
    this.carrier = null;
    this.flightAnchor = null;
    this.onArrive = null;
    this.flightHits.clear();
    this.flightTo = createVector(spot.x, spot.y);
  }

  onAdded(): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparks.push({
        angle: (TWO_PI * i) / SPARK_COUNT,
        length: random(4, 10),
        rate: random(1.2, 2.8) * (i % 2 === 0 ? 1 : -1),
      });
    }
  }

  onRemoved(): void {
    if (balls.get(this.owner) === this) balls.delete(this.owner);
    super.onRemoved();
  }

  update(): void {
    // A Ball with no Orianna is a Ball drawing on a corpse forever. It goes
    // with her, and the map entry goes with it so a revive builds a fresh one.
    if (this.owner.isDead || this.owner.toRemove) {
      this.carrier = null;
      this.flightTo = null;
      this.flightAnchor = null;
      this.onArrive = null;
      this.toRemove = true;
      if (balls.get(this.owner) === this) balls.delete(this.owner);
      return;
    }

    this.age += deltaTime;

    if (this.flightTo) {
      this.flyStep();
      return;
    }

    if (this.carrier) {
      // Whoever was carrying it fell over: the Ball keeps their last ground.
      if (this.carrier.isDead || this.carrier.toRemove) {
        this.carrier = null;
        return;
      }
      this.orbitAngle += ORBIT_SPEED * deltaTime;
      this.position.set(
        this.carrier.position.x + cos(this.orbitAngle) * BALL_ORBIT_RADIUS,
        this.carrier.position.y + sin(this.orbitAngle) * BALL_ORBIT_RADIUS
      );
    }
  }

  private flyStep(): void {
    const destination = this.flightTo!;

    // The Ball chases a body, not a snapshot of one, so E still lands on an
    // ally who kept running after the command.
    const anchor = this.flightAnchor;
    if (anchor) {
      if (anchor.isDead || anchor.toRemove) {
        // Nothing left to attach to: the Ball finishes the throw and stands.
        this.flightAnchor = null;
        this.onArrive = null;
      } else {
        destination.set(anchor.position.x, anchor.position.y);
      }
    }

    if (this.position.dist(destination) <= BALL_FLIGHT_SPEED) {
      this.position.set(destination.x, destination.y);
      this.sweep();
      this.land();
      return;
    }

    VectorUtils.moveVectorToVector(this.position, destination, BALL_FLIGHT_SPEED);
    this.sweep();
  }

  private land(): void {
    const arrived = this.onArrive;
    const anchor = this.flightAnchor;
    this.flightTo = null;
    this.flightAnchor = null;
    this.onArrive = null;

    if (anchor) {
      this.carrier = anchor;
      this.orbitAngle = 0;
      this.position.set(
        anchor.position.x + BALL_ORBIT_RADIUS,
        anchor.position.y
      );
    }
    arrived?.();
  }

  /**
   * Everything the sphere is currently overlapping takes the pass-through hit,
   * once per flight. Not vision gated — the sphere is a body moving through the
   * world, and a bush does not stop it.
   */
  private sweep(): void {
    const swept = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: BALL_RADIUS }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    });

    for (const enemy of swept) {
      if (this.flightHits.has(enemy)) continue;
      const reach = BALL_RADIUS + enemy.collisionRadius;
      if (this.position.dist(enemy.position) > reach) continue;

      this.flightHits.add(enemy);
      enemy.takeDamage(BALL_PASS_DAMAGE, this.owner, 'MAGIC', PASS_DAMAGE_LABEL);

      // The strike leaves something on the victim, where it landed.
      const struck = PredefinedParticleSystems.smoke([175, 225, 245], 0.3, 12);
      this.useParticles(struck);
      for (let i = 0; i < 6; i++) {
        const angle = (TWO_PI * i) / 6;
        struck.addParticle({
          x: enemy.position.x + cos(angle) * reach * 0.6,
          y: enemy.position.y + sin(angle) * reach * 0.6,
          size: 9,
          opacity: 210,
        });
      }
    }
  }

  draw(): void {
    // Clockwork, not a fireball: a brass core inside two counter-turning rings,
    // with a shell that only closes up while the Ball is standing still.
    const bob = this.isPlaced ? sin(this.age / 260) * BOB_HEIGHT : 0;
    const spin = this.age / 420;
    const charged = this.isFlying;

    push();
    translate(this.position.x, this.position.y - bob);

    noStroke();
    fill(120, 185, 215, charged ? 70 : 45);
    circle(0, 0, BALL_RADIUS * (charged ? 3.4 : 2.6));

    // outer ring, turning one way
    noFill();
    stroke(45, 80, 105, 210);
    strokeWeight(4);
    circle(0, 0, BALL_RADIUS * 2);
    stroke(190, 235, 250, 225);
    strokeWeight(1.6);
    circle(0, 0, BALL_RADIUS * 2);

    // the gear teeth, which is what makes it read as a machine
    stroke(215, 190, 130, 230);
    strokeWeight(2.5);
    for (let i = 0; i < 6; i++) {
      const angle = spin + (TWO_PI * i) / 6;
      const inner = BALL_RADIUS * 0.95;
      const outer = BALL_RADIUS * 1.3;
      line(cos(angle) * inner, sin(angle) * inner, cos(angle) * outer, sin(angle) * outer);
    }

    // the inner gear, counter-turning: four teeth against the outer six, which
    // is what makes the two rings read as meshing rather than as one shape
    stroke(235, 205, 145, 200);
    strokeWeight(2);
    circle(0, 0, BALL_RADIUS * 1.05);
    for (let i = 0; i < 4; i++) {
      const angle = -spin * 1.7 + (TWO_PI * i) / 4;
      line(0, 0, cos(angle) * BALL_RADIUS * 0.52, sin(angle) * BALL_RADIUS * 0.52);
    }

    // brass core
    noStroke();
    fill(245, 220, 165, 240);
    circle(0, 0, BALL_RADIUS * 0.72);

    // arc sparks, seeded once so they orbit instead of flickering
    stroke(205, 245, 255, 190);
    strokeWeight(1.5);
    for (const spark of this.sparks) {
      const angle = spark.angle + spin * spark.rate;
      const distance = BALL_RADIUS * 1.5;
      line(
        cos(angle) * distance,
        sin(angle) * distance,
        cos(angle) * (distance + spark.length),
        sin(angle) * (distance + spark.length)
      );
    }

    // the shadow underneath, so a placed Ball reads as hovering over ground
    if (this.isPlaced) {
      noStroke();
      fill(20, 35, 45, 70);
      ellipse(0, bob + BALL_RADIUS * 0.9, BALL_RADIUS * 1.6, BALL_RADIUS * 0.6);
    }

    pop();
  }

  getDisplayBoundingBox() {
    // wide enough for the sparks and the glow, not just the sphere
    return this.squareDisplayBoundingBox(BALL_RADIUS * 6);
  }
}
