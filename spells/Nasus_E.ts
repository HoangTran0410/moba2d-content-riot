import { api } from '../packApi';
import { pct, secs } from '../text';

const StatAmp = api.buffs.StatAmp;

const Spell = api.Spell;
const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const SpellObject = api.SpellObject;
const dmg = api.text.dmg;

export const MAX_RANGE = 450;

export const RADIUS = 170;

export const DURATION = 4000;

export const DAMAGE_PER_TICK = 4;

export const TICK_INTERVAL = 500;

/** Share of armour the fire eats off anyone standing in it. */
export const SHRED_PERCENT = 0.2;

/** How long the tear outlives the last tick they took — the record's "lingering". */
export const SHRED_LINGER_MS = 1_000;


export default class Nasus_E extends Spell {
  targetingMode = 'POINT' as const;
  image = api.asset('spell_nasus_e');
  name = 'Lửa Tâm Linh (Nasus_E)';
  description =
    `Gọi một vùng lửa bán kính <span>${RADIUS}px</span> tồn tại <span class="time">${secs(DURATION)} giây</span>,` +
    ` gây ${dmg(DAMAGE_PER_TICK, 'MAGIC')} mỗi <span class="time">${secs(TICK_INTERVAL)} giây</span>` +
    ` cho kẻ địch đứng trong đó và <span class="buff">giảm ${pct(SHRED_PERCENT)}% giáp</span> của chúng` +
    ` (còn <span class="time">${secs(SHRED_LINGER_MS)} giây</span> sau khi rời vùng lửa)`;
  coolDown = 10000;
  manaCost = 30;

  maxRange = MAX_RANGE;

  onSpellCast() {
    const aim = this.aimPoint;
    const position = aim
      .copy()
      .sub(this.owner.position)
      .setMag(Math.min(this.maxRange, aim.dist(this.owner.position)))
      .add(this.owner.position);

    const fire = new Nasus_E_Object(this.owner);
    fire.position = position;
    this.game.objectManager.addObject(fire);
  }

  drawPreview() {
    super.drawPreview(this.maxRange);
  }
}


export class Nasus_E_Object extends SpellObject {
  position: p5.Vector = this.owner.position.copy();
  radius = RADIUS;
  visionRadius = RADIUS;
  lifeTime = DURATION;
  age = 0;
  sinceTick = 0;

  update() {
    this.age += deltaTime;
    this.sinceTick += deltaTime;
    if (this.age >= this.lifeTime) {
      this.toRemove = true;
      return;
    }
    if (this.sinceTick < TICK_INTERVAL) return;
    this.sinceTick -= TICK_INTERVAL;

    const enemies = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    });
    enemies.forEach((enemy: any) => {
      enemy.takeDamage(DAMAGE_PER_TICK, this.owner, 'MAGIC');
      // "inflicting them with armor reduction, lingering for 1 second"
      // (`docs/abilities/nasus/e.json`). Re-applied every tick, so it lasts as
      // long as they stand in it and one second past the last tick they took.
      const torn = new StatAmp(SHRED_LINGER_MS, this.owner, enemy);
      torn.name = 'Rách Giáp';
      torn.stackId = 'nasus_e_shred';
      torn.bonuses = { armor: { percentBonus: -SHRED_PERCENT } };
      enemy.addBuff(torn);
    });
  }

  draw() {
    const t = this.age / this.lifeTime;
    const fade = t > 0.85 ? (1 - t) / 0.15 : 1;

    push();
    translate(this.position.x, this.position.y);
    noStroke();
    fill(255, 140, 40, 40 * fade);
    circle(0, 0, this.radius * 2);
    noFill();
    stroke(255, 190, 90, 170 * fade);
    strokeWeight(3);
    circle(0, 0, this.radius * 2);
    // tongues of flame licking around the rim, wandering with the clock
    noStroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TWO_PI + this.age / 400;
      const d = this.radius * (0.55 + 0.4 * Math.abs(Math.sin(this.age / 220 + i)));
      fill(255, 180 + i * 5, 60, 190 * fade);
      circle(cos(a) * d, sin(a) * d, 12 + 6 * Math.sin(this.age / 130 + i));
    }
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(this.radius * 2);
  }
}