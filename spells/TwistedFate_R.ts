import type { AttackableUnit, CastContext, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const Champion = api.units.Champion;
const createReveal = api.buffs.createReveal;
const VectorUtils = api.utils.VectorUtils;
const Circle = api.utils.Quadtree.Circle;
const Rectangle = api.utils.Quadtree.Rectangle;
const PredefinedFilters = api.combat.PredefinedFilters;
const SpellForm = api.enums.SpellForm;
const GROUND_Z_INDEX = api.layers.GROUND_Z_INDEX;

/**
 * Định Mệnh — he lays the cards out and the whole map answers.
 *
 * A true channel: `SpellForm.CHANNELED`, so walking, a stun or a death cuts it
 * and nothing is revealed. When it finishes, **every living enemy champion
 * anywhere on the map** is revealed. That query is deliberately *not* gated on
 * `Vision.canSee` — revealing what he cannot see is the entire ability, and the
 * "acquisition goes through fog" rule is about picking targets, which this is
 * not: it names every enemy champion by definition and picks none of them.
 *
 * Then the gate opens. For `GATE_WINDOW_MS` after the channel, pressing R again
 * blinks him to the cursor instead of starting a new cast — the press is
 * intercepted before the runtime sees it, so the gate costs no mana and starts
 * no second channel. The ultimate's own cooldown has been running since the
 * channel ended, and the window simply overlaps its first seconds; the icon
 * swaps to the gate art while it is open so the second press is visible.
 *
 * **Reshaped from the wiki, on purpose:** the real Gate is a second 1.5s
 * channel with its own travel. Two stacked channels is a lot of standing still
 * for a 100-health game, so the gate here is instant on the recast. The Loaded
 * Dice passive is dropped outright — this pack's champions ship four abilities.
 */

/** The stand-still. Interrupting it costs him the whole ultimate. */
export const CHANNEL_MS = 1_500;

export const CHANNEL_TICK_MS = 250;

/** How long each enemy champion stays lit up. */
export const REVEAL_MS = 5_000;

/** How long after the channel the gate stays open. */
export const GATE_WINDOW_MS = 6_000;

/** How far the gate reaches. Long, because crossing the map is the point. */
export const BLINK_RANGE = 900;

export const COOLDOWN_MS = 10_000;

export const MANA_COST = 80;

/** His reveal's own slot, so it neither evicts nor is evicted by another spell's. */
export const REVEAL_STACK_ID = 'twistedfate_r_reveal';

/** Destiny's gold — the same coin as the Vàng card, and nobody else's ultimate. */
const FATE_GOLD: [number, number, number] = [238, 196, 96];
const FATE_DEEP: [number, number, number] = [64, 44, 108];

export default class TwistedFate_R extends Spell {
  image = api.asset('spell_twistedfate_r');
  name = 'Định Mệnh (TwistedFate_R)';
  description =
    `Kênh trong <span class="time">${CHANNEL_MS / 1000} giây</span>, sau đó` +
    ` <span class="buff">Lộ Diện</span> toàn bộ tướng địch trên bản đồ trong` +
    ` <span class="time">${REVEAL_MS / 1000} giây</span>. Trong` +
    ` <span class="time">${GATE_WINDOW_MS / 1000} giây</span> kế tiếp, kích hoạt lại để` +
    ` <span class="buff">dịch chuyển</span> tới vị trí chỉ định trong tầm` +
    ` <span>${BLINK_RANGE}px</span>`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;
  range = BLINK_RANGE;

  /** ms into the channel, for the cast ring the channel object draws. */
  channelElapsedMs = 0;

  /** ms the gate has left. Zero means an ordinary press starts a new cast. */
  gateRemainingMs = 0;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'PRESS',
      targeting: 'POINT',
      castTimeMs: 0,
      channel: { durationMs: CHANNEL_MS, tickEveryMs: CHANNEL_TICK_MS },
      interrupts: SpellForm.CHANNELED,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'end', durationMs: this.coolDown },
    };
  }

  /** 0 → 1 across the channel; what the ring on the ground fills to. */
  get channelProgress(): number {
    return Math.min(1, this.channelElapsedMs / CHANNEL_MS);
  }

  /**
   * A press while the gate is open is the gate, not a new cast — intercepted
   * here, ahead of the runtime, so it neither spends mana nor opens a second
   * channel while the ultimate's cooldown is already running.
   */
  press(context: CastContext): boolean {
    if (this.gateRemainingMs > 0) return this.stepThroughGate(context);
    return super.press(context);
  }

  onSpellCast(): void {
    this.channelElapsedMs = 0;
    // A channel that the caster's own walking cancels should not start with a
    // walk order still standing.
    this.owner.stopMovement?.();
    this.game.objectManager.addObject(new TwistedFate_R_Channel(this.owner, this));
  }

  onUpdate(): void {
    if (this.state === 'CHANNELING') this.channelElapsedMs += deltaTime;

    if (this.gateRemainingMs > 0) {
      // Dying shuts the gate: a window opened before a death must not still be
      // spendable on the other side of a respawn.
      if (this.owner.isDead) this.closeGate();
      else {
        this.gateRemainingMs -= deltaTime;
        if (this.gateRemainingMs <= 0) this.closeGate();
      }
    }
  }

  /** The channel finished. Everything the ability does happens here. */
  onComplete(): void {
    for (const enemy of this.enemyChampionsOnTheMap()) {
      enemy.addBuff(
        createReveal({
          stackId: REVEAL_STACK_ID,
          durationMs: REVEAL_MS,
          source: this.owner,
          target: enemy,
          image: api.asset('spell_twistedfate_r'),
        })
      );

      const mark = new TwistedFate_R_Mark(this.owner, enemy);
      this.game.objectManager.addObject(mark);
    }

    this.gateRemainingMs = GATE_WINDOW_MS;
    this.image = api.asset('spell_twistedfate_r2');
  }

  /**
   * Every enemy champion, anywhere. `Champion` plus "not my team" plus "not a
   * corpse" — no vision filter, by design (see the header). The area is the
   * whole map rather than a reach, because the ability has no reach.
   */
  enemyChampionsOnTheMap(): AttackableUnit[] {
    const mapSize: number = this.game.mapSize;
    return this.game.objectManager.queryObjects({
      area: new Circle({ x: mapSize / 2, y: mapSize / 2, r: mapSize }),
      filters: [
        PredefinedFilters.type(Champion),
        PredefinedFilters.excludeTeamId(this.owner.teamId),
        PredefinedFilters.excludeDead,
      ],
    }) as AttackableUnit[];
  }

  private stepThroughGate(context: CastContext): boolean {
    const origin = this.owner.position.copy();
    const aim = createVector(context.cursorWorld.x, context.cursorWorld.y);
    const { to } = VectorUtils.getVectorWithMaxRange(origin, aim, BLINK_RANGE);

    // Grounded refuses the blink; the window stays open so the press is held
    // rather than wasted.
    if (!this.blinkOwnerTo(to.x, to.y)) return false;

    this.closeGate();
    this.game.objectManager.addObject(new TwistedFate_R_Gate(this.owner, origin, to.copy()));
    return true;
  }

  private closeGate(): void {
    this.gateRemainingMs = 0;
    this.image = api.asset('spell_twistedfate_r');
  }
}

/**
 * The channel, drawn where everyone can see it — a `SpellObject` rather than
 * caster art, because the enemy deciding whether to sprint at him has to see it
 * even while he is at the edge of their screen.
 *
 * A rune ring opens on the ground and fills as the channel runs; three cards
 * rise out of it and fan wider the further along he is. The fill is the real
 * `channelProgress`, so an interrupted channel visibly stops short.
 */
export class TwistedFate_R_Channel extends SpellObject {
  /** Light pooling at his feet, under everyone standing on it. */
  zIndex = GROUND_Z_INDEX;

  private spell: TwistedFate_R;
  private radius = 74;

  constructor(owner: AttackableUnit, spell: TwistedFate_R) {
    super(owner);
    this.spell = spell;
    this.attachTo(owner);
    this.position.set(owner.position.x, owner.position.y);
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    this.position.set(this.owner.position.x, this.owner.position.y);
    // Dies with the channel, however the channel ended.
    if (this.spell.state !== 'CHANNELING') this.toRemove = true;
  }

  draw(): void {
    const filled = this.spell.channelProgress;
    // Winds in rather than snapping: t*t on the opening ring.
    const opened = filled * filled * 0.35 + 0.65;
    const [gold, goldGreen, goldBlue] = FATE_GOLD;
    const [deep, deepGreen, deepBlue] = FATE_DEEP;

    push();
    translate(this.position.x, this.position.y);

    // the rune circle
    noStroke();
    fill(deep, deepGreen, deepBlue, 60);
    circle(0, 0, this.radius * 2 * opened);

    noFill();
    stroke(gold, goldGreen, goldBlue, 70);
    strokeWeight(2);
    circle(0, 0, this.radius * 2 * opened);

    // the progress arc — this is the cast bar, on the ground
    stroke(gold, goldGreen, goldBlue, 235);
    strokeWeight(4);
    arc(
      0,
      0,
      this.radius * 2 * opened,
      this.radius * 2 * opened,
      -PI / 2,
      -PI / 2 + TWO_PI * filled
    );

    // three cards rising and fanning out of the ring
    for (let index = 0; index < 3; index++) {
      const lane = index - 1;
      const spread = lane * 0.5 * filled;
      push();
      translate(lane * 22 * filled, -18 - 26 * filled);
      rotate(spread);
      stroke(250, 242, 218, 200);
      strokeWeight(1.3);
      fill(gold, goldGreen, goldBlue, 120 + 110 * filled);
      rect(-6, -9, 12, 18, 2);
      pop();
    }

    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(this.radius * 2 + 90);
  }
}

/** The card that settles over one revealed champion for as long as the reveal lasts. */
export class TwistedFate_R_Mark extends SpellObject {
  private victim: AttackableUnit;
  private age = 0;
  private readonly lifeTime = REVEAL_MS;

  constructor(owner: AttackableUnit, victim: AttackableUnit) {
    super(owner);
    this.victim = victim;
    this.attachTo(victim);
    this.position.set(victim.position.x, victim.position.y);
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    this.position.set(this.victim.position.x, this.victim.position.y);
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    // Snaps out on arrival, then holds and fades at the very end.
    const arrival = 1 - (1 - Math.min(1, this.age / 260)) * (1 - Math.min(1, this.age / 260));
    const fade = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
    const bodySize = this.victim.animatedValues?.displaySize || this.victim.stats.size.value;
    const lift = bodySize * 0.5 + 20;
    const [gold, goldGreen, goldBlue] = FATE_GOLD;

    push();
    translate(this.position.x, this.position.y - lift * arrival);

    noStroke();
    fill(gold, goldGreen, goldBlue, 45 * fade * arrival);
    circle(0, 0, 30);

    rotate(Math.sin(this.age / 420) * 0.35);
    stroke(252, 244, 220, 235 * fade);
    strokeWeight(1.4);
    fill(gold, goldGreen, goldBlue, 215 * fade);
    rect(-7, -10, 14, 20, 2);

    noStroke();
    fill(90, 62, 30, 220 * fade);
    quad(0, -6, 4, 0, 0, 6, -4, 0);
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(90);
  }
}

/**
 * The gate itself: a card-shaped tear where he left and another where he
 * arrives, with the deck streaming between them. The art spans two points, so
 * the bounding box is built from both — the rule that keeps the departure end
 * drawing while the camera follows him to the arrival end.
 */
export class TwistedFate_R_Gate extends SpellObject {
  private from: { x: number; y: number };
  private to: { x: number; y: number };
  private age = 0;
  private readonly lifeTime = 420;

  constructor(owner: AttackableUnit, from: { x: number; y: number }, to: { x: number; y: number }) {
    super(owner);
    this.from = { x: from.x, y: from.y };
    this.to = { x: to.x, y: to.y };
    this.position.set(to.x, to.y);
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= this.lifeTime) this.toRemove = true;
  }

  draw(): void {
    const t = constrain(this.age / this.lifeTime, 0, 1);
    // Snaps out: the tear is widest immediately and closes.
    const opened = 1 - t * t;
    const [gold, goldGreen, goldBlue] = FATE_GOLD;
    const [deep, deepGreen, deepBlue] = FATE_DEEP;

    push();

    // the cards streaming across, in the direction he actually travelled
    stroke(gold, goldGreen, goldBlue, 150 * opened);
    strokeWeight(2);
    for (let index = 0; index < 4; index++) {
      const along = constrain(t * 1.6 - index * 0.12, 0, 1);
      const x = lerp(this.from.x, this.to.x, along);
      const y = lerp(this.from.y, this.to.y, along);
      point(x, y);
      circle(x, y, 6 * opened);
    }

    for (const end of [this.from, this.to]) {
      push();
      translate(end.x, end.y);
      noStroke();
      fill(deep, deepGreen, deepBlue, 150 * opened);
      ellipse(0, 0, 26 * opened, 54 * opened);
      noFill();
      stroke(gold, goldGreen, goldBlue, 230 * opened);
      strokeWeight(2.5);
      ellipse(0, 0, 26 * opened, 54 * opened);
      pop();
    }

    pop();
  }

  getDisplayBoundingBox() {
    const pad = 70;
    const left = Math.min(this.from.x, this.to.x) - pad;
    const top = Math.min(this.from.y, this.to.y) - pad;
    return new Rectangle({
      x: left,
      y: top,
      w: Math.abs(this.to.x - this.from.x) + pad * 2,
      h: Math.abs(this.to.y - this.from.y) + pad * 2,
      data: this,
    });
  }
}
