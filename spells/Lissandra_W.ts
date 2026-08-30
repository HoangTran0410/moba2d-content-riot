import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { Lissandra_Frostburst } from './Lissandra_Q';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const Root = api.buffs.Root;
const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const GROUND_Z_INDEX = api.layers.GROUND_Z_INDEX;

export const W_DAMAGE = 22;

export const W_ROOT_DURATION_MS = 1_400;

/** The one number this ability is: the ring is drawn at exactly this. */
export const W_RADIUS = 200;

export const W_COOLDOWN_MS = 9_000;

export const W_MANA_COST = 40;

const LABEL = 'Vòng Tròn Lạnh Giá';

/** How long the ring takes to reach `W_RADIUS`, and how long it lingers after. */
const GROW_MS = 220;
const RING_LIFE_MS = 640;

const FROST_PALE: [number, number, number] = [222, 246, 255];
const FROST_DEEP: [number, number, number] = [70, 138, 206];

/**
 * Ring of Frost.
 *
 * Instant, self-centred, and the only thing standing between Lissandra and
 * whoever walked onto her — so the picture's whole job is the *edge*. The ring
 * grows out of her body to `W_RADIUS` in a fifth of a second and then holds
 * there while it fades, drawn at the radius the root actually uses rather than
 * at some comfortable-looking approximation, because a panic button whose
 * boundary lies is worse than one with no art at all.
 */
export default class Lissandra_W extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('spell_lissandra_w');
  name = 'Vòng Tròn Lạnh Giá (Lissandra_W)';
  description =
    `Đóng băng kẻ địch xung quanh trong bán kính <span class="buff">${W_RADIUS}</span>, ` +
    `gây <span class="damage magic">${W_DAMAGE} sát thương phép</span> và ` +
    `<span class="buff">trói chân</span> chúng trong ` +
    `<span class="time">${W_ROOT_DURATION_MS / 1000} giây</span>.`;
  coolDown = W_COOLDOWN_MS;
  manaCost = W_MANA_COST;
  range = W_RADIUS;

  onSpellCast(): void {
    const center = this.owner.position;

    const candidates = this.game.objectManager.queryObjects({
      area: new Circle({ x: center.x, y: center.y, r: W_RADIUS }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    });

    for (const enemy of candidates as AttackableUnit[]) {
      // The quadtree answers with whatever *box* the circle clipped, so the
      // ring's own edge has to be re-tested here or the art and the rule
      // disagree by half a body at the rim.
      const distance = Math.hypot(enemy.position.x - center.x, enemy.position.y - center.y);
      if (distance > W_RADIUS + enemy.collisionRadius) continue;

      enemy.takeDamage(W_DAMAGE, this.owner, 'MAGIC', LABEL);
      enemy.addBuff(new Root(W_ROOT_DURATION_MS, this.owner, enemy));
      this.game.objectManager.addObject(
        new Lissandra_Frostburst(this.owner, enemy.position.x, enemy.position.y, 1)
      );
    }

    const ring = new Lissandra_W_Ring(this.owner, W_RADIUS);
    this.game.objectManager.addObject(ring);
  }

  drawPreview(): void {
    super.drawPreview(W_RADIUS);
  }
}

/**
 * The ring itself. Ground art, so it names the ground layer — a decal that
 * defaults to `SPELL_EFFECT_Z_INDEX` paints over the feet of everyone standing
 * in it, which on this ability is everyone who matters.
 */
export class Lissandra_W_Ring extends SpellObject {
  zIndex = GROUND_Z_INDEX;

  /** Exactly the radius the root used. Not a drawing constant — the rule's own. */
  radius: number;
  /** Where the ring starts: the caster's own body, not a point. */
  bodyRadius: number;

  age = 0;
  spikes: number[] = [];

  constructor(owner: AttackableUnit, radius: number) {
    super(owner);
    this.radius = radius;
    this.bodyRadius = owner.stats.size.value / 2;
    this.position = createVector(owner.position.x, owner.position.y);
  }

  onAdded(): void {
    for (let i = 0; i < 24; i++) this.spikes.push(random(0.5, 1));
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= RING_LIFE_MS) this.toRemove = true;
  }

  draw(): void {
    const grown = constrain(this.age / GROW_MS, 0, 1);
    // snap outward, then stop dead on the line — this is a boundary, not a bloom
    const eased = 1 - (1 - grown) * (1 - grown);
    const edge = this.bodyRadius + (this.radius - this.bodyRadius) * eased;
    const fade = 1 - constrain((this.age - GROW_MS) / (RING_LIFE_MS - GROW_MS), 0, 1);
    const [pr, pg, pb] = FROST_PALE;
    const [dr, dg, db] = FROST_DEEP;

    push();
    translate(this.position.x, this.position.y);

    // the frozen ground inside the ring, faint so the bodies stay readable
    noStroke();
    fill(dr, dg, db, 55 * fade);
    circle(0, 0, edge * 2);

    // the boundary: the one line the player is reading
    noFill();
    stroke(pr, pg, pb, 240 * fade);
    strokeWeight(4);
    circle(0, 0, edge * 2);

    // rime spikes standing on the rim, pointing outward the way the frost went
    stroke(255, 255, 255, 200 * fade);
    strokeWeight(2);
    for (let i = 0; i < this.spikes.length; i++) {
      const a = (TWO_PI / this.spikes.length) * i;
      const outer = edge + 13 * this.spikes[i] * eased;
      line(cos(a) * edge, sin(a) * edge, cos(a) * outer, sin(a) * outer);
    }
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox((this.radius + 24) * 2);
  }
}
