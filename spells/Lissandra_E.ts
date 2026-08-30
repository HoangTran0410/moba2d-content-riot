import type { AttackableUnit, CastContext } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { Lissandra_Frostburst } from './Lissandra_Q';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const MissileSpellObject = api.MissileSpellObject;
const TrailSystem = api.helpers.TrailSystem;
const VectorUtils = api.utils.VectorUtils;
const Rectangle = api.utils.Quadtree.Rectangle;

export const E_DAMAGE = 20;

export const E_RANGE = 420;

/** How long the claw takes to shed its speed. Roughly its whole flight. */
export const E_FLIGHT_MS = 1_100;

/** The claw stays recastable for a moment after it sinks into the ground. */
export const E_CLAW_LINGER_MS = 250;

/** The recast window opens here, so a press cannot both send and spend a claw. */
export const E_RECAST_DELAY_MS = 300;

export const E_CLAW_SPEED_START = 11;

export const E_CLAW_SPEED_END = 3.5;

export const E_COOLDOWN_MS = 10_000;

export const E_MANA_COST = 45;

const LABEL = 'Con Đường Băng Giá';

const CLAW_SIZE = 62;

const CLAW_PALE: [number, number, number] = [206, 240, 255];
const CLAW_DEEP: [number, number, number] = [46, 104, 178];

/**
 * Glacial Path — the ability the champion is here for.
 *
 * The claw is a real object the spell keeps a reference to, and the recast
 * spends it: Lissandra blinks onto wherever it has got to and its flight ends
 * there. The window is held open the way `Zed_W` holds its swap open — the
 * first cast writes `currentCooldown` down to the recast delay rather than to
 * the real cooldown, so the button is genuinely unpressable for those 300ms and
 * genuinely pressable afterwards, with the runtime doing the counting. Only
 * when the claw dies unspent does `onUpdate` start the real cooldown.
 *
 * **The blink is `blinkOwnerTo`, never a `Dash`.** That is one gate rather than
 * two: it is the single place a spell may relocate its caster, it refuses while
 * grounded (in which case the claw is kept, not wasted), and it moves the body
 * in one write plus a displacement instead of sliding it across the ground the
 * way a dash would. The art has to agree — she shatters where she stood and
 * reforms at the claw, and `Lissandra_E_Blink` draws exactly those two moments.
 */
export default class Lissandra_E extends Spell {
  targetingMode = 'DIRECTION' as const;
  image = api.asset('spell_lissandra_e');
  name = 'Con Đường Băng Giá (Lissandra_E)';
  description =
    `Phóng một vuốt băng bay tới, chậm dần trong <span class="time">${E_FLIGHT_MS / 1000} giây</span> ` +
    `và gây <span class="damage magic">${E_DAMAGE} sát thương phép</span> cho mọi kẻ địch nó xuyên qua. ` +
    `<span class="buff">Kích hoạt lại</span> khi vuốt băng còn sống để ` +
    `<span class="buff">dịch chuyển</span> tới vị trí của nó.`;
  coolDown = E_COOLDOWN_MS;
  manaCost = E_MANA_COST;
  range = E_RANGE;

  /** The live claw, or null. This is the whole of the recast's state. */
  claw: Lissandra_E_Claw | null = null;

  /**
   * The blink is the second half of **one** ability, so it is billed once — at
   * the throw.
   *
   * This spell drives its own recast (a second real press against a shortened
   * `currentCooldown`) rather than the runtime's `RECAST` activation, because
   * the window it wants is "while that object is alive", which no
   * `maxDurationMs` can state. The price of doing it by hand is that
   * `Spell.commitResource` cannot tell the two presses apart and charged the
   * full cost for both — 90 mana for an ability whose tooltip says 45.
   *
   * It cannot be a getter: `Spell` declares `manaCost` as a class field, and
   * native field semantics *define* an own property on the instance, which
   * would shadow any accessor a subclass put on the prototype. `Soraka_W` sets
   * `healthCost` from `press()` for exactly this reason.
   */
  press(context: CastContext): boolean {
    this.manaCost = this.claw ? 0 : E_MANA_COST;
    return super.press(context);
  }

  onSpellCast(): void {
    if (!this.claw) {
      const { from, to } = VectorUtils.getVectorWithRange(
        this.owner.position,
        this.aimPoint,
        this.range
      );

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;

      const claw = new Lissandra_E_Claw(this.owner);
      claw.position = from;
      claw.destination = to;
      claw.headingX = dx / length;
      claw.headingY = dy / length;
      this.claw = claw;
      this.game.objectManager.addObject(claw);

      // The recast window, not a cooldown — deliberately not run through
      // `reducedCooldown`, because CDR must not shorten the beat between the
      // two halves of one ability.
      this.currentCooldown = E_RECAST_DELAY_MS;
      return;
    }

    const claw = this.claw;
    const fromX = this.owner.position.x;
    const fromY = this.owner.position.y;
    const toX = claw.position.x;
    const toY = claw.position.y;

    // Grounded refuses the blink. The claw is kept and stays spendable, so the
    // recast is held rather than thrown away.
    if (!this.blinkOwnerTo(toX, toY)) return;

    this.game.objectManager.addObject(
      new Lissandra_E_Blink(this.owner, fromX, fromY, toX, toY)
    );

    claw.toRemove = true;
    this.claw = null;
    this.currentCooldown = this.reducedCooldown(this.coolDown);
  }

  onUpdate(): void {
    // The claw ran out unspent: the window shuts and the real cooldown starts.
    if (this.claw?.toRemove) {
      this.claw = null;
      this.currentCooldown = this.reducedCooldown(this.coolDown);
    }
  }
}

/**
 * The claw: three talons of ice riding a widening frost path, shedding speed
 * the whole way so the recast target drifts to a stop rather than being
 * snatched away at a constant clip.
 */
export class Lissandra_E_Claw extends MissileSpellObject {
  speed = E_CLAW_SPEED_START;
  size = CLAW_SIZE;
  maxHitCount = Infinity;
  /** It sinks rather than vanishing on arrival, and stays recastable while it does. */
  removeOnArrive = false;

  headingX = 1;
  headingY = 0;
  age = 0;

  trailSystem = new TrailSystem({
    maxLength: 18,
    trailColor: '#6fb6f066',
    trailSize: 20,
    trailLifeTime: 420,
  });

  update(): void {
    this.age += deltaTime;
    super.update();
    if (this.age >= E_FLIGHT_MS + E_CLAW_LINGER_MS) this.toRemove = true;
  }

  onBeforeMove(): void {
    const spent = constrain(this.age / E_FLIGHT_MS, 0, 1);
    this.speed = lerp(E_CLAW_SPEED_START, E_CLAW_SPEED_END, spent);
  }

  onHit(enemy: AttackableUnit): void {
    enemy.takeDamage(E_DAMAGE, this.owner, 'MAGIC', LABEL);
    this.game.objectManager.addObject(
      new Lissandra_Frostburst(this.owner, enemy.position.x, enemy.position.y, 1)
    );
  }

  draw(): void {
    const angle = Math.atan2(this.headingY, this.headingX);
    const sinking = constrain((this.age - E_FLIGHT_MS) / E_CLAW_LINGER_MS, 0, 1);
    const stand = 1 - sinking;
    const half = this.size / 2;
    const [pr, pg, pb] = CLAW_PALE;
    const [dr, dg, db] = CLAW_DEEP;

    push();
    translate(this.position.x, this.position.y);
    rotate(angle);

    // the palm: a slab of ice dragging along the ground behind the talons
    noStroke();
    fill(dr, dg, db, 150 * stand);
    ellipse(-half * 0.35, 0, this.size * 0.9, this.size * 0.75 * stand + 4);

    // three talons, curving forward — the shape that says "claw" and nothing else
    stroke(pr, pg, pb, 240 * stand);
    strokeWeight(5);
    noFill();
    for (let talon = -1; talon <= 1; talon++) {
      const spread = talon * 0.55;
      beginShape();
      for (let step = 0; step <= 4; step++) {
        const along = (step / 4) * half * 1.15;
        const across = Math.sin(spread) * along * 0.85 + Math.sin(step / 3) * 3 * talon;
        vertex(along - half * 0.35, across * stand);
      }
      endShape();
    }

    // the tips, one bright point each, so the leading edge is unambiguous
    noStroke();
    fill(255, 255, 255, 225 * stand);
    for (let talon = -1; talon <= 1; talon++) {
      const along = half * 0.8;
      const across = Math.sin(talon * 0.55) * half * 0.98;
      circle(along, across * stand, 6);
    }
    pop();
  }
}

/**
 * The blink, drawn as the two moments it actually is: the body she left behind
 * shattering, and a column of ice reforming where she arrived. Never a streak
 * between them — a streak is how a dash reads, and this is not one.
 *
 * It spans two points, so its bounding box is built from both rather than as a
 * square around a centre; the default box would drop the departure half the
 * moment the camera followed her to the arrival.
 */
export class Lissandra_E_Blink extends SpellObject {
  lifeTime = 420;
  age = 0;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fragments: number[] = [];

  constructor(owner: AttackableUnit, fromX: number, fromY: number, toX: number, toY: number) {
    super(owner);
    this.fromX = fromX;
    this.fromY = fromY;
    this.toX = toX;
    this.toY = toY;
    this.position = createVector(toX, toY);
  }

  onAdded(): void {
    for (let i = 0; i < 8; i++) this.fragments.push(random(0.5, 1));
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    const fade = 1 - t;
    const [pr, pg, pb] = CLAW_PALE;
    const [dr, dg, db] = CLAW_DEEP;

    // DEPARTURE — the statue she was standing in, blowing apart outward
    push();
    translate(this.fromX, this.fromY);
    stroke(pr, pg, pb, 220 * fade);
    strokeWeight(3 * fade + 1);
    for (let i = 0; i < this.fragments.length; i++) {
      const a = (TWO_PI / this.fragments.length) * i;
      const flung = 46 * this.fragments[i] * (1 - (1 - t) * (1 - t));
      line(cos(a) * 6, sin(a) * 6, cos(a) * flung, sin(a) * flung);
    }
    noFill();
    stroke(dr, dg, db, 170 * fade);
    strokeWeight(2);
    circle(0, 0, 26 + 40 * t);
    pop();

    // ARRIVAL — a column of ice closing up around her, the opposite motion
    const formed = 1 - (1 - constrain(t / 0.55, 0, 1)) * (1 - constrain(t / 0.55, 0, 1));
    push();
    translate(this.toX, this.toY);
    noStroke();
    fill(pr, pg, pb, 150 * fade);
    for (let i = 0; i < 5; i++) {
      const a = (TWO_PI / 5) * i - HALF_PI;
      const inward = 44 * (1 - formed) + 12;
      triangle(
        cos(a) * inward,
        sin(a) * inward,
        cos(a + 0.28) * (inward + 16),
        sin(a + 0.28) * (inward + 16),
        cos(a - 0.28) * (inward + 16),
        sin(a - 0.28) * (inward + 16)
      );
    }
    noFill();
    stroke(255, 255, 255, 210 * fade);
    strokeWeight(3);
    circle(0, 0, 20 + 26 * formed);
    pop();
  }

  getDisplayBoundingBox() {
    const margin = 70;
    const left = Math.min(this.fromX, this.toX) - margin;
    const top = Math.min(this.fromY, this.toY) - margin;
    return new Rectangle({
      x: left,
      y: top,
      w: Math.abs(this.toX - this.fromX) + margin * 2,
      h: Math.abs(this.toY - this.fromY) + margin * 2,
      data: this,
    });
  }
}
