import { api } from '../packApi';
import { secs } from '../text';
import { isInsanityPotionUp, POISON_WOUND_MS, POISON_WOUND_PERCENT } from './Singed_R';

const Spell = api.Spell;
const Rectangle = api.utils.Quadtree.Rectangle;
const SpellObject = api.SpellObject;
const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const DamageOverTime = api.buffs.DamageOverTime;
const HealCut = api.buffs.HealCut;

export const DURATION = 6000;

export const CLOUD_RADIUS = 90;

export const CLOUD_LIFETIME = 1800;

export const DROP_INTERVAL = 220;

export const POISON_PER_TICK = 3;


export default class Singed_Q extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('spell_singed_q');
  name = 'Phun Khói Độc (Singed_Q)';
  description =
    `Rải khí độc phía sau trong <span class="time">${secs(DURATION)} giây</span>. Kẻ địch đi qua vệt độc bị` +
    ` <span class="damage magic">nhiễm độc ${POISON_PER_TICK} sát thương phép</span> mỗi nhịp`;
  coolDown = 10000;
  manaCost = 30;

  onSpellCast() {
    this.game.objectManager.addObject(new Singed_Q_Trail(this.owner));
  }
}


/** The emitter, not the gas: it walks with Singed and drops clouds behind him. */
export class Singed_Q_Trail extends SpellObject {
  lifeTime = DURATION;
  age = 0;
  sinceDrop = DROP_INTERVAL;

  update() {
    this.position = this.owner.position.copy();
    this.age += deltaTime;
    this.sinceDrop += deltaTime;
    if (this.age >= this.lifeTime || this.owner.isDead) {
      this.toRemove = true;
      return;
    }
    if (this.sinceDrop < DROP_INTERVAL) return;
    this.sinceDrop = 0;

    const cloud = new Singed_Q_Cloud(this.owner);
    cloud.position = this.owner.position.copy();
    this.game.objectManager.addObject(cloud);
  }

  draw() {}

  getDisplayBoundingBox() {
    return new Rectangle({ x: this.position.x, y: this.position.y, w: 1, h: 1, data: this });
  }
}


export class Singed_Q_Cloud extends SpellObject {
  position: p5.Vector = this.owner.position.copy();
  radius = CLOUD_RADIUS;
  visionRadius = CLOUD_RADIUS;
  lifeTime = CLOUD_LIFETIME;
  age = 0;
  sinceTick = 0;
  seed = Math.random() * 1000;

  update() {
    this.age += deltaTime;
    this.sinceTick += deltaTime;
    if (this.age >= this.lifeTime) {
      this.toRemove = true;
      return;
    }
    if (this.sinceTick < 400) return;
    this.sinceTick -= 400;

    const enemies = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    });
    enemies.forEach((enemy: any) => {
      const poison = new DamageOverTime(1200, this.owner, enemy);
      poison.stackId = 'singed_q_poison';
      poison.name = 'Độc Dược';
      poison.damagePerTick = POISON_PER_TICK;
      poison.tickInterval = 400;
      poison.flameColor = [200, 140, 255];
      poison.emberColor = [70, 30, 120];
      enemy.addBuff(poison);

      // Insanity Potion turns the trail from damage into an answer to a
      // healer: while it is up, the poison wounds as well as burns
      // (`docs/abilities/singed/r.json`). Refreshed by every drop, so it lasts
      // as long as they keep standing in the gas and a beat past the last one.
      if (!isInsanityPotionUp(this.owner)) return;
      const wound = new HealCut(POISON_WOUND_MS, this.owner, enemy);
      wound.healCut = POISON_WOUND_PERCENT;
      enemy.addBuff(wound);
    });
  }

  draw() {
    const t = this.age / this.lifeTime;
    const fade = 1 - t;
    push();
    translate(this.position.x, this.position.y);
    noStroke();
    for (let i = 0; i < 4; i++) {
      const a = this.seed + i * 1.6 + this.age / 600;
      fill(160, 110, 210, 70 * fade);
      circle(cos(a) * 18, sin(a) * 18, this.radius * (1.1 + 0.2 * i * t));
    }
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(this.radius * 2);
  }
}