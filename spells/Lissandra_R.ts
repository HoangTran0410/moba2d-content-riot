import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { Lissandra_Frostburst } from './Lissandra_Q';
import { pct, secs } from '../text';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const AreaSpellObject = api.AreaSpellObject;
const Stasis = api.buffs.Stasis;
const Slow = api.buffs.Slow;
const BuffAddType = api.enums.BuffAddType;
const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const GROUND_Z_INDEX = api.layers.GROUND_Z_INDEX;

export const R_STASIS_MS = 2_500;

export const R_HEAL_TICK_MS = 250;

/** Ten beats of healing across the 2.5 seconds she is untouchable. */
export const R_HEAL_TICKS = 10;

/** What a tick is worth at full health — the floor of the missing-health scale. */
export const R_HEAL_PER_TICK_MIN = 4;

/** What a tick is worth on the last sliver of health. */
export const R_HEAL_PER_TICK_MAX = 9;

export const R_FIELD_RADIUS = 260;

export const R_FIELD_DAMAGE = 45;

export const R_FIELD_SLOW_PERCENT = 0.35;

/** How long the ice takes to reach the full radius. */
export const R_FIELD_SPREAD_MS = 1_500;

export const R_FIELD_DURATION_MS = 3_000;

export const R_FIELD_SLOW_TICK_MS = 250;

/** Each tick's slow only has to outlive the next tick — see the stack id below. */
export const R_FIELD_SLOW_DURATION_MS = 500;

/**
 * The field re-slows every 250ms, so `Slow`'s default STACKS_AND_CONTINUE would
 * pile ten 35% slows inside a fifth of a second and pin anybody standing in it
 * outright. `RENEW_EXISTING` under an id of this ability's own is the aura
 * pattern: one slow whose clock keeps being wound, and one that Q's own
 * frostbite can neither evict nor be evicted by.
 */
export const R_FIELD_SLOW_STACK_ID = 'lissandra_r_tomb_field';

export const R_COOLDOWN_MS = 10_000;

export const R_MANA_COST = 90;

const LABEL = 'Hầm Mộ Hàn Băng';

/** The field starts as a crust under her feet, not as a full circle. */
const FIELD_START_RADIUS = 40;

const TOMB_SEAL_MS = 320;

const TOMB_PALE: [number, number, number] = [214, 238, 255];
const TOMB_DEEP: [number, number, number] = [64, 96, 178];
const FIELD_SHEET: [number, number, number] = [96, 150, 214];

/**
 * How hard one tick heals, given the health she had when she pressed it.
 *
 * Exported so the suite can state the rule without restating the arithmetic in
 * two places — but the suite's own probes are written out longhand, because a
 * check that recomputes the rule it is checking agrees with that rule however
 * wrong the rule is.
 */
export const healPerTickFor = (health: number, maxHealth: number): number => {
  const missing = maxHealth > 0 ? constrain(1 - health / maxHealth, 0, 1) : 0;
  return Math.round(R_HEAL_PER_TICK_MIN + (R_HEAL_PER_TICK_MAX - R_HEAL_PER_TICK_MIN) * missing);
};

/** The radius the ice has reached at `elapsedMs`, which is also what it damages at. */
export const fieldRadiusAt = (elapsedMs: number): number =>
  FIELD_START_RADIUS +
  constrain(elapsedMs / R_FIELD_SPREAD_MS, 0, 1) * (R_FIELD_RADIUS - FIELD_START_RADIUS);

/**
 * Frozen Tomb — self-cast only.
 *
 * The wiki's version is dual-mode: on an enemy champion it is a stun, on
 * herself it is the stasis. **The enemy half is deliberately not shipped.** A
 * `targeting: 'UNIT'` spell in this engine must declare exactly one
 * `targetTeam`, and the setting that would let one button address both is
 * `'ANY'` — which is the setting that has shipped four separate bugs in this
 * repository, because with the cursor on empty ground the nearest-target
 * fallback resolves *the caster* and the spell fires on her. Faced with "ship
 * the half the kit is actually about, or ship the bug", this ships the half:
 * `targeting: 'SELF'`, no resolver, no fallback, nothing to mis-resolve.
 *
 * What that half is: she entombs herself for 2.5 seconds — untargetable, taking
 * no damage, unable to act — healing on a 250ms beat whose size is fixed at the
 * moment of the cast by how much health she was missing. At the same time a
 * sheet of ice spreads out of her over a second and a half and lingers,
 * biting each enemy it reaches once and holding them slowed while they stand
 * in it.
 *
 * Two objects, because they are two different things and the VFX standard says
 * a zone that behaves differently has to look different: `Lissandra_R_Tomb` is
 * a shell of spires that closes over her body and reads out the clock, and
 * `Lissandra_R_Field` is a flat sheet on the ground whose growing edge is the
 * boundary of the damage.
 */
export default class Lissandra_R extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('spell_lissandra_r');
  name = 'Hầm Mộ Hàn Băng (Lissandra_R)';
  description =
    `Tự phong ấn bản thân trong băng <span class="time">${secs(R_STASIS_MS)} giây</span>: ` +
    '<span class="buff">không thể bị chọn làm mục tiêu và không nhận sát thương</span>, ' +
    `đồng thời hồi <span class="buff">${R_HEAL_PER_TICK_MIN}–${R_HEAL_PER_TICK_MAX} máu mỗi ` +
    `${secs(R_HEAL_TICK_MS)} giây</span> (càng mất nhiều máu, hồi càng nhiều). ` +
    `Một trận địa băng lan rộng ra bán kính <span class="buff">${R_FIELD_RADIUS}</span> trong ` +
    `<span class="time">${secs(R_FIELD_SPREAD_MS)} giây</span> và tồn tại ` +
    `<span class="time">${secs(R_FIELD_DURATION_MS)} giây</span>, gây ` +
    `<span class="damage magic">${R_FIELD_DAMAGE} sát thương phép</span> một lần cho mỗi kẻ địch và ` +
    `<span class="buff">làm chậm ${pct(R_FIELD_SLOW_PERCENT)}%</span> khi chúng còn đứng trong đó.`;
  coolDown = R_COOLDOWN_MS;
  manaCost = R_MANA_COST;
  range = R_FIELD_RADIUS;

  onSpellCast(): void {
    // Read before the buff lands: the size of the heal is a fact about the
    // moment she pressed it, not something that keeps re-deciding itself.
    const healPerTick = healPerTickFor(
      this.owner.stats.health.value,
      this.owner.stats.maxHealth.value
    );

    const stasis = new Stasis(R_STASIS_MS, this.owner, this.owner);
    stasis.image = this.image;
    this.owner.addBuff(stasis);

    // Attached to the buff rather than merely to the body: whatever ends the
    // stasis early ends the shell and the healing with it, so the picture and
    // the rule can never disagree about whether she is still untouchable.
    const tomb = new Lissandra_R_Tomb(this.owner, healPerTick);
    tomb.attachTo(this.owner, stasis);
    this.game.objectManager.addObject(tomb);

    const field = new Lissandra_R_Field(this.owner, {
      x: this.owner.position.x,
      y: this.owner.position.y,
    });
    this.game.objectManager.addObject(field);
  }

  drawPreview(): void {
    super.drawPreview(R_FIELD_RADIUS);
  }
}

/**
 * The shell: spires of ice closing over her, with the clock read off how far
 * they have thawed back down. Drawn as an outline, because the champion inside
 * it is what everyone standing over the statue is looking at and a solid body
 * would hide the very unit whose state it reports.
 */
export class Lissandra_R_Tomb extends SpellObject {
  /** Fixed at the cast, from the health she was missing. */
  healPerTick: number;
  healTicksDone = 0;

  age = 0;
  private sinceTickMs = 0;
  spires: number[] = [];

  constructor(owner: AttackableUnit, healPerTick: number) {
    super(owner);
    this.healPerTick = healPerTick;
  }

  onAdded(): void {
    for (let i = 0; i < 7; i++) this.spires.push(random(0.7, 1));
  }

  update(): void {
    if (this.toRemove) return;
    if (this.dropIfAttachmentLost()) return;

    this.age += deltaTime;
    this.position.set(this.owner.position.x, this.owner.position.y);

    this.sinceTickMs += deltaTime;
    while (this.sinceTickMs >= R_HEAL_TICK_MS && this.healTicksDone < R_HEAL_TICKS) {
      this.sinceTickMs -= R_HEAL_TICK_MS;
      this.healTicksDone += 1;
      this.owner.takeHeal(this.healPerTick, this.owner);
    }

    if (this.age >= R_STASIS_MS) this.toRemove = true;
  }

  draw(): void {
    const sealed = constrain(this.age / TOMB_SEAL_MS, 0, 1);
    const closed = 1 - (1 - sealed) * (1 - sealed);
    const left = constrain(1 - this.age / R_STASIS_MS, 0, 1);
    // one bright beat on each heal, so the healing is visible rather than a number
    const beat = 1 - constrain((this.sinceTickMs / R_HEAL_TICK_MS) * 1.6, 0, 1);
    const body = this.owner.animatedValues.displaySize;
    const [pr, pg, pb] = TOMB_PALE;
    const [dr, dg, db] = TOMB_DEEP;

    push();
    translate(this.position.x, this.position.y);

    // the floor of the tomb, a disc of rime under her feet
    noStroke();
    fill(dr, dg, db, 90);
    circle(0, 0, body * 1.25 * closed);

    // the spires, standing up around her and shrinking back as the clock runs
    stroke(pr, pg, pb, 235);
    strokeWeight(3);
    noFill();
    for (let i = 0; i < this.spires.length; i++) {
      const a = (TWO_PI / this.spires.length) * i - HALF_PI;
      const foot = body * 0.5;
      const tip = body * (0.55 + 0.55 * this.spires[i] * left) * closed;
      const lean = 0.16;
      beginShape();
      vertex(cos(a - lean) * foot, sin(a - lean) * foot);
      vertex(cos(a) * (foot + tip), sin(a) * (foot + tip));
      vertex(cos(a + lean) * foot, sin(a + lean) * foot);
      endShape();
    }

    // the clock itself: an arc that unwinds, plus the heal beat inside it
    stroke(255, 255, 255, 200);
    strokeWeight(4);
    arc(0, 0, body * 1.5, body * 1.5, -HALF_PI, -HALF_PI + TWO_PI * left);
    if (beat > 0) {
      noStroke();
      fill(180, 255, 226, 150 * beat);
      circle(0, 0, body * (0.9 + 0.5 * (1 - beat)));
    }
    pop();
  }

  getDisplayBoundingBox() {
    const reach = this.owner.animatedValues.displaySize + 40;
    return this.squareDisplayBoundingBox(reach * 2);
  }
}

/**
 * The sheet of ice. Ground art, so it names the ground layer — otherwise a
 * `SpellObject` subclass resolves to `SPELL_EFFECT_Z_INDEX` and paints over the
 * feet of everyone caught standing in it, which is everyone this half is about.
 */
export class Lissandra_R_Field extends AreaSpellObject {
  zIndex = GROUND_Z_INDEX;

  /** Damage is once per enemy per cast, so the bite is remembered. */
  private readonly bitten = new Set<AttackableUnit>();
  private veins: number[] = [];

  constructor(owner: AttackableUnit, center: { x: number; y: number }) {
    super(owner, center, FIELD_START_RADIUS, {
      candidates: () =>
        this.game.objectManager.queryObjects({
          area: new Circle({ x: center.x, y: center.y, r: R_FIELD_RADIUS }),
          filters: [PredefinedFilters.canTakeDamageFromTeam(owner.teamId)],
        }),
      radiusAt: fieldRadiusAt,
      durationMs: R_FIELD_DURATION_MS,
      tickEveryMs: R_FIELD_SLOW_TICK_MS,
      onEnter: target => this.reach(target),
      onTick: target => this.chill(target),
    });
    for (let i = 0; i < 14; i++) this.veins.push(0.35 + (i % 5) * 0.13);
  }

  /** First contact: the bite lands once, and the chill starts immediately. */
  private reach(target: AttackableUnit): void {
    this.chill(target);
    if (this.bitten.has(target)) return;
    this.bitten.add(target);

    target.takeDamage(R_FIELD_DAMAGE, this.owner, 'MAGIC', LABEL);
    this.game.objectManager.addObject(
      new Lissandra_Frostburst(this.owner, target.position.x, target.position.y, 1.5)
    );
  }

  private chill(target: AttackableUnit): void {
    const slow = new Slow(R_FIELD_SLOW_DURATION_MS, this.owner, target);
    slow.percent = R_FIELD_SLOW_PERCENT;
    slow.buffAddType = BuffAddType.RENEW_EXISTING;
    slow.stackId = R_FIELD_SLOW_STACK_ID;
    target.addBuff(slow);
  }

  draw(): void {
    const settling = constrain(this.elapsedMs / R_FIELD_SPREAD_MS, 0, 1);
    const ending = constrain(
      (this.elapsedMs - (R_FIELD_DURATION_MS - 500)) / 500,
      0,
      1
    );
    const fade = 1 - ending;
    const edge = this.radius;
    const [sr, sg, sb] = FIELD_SHEET;
    const [pr, pg, pb] = TOMB_PALE;

    push();
    translate(this.center.x, this.center.y);

    // the sheet: flat, faint, and exactly as wide as the damage
    noStroke();
    fill(sr, sg, sb, 70 * fade);
    circle(0, 0, edge * 2);

    // frost veins running outward from her, the direction the ice travelled
    stroke(pr, pg, pb, 130 * fade);
    strokeWeight(2);
    for (let i = 0; i < this.veins.length; i++) {
      const a = (TWO_PI / this.veins.length) * i;
      const inner = edge * 0.18;
      const outer = edge * (0.6 + 0.4 * this.veins[i]);
      line(cos(a) * inner, sin(a) * inner, cos(a) * outer, sin(a) * outer);
      // one fork per vein, so the sheet reads as crystal rather than as a wheel
      const fork = a + 0.22;
      line(cos(a) * outer, sin(a) * outer, cos(fork) * (outer + edge * 0.12), sin(fork) * (outer + edge * 0.12));
    }

    // the growing rim: the one boundary the player has to read
    noFill();
    stroke(235, 250, 255, (110 + 120 * (1 - settling)) * fade);
    strokeWeight(3);
    circle(0, 0, edge * 2);
    pop();
  }
}
