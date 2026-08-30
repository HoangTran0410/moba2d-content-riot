import type { AttackableUnit, CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Slow = api.buffs.Slow;
const Stun = api.buffs.Stun;
const SpellObject = api.SpellObject;
const AoePulse = api.AoePulse;
const BuffAddType = api.enums.BuffAddType;
const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;

/**
 * Chọn Bài — the champion, really.
 *
 * Press once and the deck starts cycling Xanh → Đỏ → Vàng on a fixed interval,
 * in the open, above his head. **Press again and whatever is showing at that
 * instant is what you get**, riding his next basic attack. The recast is the
 * whole ability; the first press only opens the window.
 *
 * That window is a real `active` block rather than a hand-rolled timer, so the
 * runtime owns it: mana is committed once on the opening press, the recast
 * costs nothing, and a shuffle nobody locks completes itself at
 * `SHUFFLE_TIMEOUT_MS` for the consolation cooldown below. The armed card is a
 * `Buff` with `onHit`, which is the only shape that lets an *attack* be the
 * thing that spends it.
 */

/** How long one card stays showing before the deck flips to the next. */
export const SHUFFLE_INTERVAL_MS = 400;

/** A shuffle left alone this long ends by itself, with nothing gained. */
export const SHUFFLE_TIMEOUT_MS = 6_000;

/** The cooldown for actually locking a card. */
export const COOLDOWN_MS = 7_000;

/** The cooldown for letting the shuffle run out — cheap, because it paid nothing. */
export const TIMEOUT_COOLDOWN_MS = 2_000;

export const MANA_COST = 30;

/** Xanh: burst plus a refill, the reason he can keep casting. */
export const BLUE_BONUS_DAMAGE = 18;
export const BLUE_MANA_RESTORED = 60;

/** Đỏ: the wave-clear card — less on the head, but it splashes and sticks. */
export const RED_BONUS_DAMAGE = 14;
export const RED_SPLASH_RADIUS = 110;
export const RED_SLOW_PERCENT = 0.3;
export const RED_SLOW_MS = 1_500;

/** Vàng: the least damage of the three, because it is a stun. */
export const GOLD_BONUS_DAMAGE = 10;
export const GOLD_STUN_MS = 1_200;

/** The cycle, in the order the deck always runs it. */
export const CARD_ORDER = ['XANH', 'DO', 'VANG'] as const;

export type CardKind = (typeof CARD_ORDER)[number];

/** One slot: locking a second card replaces the first rather than stacking. */
export const CARD_STACK_ID = 'twistedfate_w_card';

const DAMAGE_LABEL = 'Chọn Bài';

/** Everything that differs between the three cards, in one table. */
const CARD_FACE = {
  XANH: { name: 'Lá Bài Xanh', icon: 'spell_twistedfate_w2', ink: [86, 162, 246] },
  DO: { name: 'Lá Bài Đỏ', icon: 'spell_twistedfate_w3', ink: [228, 88, 82] },
  VANG: { name: 'Lá Bài Vàng', icon: 'spell_twistedfate_w4', ink: [240, 194, 86] },
} as const;

export default class TwistedFate_W extends Spell {
  image = api.asset('spell_twistedfate_w');
  name = 'Chọn Bài (TwistedFate_W)';
  description =
    `Bắt đầu đảo bài, mỗi <span class="time">${secs(SHUFFLE_INTERVAL_MS)} giây</span> đổi một lá.` +
    ` Kích hoạt lần nữa để <span class="buff">chốt lá đang hiện</span>, nạp vào đòn đánh kế tiếp:` +
    ` <span class="buff">Xanh</span> thêm <span class="damage magic">${BLUE_BONUS_DAMAGE} sát thương phép</span>` +
    ` và hồi <span class="buff">${BLUE_MANA_RESTORED} năng lượng</span>;` +
    ` <span class="buff">Đỏ</span> thêm <span class="damage magic">${RED_BONUS_DAMAGE} sát thương phép</span>` +
    ` lan quanh mục tiêu và <span class="buff">Làm Chậm ${pct(RED_SLOW_PERCENT)}%</span>` +
    ` trong <span class="time">${secs(RED_SLOW_MS)} giây</span>;` +
    ` <span class="buff">Vàng</span> thêm <span class="damage magic">${GOLD_BONUS_DAMAGE} sát thương phép</span>` +
    ` và <span class="buff">Choáng</span> trong <span class="time">${secs(GOLD_STUN_MS)} giây</span>`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;

  /** ms since the shuffle opened. The only thing that decides which card shows. */
  shuffleElapsedMs = 0;

  /** True once this activation's recast actually caught a card. */
  private lockedACard = false;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'RECAST',
      targeting: 'SELF',
      castTimeMs: 0,
      active: { maxDurationMs: SHUFFLE_TIMEOUT_MS, recasts: 1 },
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'end', durationMs: this.coolDown },
    };
  }

  /**
   * The card showing right now — what a recast this instant would lock. Read by
   * the deck above his head and by the recast, so the art can never promise a
   * card the lock would not give.
   */
  get showingCard(): CardKind {
    const step = Math.floor(this.shuffleElapsedMs / SHUFFLE_INTERVAL_MS);
    return CARD_ORDER[((step % CARD_ORDER.length) + CARD_ORDER.length) % CARD_ORDER.length];
  }

  /** Whether the deck is cycling — the deck object's own lifetime. */
  get shuffling(): boolean {
    return this.state === 'ACTIVE';
  }

  onSpellCast(): void {
    this.shuffleElapsedMs = 0;
    this.lockedACard = false;
    this.game.objectManager.addObject(new TwistedFate_W_Deck(this.owner, this));
  }

  onUpdate(): void {
    // Runs before the runtime's own tick, so the card showing when a recast
    // arrives is the card the player last saw drawn.
    if (this.state === 'ACTIVE') this.shuffleElapsedMs += deltaTime;
  }

  onRecast(): void {
    const card = this.showingCard;
    this.lockedACard = true;

    const armed = new TwistedFate_W_Card(0, this.owner, this.owner);
    armed.card = card;
    armed.name = CARD_FACE[card].name;
    armed.image = api.asset(CARD_FACE[card].icon);
    armed.stackId = CARD_STACK_ID;
    this.owner.addBuff(armed);
  }

  onComplete(): void {
    this.refundEmptyShuffle();
  }

  /** Stunned, silenced or killed mid-shuffle: also a shuffle that bought nothing. */
  onCancel(): void {
    this.refundEmptyShuffle();
  }

  /**
   * The runtime has already started the full cooldown by the time either hook
   * runs, so this rewrites it. A shuffle that ended with no card in his hand
   * must not cost what one that ended with a stun costs.
   */
  private refundEmptyShuffle(): void {
    if (!this.lockedACard) this.currentCooldown = this.reducedCooldown(TIMEOUT_COOLDOWN_MS);
  }
}

/**
 * The locked card, waiting on his hand. Permanent until an attack spends it —
 * one buff class, three payloads, chosen by `card`.
 *
 * No `hit.echo` check on purpose: this is a payload, not a propagator. A
 * doubled attack should run the card again, exactly as it runs any other
 * on-hit; only the things that *cause* the doubling have to guard against it.
 */
export class TwistedFate_W_Card extends Buff {
  name: string = CARD_FACE.XANH.name;
  description = 'Đòn đánh thường kế tiếp mang hiệu ứng của lá bài đã chốt';
  card: CardKind = 'XANH';
  buffAddType = BuffAddType.REPLACE_EXISTING;

  onHit(hit: OnHitEvent): void {
    const caster = this.targetUnit;
    const victim = hit.victim;

    switch (this.card) {
      case 'XANH':
        victim.takeDamage(BLUE_BONUS_DAMAGE, caster, 'MAGIC', DAMAGE_LABEL);
        // Granting, not billing: `restoreMana` is the seam a pack may use.
        caster.restoreMana(BLUE_MANA_RESTORED);
        this.showImpact(victim, this.size(victim) * 0.9);
        break;

      case 'DO':
        victim.takeDamage(RED_BONUS_DAMAGE, caster, 'MAGIC', DAMAGE_LABEL);
        this.slow(victim);
        for (const splashed of this.neighboursOf(victim)) {
          splashed.takeDamage(RED_BONUS_DAMAGE, caster, 'MAGIC', DAMAGE_LABEL);
          this.slow(splashed);
        }
        // Drawn at the radius the damage really used, not a decorative one.
        this.showImpact(victim, RED_SPLASH_RADIUS * 2);
        break;

      case 'VANG':
        victim.takeDamage(GOLD_BONUS_DAMAGE, caster, 'MAGIC', DAMAGE_LABEL);
        victim.addBuff(new Stun(GOLD_STUN_MS, caster, victim));
        this.showImpact(victim, this.size(victim) * 1.1);
        break;
    }

    // Spent. `applyOnHitEffects` skips buffs already marked, so the swing that
    // follows this one is an ordinary swing.
    this.deactivateBuff();
  }

  /**
   * Everyone else the red card catches. Area damage, so deliberately *not*
   * vision-gated: fog decides what he can pick as a target, never what a
   * splash already landed on touches.
   */
  private neighboursOf(victim: AttackableUnit): AttackableUnit[] {
    return this.game.objectManager.queryObjects({
      area: new Circle({ x: victim.position.x, y: victim.position.y, r: RED_SPLASH_RADIUS }),
      filters: [
        PredefinedFilters.canTakeDamageFromTeam(this.targetUnit.teamId),
        PredefinedFilters.excludeObjects([victim, this.targetUnit]),
      ],
    }) as AttackableUnit[];
  }

  private slow(target: AttackableUnit): void {
    const chill = new Slow(RED_SLOW_MS, this.targetUnit, target);
    chill.percent = RED_SLOW_PERCENT;
    chill.stackId = 'twistedfate_w_red_slow';
    // A second red card refreshes the same slow rather than stacking ten deep.
    chill.buffAddType = BuffAddType.RENEW_EXISTING;
    chill.image = api.asset('spell_twistedfate_w3');
    target.addBuff(chill);
  }

  private size(target: AttackableUnit): number {
    return target.animatedValues?.displaySize || target.stats.size.value;
  }

  /** The card going off, on the body, in the card's own colour. */
  private showImpact(victim: AttackableUnit, diameter: number): void {
    const [red, green, blue] = CARD_FACE[this.card].ink;
    const burst = new AoePulse(this.targetUnit);
    burst.position = victim.position.copy();
    burst.radius = diameter / 2;
    burst.lifeTime = 320;
    burst.color = [red, green, blue];
    burst.fillAlpha = 50;
    this.game.objectManager.addObject(burst);
  }

  /**
   * Worn, not just listed: one small card of the locked colour hovering at his
   * shoulder. The player has to be able to see *which* card is loaded without
   * reading the buff row, because the answer changes what the next click does.
   */
  draw(): void {
    const [red, green, blue] = CARD_FACE[this.card].ink;
    const pos = this.targetUnit.position;
    const lift = this.size(this.targetUnit) * 0.5 + 12;
    const bob = Math.sin(frameCount / 18) * 2.5;

    push();
    translate(pos.x + lift * 0.75, pos.y - lift * 0.55 + bob);
    rotate(-0.25);

    noStroke();
    fill(red, green, blue, 55);
    circle(0, 0, 26);

    stroke(245, 240, 255, 235);
    strokeWeight(1.4);
    fill(red, green, blue, 240);
    rect(-6, -9, 12, 18, 2);

    noStroke();
    fill(255, 255, 255, 200);
    circle(0, 0, 4);
    pop();
  }
}

/**
 * The deck above his head while he shuffles — the enemy's warning as much as
 * the player's readout, which is why it is a `SpellObject` and not something
 * hung off `Champion.draw()`: it has to keep drawing when he is at the edge of
 * the frame, and it has to be there for the person deciding whether to walk up.
 *
 * Three cards in a stack; the one that would be locked right now rises out of
 * the stack and lights up. It reads `spell.showingCard`, so the art and the
 * recast can never disagree.
 */
export class TwistedFate_W_Deck extends SpellObject {
  private spell: TwistedFate_W;
  private fadeMs = 0;
  /** ms the stack lingers after the shuffle ends, so the lock is visible. */
  private readonly fadeLifeMs = 260;

  constructor(owner: AttackableUnit, spell: TwistedFate_W) {
    super(owner);
    this.spell = spell;
    this.attachTo(owner);
    this.position.set(owner.position.x, owner.position.y);
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    this.position.set(this.owner.position.x, this.owner.position.y);

    if (this.spell.shuffling) return;
    this.fadeMs += deltaTime;
    if (this.fadeMs >= this.fadeLifeMs) this.toRemove = true;
  }

  draw(): void {
    const showing = this.spell.showingCard;
    const fade = 1 - Math.min(1, this.fadeMs / this.fadeLifeMs);
    const bodySize = this.owner.animatedValues?.displaySize || this.owner.stats.size.value;
    const lift = bodySize * 0.5 + 26;

    push();
    translate(this.position.x, this.position.y - lift);

    for (let index = 0; index < CARD_ORDER.length; index++) {
      const kind = CARD_ORDER[index];
      const chosen = kind === showing;
      const [red, green, blue] = CARD_FACE[kind].ink;
      const slot = (index - 1) * 15;
      // The showing card lifts out of the stack; the other two sit back down.
      const rise = chosen ? -7 : 0;
      const alpha = (chosen ? 245 : 90) * fade;

      push();
      translate(slot, rise);
      rotate((index - 1) * 0.22);

      if (chosen) {
        noStroke();
        fill(red, green, blue, 70 * fade);
        circle(0, 0, 34);
      }

      stroke(240, 236, 255, alpha);
      strokeWeight(1.4);
      fill(red, green, blue, alpha);
      rect(-7, -10, 14, 20, 2);
      pop();
    }

    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(140);
  }
}
