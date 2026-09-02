import type { AttackableUnit } from '@moba2d/core/content/types';
import { ballFor } from './Orianna_Q';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const Slow = api.buffs.Slow;
const Speedup = api.buffs.Speedup;
const BuffAddType = api.enums.BuffAddType;
const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const AttackableUnitClass = api.units.AttackableUnit;
const GROUND_Z_INDEX = api.layers.GROUND_Z_INDEX;


/**
 * Lệnh: Phát Sóng. The Ball rings, and the pulse happens *where the Ball is* —
 * which is the whole ability. Orianna standing on one side of a fight with her
 * Ball on the other is not a mistake, it is the kit.
 *
 * The field it leaves behind lingers and keeps re-applying to whoever is
 * standing in it, so both the slow and the haste are `RENEW_EXISTING` with
 * their own `stackId`: the default would stack a 30% slow six deep over one
 * linger and glue a champion to the floor.
 *
 * The damage is a pulse, not a zone tick — an enemy pays it once, whether they
 * were caught by the ring or walked into the field afterwards.
 */
export const COOLDOWN_MS = 7_000;

export const MANA_COST = 35;

export const DAMAGE = 26;

export const RADIUS = 200;

export const SLOW_PERCENT = 0.3;

export const SLOW_DURATION_MS = 1_500;

export const SPEEDUP_PERCENT = 0.35;

export const SPEEDUP_DURATION_MS = 1_500;

/** How long the electric field stands after the pulse. */
export const FIELD_DURATION_MS = 900;

export const SLOW_STACK_ID = 'orianna_w_slow';

export const SPEEDUP_STACK_ID = 'orianna_w_speedup';

/** The player-facing name core's death recap groups this damage by. */
export const DAMAGE_LABEL = 'Lệnh: Phát Sóng';

/** How often the standing field re-checks who is inside it. */
const TICK_MS = 150;

const ARC_COUNT = 7;


export default class Orianna_W extends Spell {
  /**
   * Told: a pulse at the ball that damages enemies inside its radius and
   * speeds up allies standing in what it leaves behind.
   */
  static aiRoles = api.enums.SpellRole.Damage | api.enums.SpellRole.Zone | api.enums.SpellRole.Buff;

  targetingMode = 'SELF' as const;
  image = api.asset('spell_orianna_w');
  name = 'Lệnh: Phát Sóng (Orianna_W)';
  description = `Quả Cầu phát ra một xung điện <span class="buff">ngay tại chỗ nó đang đứng</span> trong bán kính <span class="buff">${RADIUS}</span>, gây <span class="damage magic">${DAMAGE} sát thương phép</span> và <span class="buff">Làm Chậm ${pct(SLOW_PERCENT)}%</span> kẻ địch trong <span class="time">${secs(SLOW_DURATION_MS)} giây</span>. Điện trường còn lại <span class="time">${secs(FIELD_DURATION_MS)} giây</span>, cho đồng minh đứng trong đó <span class="buff">+${pct(SPEEDUP_PERCENT)}% tốc chạy</span>.`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;

  onSpellCast(): void {
    const ball = ballFor(this.owner);
    const field = new Orianna_W_Field(this.owner);
    field.position = createVector(ball.position.x, ball.position.y);
    this.game.objectManager.addObject(field);
  }
}


interface FieldArc {
  angle: number;
  reach: number;
  jitter: number;
}


export class Orianna_W_Field extends SpellObject {
  /** A field on the floor: painted under the feet of everyone standing in it. */
  zIndex = GROUND_Z_INDEX;

  position: p5.Vector = this.owner.position.copy();

  /** The radius the damage really uses, and the radius the art is drawn at. */
  radius = RADIUS;

  private age = 0;
  private nextTickAt = 0;
  private readonly damaged = new Set<AttackableUnit>();
  private arcs: FieldArc[] = [];

  onAdded(): void {
    for (let i = 0; i < ARC_COUNT; i++) {
      this.arcs.push({
        angle: (TWO_PI * i) / ARC_COUNT + random(-0.2, 0.2),
        reach: random(0.55, 0.95),
        jitter: random(0.18, 0.42),
      });
    }
  }

  update(): void {
    while (this.nextTickAt <= this.age && this.nextTickAt < FIELD_DURATION_MS) {
      this.pulse();
      this.nextTickAt += TICK_MS;
    }

    this.age += deltaTime;
    if (this.age >= FIELD_DURATION_MS) this.toRemove = true;
  }

  /** Everyone inside, this instant: enemies pay, allies gain. */
  private pulse(): void {
    const area = new Circle({ x: this.position.x, y: this.position.y, r: this.radius });

    // Area damage is never vision gated — the field is real for everyone in it.
    const enemies = this.game.objectManager.queryObjects({
      area,
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    });
    for (const enemy of enemies) {
      if (!this.damaged.has(enemy)) {
        this.damaged.add(enemy);
        enemy.takeDamage(DAMAGE, this.owner, 'MAGIC', DAMAGE_LABEL);
      }

      const slow = new Slow(SLOW_DURATION_MS, this.owner, enemy);
      slow.name = 'Nhiễu Điện';
      slow.stackId = SLOW_STACK_ID;
      slow.buffAddType = BuffAddType.RENEW_EXISTING;
      slow.percent = SLOW_PERCENT;
      enemy.addBuff(slow);
    }

    const allies = this.game.objectManager.queryObjects({
      area,
      filters: [
        PredefinedFilters.type(AttackableUnitClass),
        PredefinedFilters.teamId(this.owner.teamId),
        PredefinedFilters.excludeDead,
      ],
    });
    for (const friend of allies) {
      const haste = new Speedup(SPEEDUP_DURATION_MS, this.owner, friend);
      haste.name = 'Điện Trường';
      haste.stackId = SPEEDUP_STACK_ID;
      haste.buffAddType = BuffAddType.RENEW_EXISTING;
      haste.percent = SPEEDUP_PERCENT;
      friend.addBuff(haste);
    }
  }

  draw(): void {
    const t = constrain(this.age / FIELD_DURATION_MS, 0, 1);
    // 1-(1-t)^2: the ring snaps out to the real radius and then eases
    const opened = 1 - (1 - t) * (1 - t);
    const alpha = 200 * (1 - t * 0.8);
    const hum = 0.6 + 0.4 * sin(this.age / 90);

    push();
    translate(this.position.x, this.position.y);

    // the field itself, at exactly the radius that damages
    noStroke();
    fill(95, 165, 215, 45 * (1 - t));
    circle(0, 0, this.radius * 2);

    noFill();
    stroke(30, 60, 90, alpha);
    strokeWeight(5);
    circle(0, 0, this.radius * 2);
    stroke(190, 240, 255, alpha * hum);
    strokeWeight(2);
    circle(0, 0, this.radius * 2);

    // the pulse leaving the Ball, only in the first fifth
    if (t < 0.2) {
      const burst = t / 0.2;
      stroke(225, 250, 255, 230 * (1 - burst));
      strokeWeight(4 * (1 - burst) + 1);
      circle(0, 0, this.radius * 2 * burst);
    }

    // discharge arcs snapping outward across the field
    stroke(170, 225, 250, alpha * hum);
    strokeWeight(1.8);
    for (const arc of this.arcs) {
      const angle = arc.angle + sin(this.age / 300 + arc.angle) * arc.jitter;
      const span = this.radius * arc.reach * (0.3 + opened * 0.7);
      const mid = span * 0.55;
      const kink = angle + arc.jitter;
      beginShape();
      vertex(0, 0);
      vertex(cos(kink) * mid, sin(kink) * mid);
      vertex(cos(angle) * span, sin(angle) * span);
      endShape();
    }

    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(this.radius * 2 + 40);
  }
}
