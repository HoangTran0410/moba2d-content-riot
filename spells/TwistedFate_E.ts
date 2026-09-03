import type { AttackableUnit, CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const StatAmp = api.buffs.StatAmp;
const AoePulse = api.AoePulse;
const BuffAddType = api.enums.BuffAddType;
const dmg = api.text.dmg;

/**
 * Tráo Bài — the passive, shipped as a pressable `SELF` spell the way
 * every other always-on in this pack is: pressing it costs nothing and simply
 * re-arms the buffs, so there is no second registration path for "a passive"
 * (see `spells/Item_Sheen.ts`, which arms its permanent buff exactly here).
 *
 * Two buffs, because they are two different questions:
 *
 *  - the **deck** counts his swings and stays on the HUD with its stack count.
 *    The player has to see the fourth swing coming — that is the entire reason
 *    to hold an attack for a moment rather than walk away.
 *  - the **attack speed** is a flat `StatAmp` with `hudVisible = false`. There
 *    is nothing to watch and nothing to time, so it does not earn a slot in the
 *    buff row next to the card he is holding.
 */

/** Every Nth basic attack is the loaded one. */
export const ATTACKS_PER_EMPOWER = 4;

/** What that swing adds, as magic damage. */
export const BONUS_DAMAGE = 16;

/** Flat attacks per second, permanently. */
/** A share of his own base rate, not swings a second — see `Stats.attackSpeed`. */
export const BONUS_ATTACK_SPEED = 0.25;

export const DECK_STACK_ID = 'twistedfate_e_deck';

export const HASTE_STACK_ID = 'twistedfate_e_haste';

const DAMAGE_LABEL = 'Tráo Bài';

/** The charge burning through the stacked deck: a warm amber, not the Q violet. */
const DECK_SPARK: [number, number, number] = [246, 198, 104];

export default class TwistedFate_E extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('spell_twistedfate_e');
  name = 'Tráo Bài (TwistedFate_E)';
  description =
    `Nội tại: cộng vĩnh viễn <span class="buff">${BONUS_ATTACK_SPEED} tốc độ đánh</span>.` +
    ` Cứ mỗi <span class="buff">${ATTACKS_PER_EMPOWER} đòn đánh thường</span>, đòn thứ` +
    ` ${ATTACKS_PER_EMPOWER} gây thêm ${dmg(BONUS_DAMAGE, 'MAGIC')}`;
  coolDown = 0;
  manaCost = 0;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: 0 },
    };
  }

  onSpellCast(): void {
    const deck = new TwistedFate_E_Deck(0, this.owner, this.owner);
    deck.stackId = DECK_STACK_ID;
    deck.image = this.image;
    this.owner.addBuff(deck);

    const haste = new StatAmp(0, this.owner, this.owner);
    haste.stackId = HASTE_STACK_ID;
    haste.name = 'Tráo Bài';
    haste.buffAddType = BuffAddType.REPLACE_EXISTING;
    // Nothing to count and nothing to time: it stays off the buff row.
    haste.hudVisible = false;
    haste.bonuses = { attackSpeed: { percentBaseBonus: BONUS_ATTACK_SPEED } };
    this.owner.addBuff(haste);
  }
}

/**
 * The running count. `stacks` is what the HUD badges, so it *is* the readout —
 * 0, 1, 2, 3, and the swing that would take it to four spends it instead.
 *
 * No `hit.echo` check: a doubled attack is still an attack, and this counts
 * attacks.
 */
export class TwistedFate_E_Deck extends Buff {
  name = 'Tráo Bài';
  description =
    `Đủ ${ATTACKS_PER_EMPOWER} đòn đánh, đòn kế tiếp gây thêm` +
    ` ${BONUS_DAMAGE} sát thương phép`;
  buffAddType = BuffAddType.REPLACE_EXISTING;
  maxStacks = ATTACKS_PER_EMPOWER;
  stacks = 0;

  onHit(hit: OnHitEvent): void {
    this.stacks += 1;
    if (this.stacks < ATTACKS_PER_EMPOWER) return;

    this.stacks = 0;
    hit.victim.takeDamage(BONUS_DAMAGE, this.targetUnit, 'MAGIC', DAMAGE_LABEL);
    this.showDischarge(hit.victim);
  }

  private showDischarge(victim: AttackableUnit): void {
    const size = victim.animatedValues?.displaySize || victim.stats.size.value;
    const spark = new AoePulse(this.targetUnit);
    spark.position = victim.position.copy();
    spark.radius = size * 0.75;
    spark.lifeTime = 260;
    spark.color = [...DECK_SPARK];
    spark.fillAlpha = 55;
    this.game.objectManager.addObject(spark);
  }

  /**
   * The count, worn rather than read: a short fan of cards at his hip, one card
   * per stack, the fan brightening as it fills. Three lit cards means the next
   * click is the loaded one — the same fact the HUD badge carries, in the place
   * the player is actually looking.
   */
  draw(): void {
    const pos = this.targetUnit.position;
    const reach = (this.targetUnit.animatedValues?.displaySize || 40) * 0.5 + 8;
    const charge = this.stacks / ATTACKS_PER_EMPOWER;
    const [red, green, blue] = DECK_SPARK;

    push();
    translate(pos.x - reach * 0.9, pos.y + reach * 0.35);

    if (this.stacks >= ATTACKS_PER_EMPOWER - 1) {
      noStroke();
      fill(red, green, blue, 40 + 25 * Math.sin(frameCount / 7));
      circle(0, 0, 30);
    }

    for (let index = 0; index < ATTACKS_PER_EMPOWER - 1; index++) {
      const lit = index < this.stacks;
      push();
      rotate(-0.5 + index * 0.35);
      stroke(250, 238, 210, lit ? 230 : 80);
      strokeWeight(1.2);
      fill(red, green, blue, lit ? 200 + 40 * charge : 45);
      rect(-3, -11, 6, 15, 1.5);
      pop();
    }

    pop();
  }
}
