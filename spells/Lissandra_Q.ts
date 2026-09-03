import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const MissileSpellObject = api.MissileSpellObject;
const TrailSystem = api.helpers.TrailSystem;
const VectorUtils = api.utils.VectorUtils;
const Slow = api.buffs.Slow;
const BuffAddType = api.enums.BuffAddType;
const dmg = api.text.dmg;

export const Q_DAMAGE = 18;

export const Q_SLOW_PERCENT = 0.28;

export const Q_SLOW_DURATION_MS = 1_500;

/** How far the narrow dart flies before it runs out on its own. */
export const Q_RANGE = 300;

/** How much further the shattered spray carries, measured from the impact. */
export const Q_SHATTER_RANGE = 170;

export const Q_COOLDOWN_MS = 5_000;

export const Q_MANA_COST = 25;

/**
 * Its own slot, so two casts of Q renew one slow rather than piling a second
 * onto the first, and so Lissandra's R field — which slows too, on its own
 * clock — cannot evict it or be evicted by it.
 */
export const Q_SLOW_STACK_ID = 'lissandra_q_frostbite';

const LABEL = 'Mảnh Băng';

/** The dart: thin enough to miss with, which is what makes the shatter a reward. */
const SHARD_SIZE = 26;
const SHARD_SPEED = 13;

/** The spray: three times the dart's width and half again its speed. */
const SHATTER_SIZE = 76;
const SHATTER_SPEED = 19;

const ICE_CORE: [number, number, number] = [186, 240, 255];
const ICE_DEEP: [number, number, number] = [58, 122, 200];

/**
 * Ice Shard.
 *
 * A narrow dart that shatters on the first body it touches into a broad spray
 * of splinters carrying further down the same line. The two halves are two
 * `SpellObject`s rather than one that changes shape, because they behave
 * differently — the dart dies on one target, the spray pierces — and the VFX
 * standard's rule 2 says a zone that behaves differently has to look
 * differently. So the dart is a single blue needle and the spray is a fan of
 * pale splinters at three times the width.
 */
export default class Lissandra_Q extends Spell {
  targetingMode = 'DIRECTION' as const;
  image = api.asset('spell_lissandra_q');
  name = 'Mảnh Băng (Lissandra_Q)';
  description =
    `Phóng một mũi băng gây ${dmg(Q_DAMAGE, 'MAGIC')} và ` +
    `<span class="buff">làm chậm ${pct(Q_SLOW_PERCENT)}%</span> trong ` +
    `<span class="time">${secs(Q_SLOW_DURATION_MS)} giây</span>. Khi trúng mục tiêu đầu tiên, ` +
    `mũi băng <span class="buff">vỡ tan</span> thành một luồng mảnh vụn rộng và nhanh hơn, ` +
    `bay thêm <span class="buff">${Q_SHATTER_RANGE} tầm</span> và gây sát thương cho những kẻ địch phía sau.`;
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_MANA_COST;
  range = Q_RANGE;

  onSpellCast(): void {
    const { from, to } = VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      this.range
    );

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;

    const shard = new Lissandra_Q_Shard(this.owner);
    shard.position = from;
    shard.destination = to;
    shard.headingX = dx / length;
    shard.headingY = dy / length;
    this.game.objectManager.addObject(shard);
  }
}

/** Damage plus the chill, written once so both passes bite identically. */
function frostbite(enemy: AttackableUnit, owner: AttackableUnit): void {
  enemy.takeDamage(Q_DAMAGE, owner, 'MAGIC', LABEL);

  // RENEW_EXISTING with an id of its own: `Slow`'s default is
  // STACKS_AND_CONTINUE ten deep, so a second Q landing inside the first one's
  // 1.5 seconds would turn 28% into a standstill.
  const slow = new Slow(Q_SLOW_DURATION_MS, owner, enemy);
  slow.percent = Q_SLOW_PERCENT;
  slow.buffAddType = BuffAddType.RENEW_EXISTING;
  slow.stackId = Q_SLOW_STACK_ID;
  enemy.addBuff(slow);

  const burst = new Lissandra_Frostburst(owner, enemy.position.x, enemy.position.y, 1);
  owner.game.objectManager.addObject(burst);
}

/**
 * The dart. One body and it is gone — `maxHitCount = 1` — but on the way out it
 * hands its heading to the spray, which is the whole trick of the ability.
 */
export class Lissandra_Q_Shard extends MissileSpellObject {
  speed = SHARD_SPEED;
  size = SHARD_SIZE;
  maxHitCount = 1;

  headingX = 1;
  headingY = 0;

  trailSystem = new TrailSystem({
    maxLength: 10,
    trailColor: '#7cc8ff88',
    trailSize: 7,
    trailLifeTime: 240,
  });

  onHit(enemy: AttackableUnit): void {
    frostbite(enemy, this.owner);

    const spray = new Lissandra_Q_Shatter(this.owner);
    spray.position = createVector(this.position.x, this.position.y);
    spray.destination = createVector(
      this.position.x + this.headingX * Q_SHATTER_RANGE,
      this.position.y + this.headingY * Q_SHATTER_RANGE
    );
    spray.headingX = this.headingX;
    spray.headingY = this.headingY;
    // Seeded with the body it shattered on: the spray is a *fresh* set of
    // victims, and `queryEnemies` excludes whatever is already in `hitTargets`.
    spray.hitTargets.push(enemy);
    this.game.objectManager.addObject(spray);
  }

  draw(): void {
    const angle = Math.atan2(this.headingY, this.headingX);
    const [cr, cg, cb] = ICE_CORE;
    const [dr, dg, db] = ICE_DEEP;

    push();
    translate(this.position.x, this.position.y);
    rotate(angle);

    // a needle: long, thin, pointed the way it flies
    noStroke();
    fill(dr, dg, db, 200);
    quad(this.size * 0.6, 0, -this.size * 0.25, this.size * 0.2, -this.size * 0.5, 0, -this.size * 0.25, -this.size * 0.2);
    fill(cr, cg, cb, 240);
    quad(this.size * 0.5, 0, -this.size * 0.1, this.size * 0.08, -this.size * 0.3, 0, -this.size * 0.1, -this.size * 0.08);

    // one bright glint at the tip, so the point of the needle is the focal point
    fill(255, 255, 255, 220);
    circle(this.size * 0.42, 0, 5);
    pop();
  }
}

/**
 * The spray. Wider, faster, pierces everything, and dies at the extra reach.
 *
 * Deliberately not a bigger copy of the dart: a fan of splinters against a
 * needle is the difference a player has to read at a glance to know the ability
 * has already connected once.
 */
export class Lissandra_Q_Shatter extends MissileSpellObject {
  speed = SHATTER_SPEED;
  size = SHATTER_SIZE;
  maxHitCount = Infinity;

  headingX = 1;
  headingY = 0;

  /** Seeded once, in `onAdded` — `random()` inside `draw()` re-rolls per frame. */
  splinters: { offset: number; reach: number; tilt: number }[] = [];

  trailSystem = new TrailSystem({
    maxLength: 8,
    trailColor: '#cfeaff55',
    trailSize: 22,
    trailLifeTime: 200,
  });

  onAdded(): void {
    super.onAdded();
    for (let i = 0; i < 9; i++) {
      this.splinters.push({
        offset: random(-0.45, 0.45),
        reach: random(0.5, 1),
        tilt: random(-0.5, 0.5),
      });
    }
  }

  onHit(enemy: AttackableUnit): void {
    frostbite(enemy, this.owner);
  }

  draw(): void {
    const angle = Math.atan2(this.headingY, this.headingX);
    const half = this.size / 2;
    const [cr, cg, cb] = ICE_CORE;
    const [dr, dg, db] = ICE_DEEP;

    push();
    translate(this.position.x, this.position.y);
    rotate(angle);

    // the wedge of the spray, so the width the damage really uses is visible
    noStroke();
    fill(dr, dg, db, 90);
    triangle(-half * 0.9, 0, half * 0.3, -half, half * 0.3, half);

    // the splinters themselves, each a thin shard leaning off the line
    for (const splinter of this.splinters) {
      const across = splinter.offset * this.size;
      const along = half * 0.35 * splinter.reach;
      push();
      translate(along, across);
      rotate(splinter.tilt);
      fill(cr, cg, cb, 225);
      triangle(10 * splinter.reach, 0, -7, 3.5, -7, -3.5);
      pop();
    }

    // the leading edge, one clear line rather than a second glow
    noFill();
    stroke(235, 250, 255, 200);
    strokeWeight(2);
    arc(-half * 0.15, 0, this.size * 1.1, this.size * 1.5, -0.95, 0.95);
    pop();
  }
}

/**
 * The connect, shared by all four of Lissandra's abilities: a hard white flash
 * and a ring of splintering ice on the body that was hit, where it was hit.
 *
 * One motif across the kit rather than four, because the VFX standard's rule 6
 * is that few clear layers beat many pretty ones — and because "Lissandra
 * touched this unit" should read the same whichever button did it.
 */
export class Lissandra_Frostburst extends SpellObject {
  lifeTime = 300;
  age = 0;
  /** 1 for an ability hit, larger for the ultimate's heavier bite. */
  spread: number;
  shards: number[] = [];

  constructor(owner: AttackableUnit, x: number, y: number, spread: number) {
    super(owner);
    this.position = createVector(x, y);
    this.spread = spread;
  }

  onAdded(): void {
    for (let i = 0; i < 7; i++) this.shards.push(random(0.55, 1));
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    const fade = 1 - t;
    // snap out, then hang: 1-(1-t)^2 is the whole motion
    const opened = 1 - (1 - t) * (1 - t);
    const reach = 34 * this.spread * opened;
    const [cr, cg, cb] = ICE_CORE;

    push();
    translate(this.position.x, this.position.y);

    const flash = 1 - constrain(t / 0.28, 0, 1);
    if (flash > 0) {
      noStroke();
      fill(255, 255, 255, 225 * flash);
      circle(0, 0, 16 * this.spread * (1 - flash) + 8);
    }

    noFill();
    stroke(cr, cg, cb, 230 * fade);
    strokeWeight(3 * fade + 1);
    circle(0, 0, reach * 2);

    stroke(255, 255, 255, 210 * fade);
    strokeWeight(2 * fade + 1);
    for (let i = 0; i < this.shards.length; i++) {
      const a = (TWO_PI / this.shards.length) * i;
      const inner = reach * 0.45;
      const outer = reach * this.shards[i];
      line(cos(a) * inner, sin(a) * inner, cos(a) * outer, sin(a) * outer);
    }
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(90 * this.spread);
  }
}
