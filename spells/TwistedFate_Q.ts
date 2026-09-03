import type { AttackableUnit } from "@moba2d/core/content/types";
import { api } from "../packApi";

const Spell = api.Spell;
const MissileSpellObject = api.MissileSpellObject;
const VectorUtils = api.utils.VectorUtils;
const TrailSystem = api.helpers.TrailSystem;
const AoePulse = api.AoePulse;
const dmg = api.text.dmg;

/**
 * Phi Bài — a fan of three cards, thrown at once.
 *
 * The ability is the *fan*, not a cone: three independent missiles on three
 * fixed bearings, each piercing everything on its own line. A body standing far
 * out catches one card; a body standing close enough that two bearings still
 * overlap it catches two, and takes the hit twice. That overlap is the whole
 * skill expression of the spell — it is why the numbers per card are small — so
 * nothing here dedupes across cards, only within one.
 */

/** Magic damage one card deals to one body. Two cards on one body is 30. */
export const CARD_DAMAGE = 15;

/** Cards in the fan: the middle one plus one to each side. */
export const CARD_COUNT = 3;

/** Degrees between the middle card and either wing. */
export const FAN_ANGLE_DEG = 22;

/** How far each card flies, on every bearing alike. */
export const RANGE = 600;

export const COOLDOWN_MS = 6_000;

export const MANA_COST = 30;

const DAMAGE_LABEL = "Phi Bài";

/** The arcane violet of his deck in flight — his and nobody else's. */
const CARD_INK: [number, number, number] = [58, 34, 92];
const CARD_EDGE: [number, number, number] = [206, 176, 255];
const CARD_GLOW: [number, number, number] = [168, 120, 235];

export default class TwistedFate_Q extends Spell {
  targetingMode = "DIRECTION" as const;
  image = api.asset("spell_twistedfate_q");
  name = "Phi Bài (TwistedFate_Q)";
  description =
    `Ném ra <span class="buff">${CARD_COUNT} lá bài</span> theo hình rẻ quạt, mỗi lá` +
    ` xuyên qua mọi kẻ địch trên đường bay và gây` +
    ` ${dmg(CARD_DAMAGE, 'MAGIC')}.` +
    ` Kẻ địch đứng đúng chỗ hai lá bài giao nhau sẽ ăn đủ hai lần`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;
  range = RANGE;

  onSpellCast(): void {
    const { from, to } = VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      RANGE,
    );
    const heading = Math.atan2(to.y - from.y, to.x - from.x);
    const spreadRad = (FAN_ANGLE_DEG * Math.PI) / 180;

    for (let index = 0; index < CARD_COUNT; index++) {
      // -1, 0, +1 for three cards; stays centred if the count is ever retuned.
      const lane = index - (CARD_COUNT - 1) / 2;
      const bearing = heading + lane * spreadRad;

      const card = new TwistedFate_Q_Card(this.owner);
      card.position = from.copy();
      card.destination = createVector(
        from.x + Math.cos(bearing) * RANGE,
        from.y + Math.sin(bearing) * RANGE,
      );
      // Each card spins its own way, so three cards read as three objects
      // rather than one wide sprite.
      card.spinSpeed = 0.18 + index * 0.05;
      card.spinPhase = lane * 1.1;
      this.game.objectManager.addObject(card);
    }
  }
}

/**
 * One card. `maxHitCount` stays at `MissileSpellObject`'s default `Infinity`,
 * which is what makes it pierce; the base class's `hitTargets` is what keeps it
 * to one hit per body *per card*.
 */
export class TwistedFate_Q_Card extends MissileSpellObject {
  speed = 9;
  size = 24;

  /** Radians per frame, set per card at cast so the three are not in lockstep. */
  spinSpeed = 0.2;
  spinPhase = 0;

  trailSystem = new TrailSystem({
    maxLength: 14,
    trailSize: this.size * 0.45,
    trailColor: "#A878EB55",
  });

  onAfterMove(): void {
    this.spinPhase += this.spinSpeed;
  }

  onHit(enemy: AttackableUnit): void {
    enemy.takeDamage(CARD_DAMAGE, this.owner, "MAGIC", DAMAGE_LABEL);

    // Rule 3: the hit lands *on the body*, where the player is looking.
    const burst = new AoePulse(this.owner);
    burst.position = enemy.position.copy();
    burst.radius = this.size * 1.4;
    burst.lifeTime = 230;
    burst.color = [...CARD_GLOW];
    burst.fillAlpha = 45;
    this.game.objectManager.addObject(burst);
  }

  draw(): void {
    const width = this.size * 0.7;
    const height = this.size * 1.05;

    push();
    translate(this.position.x, this.position.y);

    // the glow travels with the card, so a card in fog-edge light still reads
    noStroke();
    fill(CARD_GLOW[0], CARD_GLOW[1], CARD_GLOW[2], 50);
    circle(0, 0, this.size * 1.8);

    rotate(this.spinPhase);
    // Foreshortening: the card is spinning end over end, so its face narrows
    // twice per turn instead of staying a rigid rectangle.
    const face = 0.28 + 0.72 * Math.abs(Math.cos(this.spinPhase * 1.6));

    stroke(CARD_EDGE[0], CARD_EDGE[1], CARD_EDGE[2], 235);
    strokeWeight(1.5);
    fill(CARD_INK[0], CARD_INK[1], CARD_INK[2], 240);
    rect(-(width * face) / 2, -height / 2, width * face, height, 3);

    // one pip, so the face has a front and the spin is legible
    noStroke();
    fill(CARD_EDGE[0], CARD_EDGE[1], CARD_EDGE[2], 210 * face);
    quad(
      0,
      -height * 0.22,
      width * face * 0.3,
      0,
      0,
      height * 0.22,
      -width * face * 0.3,
      0,
    );

    pop();
  }
}
