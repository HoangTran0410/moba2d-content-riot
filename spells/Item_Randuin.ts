import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { enemyChampionsAround } from './Item_FrozenHeart';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Slow = api.buffs.Slow;
const AoePulse = api.AoePulse;

/**
 * Khiên Băng Randuin's active — the tank's answer button. Vòng Sắt Mặt Trời
 * is pressed for the teammate about to die; this is pressed for the fight
 * about to *leave*: everyone who dove the wearer is held in the cold for two
 * seconds, which is the difference between a front line and a speed bump.
 *
 * The enemy sweep is Tim Băng's own (`enemyChampionsAround`), because two
 * items that mean "every enemy standing with me" must not disagree about who
 * that is — the same rule that ties Vòng Sắt to Khúc Ca Shurelya's ally
 * sweep. Champions only: a wave slowed by a defensive button is wave-clear
 * nobody paid for.
 */

export const RANDUIN_SLOW_PERCENT = 0.35;

export const RANDUIN_SLOW_MS = 2_000;

/** Same reach as the two team buttons — the "standing with me" radius. */
export const RANDUIN_RADIUS = 260;

/** Inside the actives' 10-18s band; the practice room's ceiling is 20s. */
export const RANDUIN_COOLDOWN_MS = 15_000;

export const RANDUIN_SLOW_STACK_ID = 'item_randuin_slow';

/** The burst: one ring out to the true radius, then a flare per victim. */
export const OMEN_RING_MS = 480;
export const OMEN_FLARE_RADIUS = 38;
export const OMEN_FLARE_MS = 300;

// Deep ice blue, colder and darker than the Solari gold beside it.
const OMEN_ICE: [number, number, number] = [130, 185, 245];

export default class Item_Randuin extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_randuins_omen');
  name = 'Khiên Băng Randuin (Item_Randuin)';
  description =
    `Kích hoạt: làm chậm ${pct(RANDUIN_SLOW_PERCENT)}% các tướng địch xung quanh trong ` +
    `${secs(RANDUIN_SLOW_MS)} giây`;
  coolDown = RANDUIN_COOLDOWN_MS;
  manaCost = 0;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: this.coolDown },
    };
  }

  onSpellCast() {
    const caught = enemyChampionsAround(this.owner, RANDUIN_RADIUS);

    for (const enemy of caught) {
      // One press, one slow — and RENEW_EXISTING with a fixed stackId so a
      // second Randuin in the team rewinds the clock instead of stacking
      // toward a standstill (the Ekko Q / Singed W rule).
      const slow = new Slow(RANDUIN_SLOW_MS, this.owner, enemy);
      slow.percent = RANDUIN_SLOW_PERCENT;
      slow.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      slow.stackId = RANDUIN_SLOW_STACK_ID;
      enemy.addBuff(slow);

      const flare = new AoePulse(this.owner);
      flare.position = enemy.position.copy();
      flare.radius = OMEN_FLARE_RADIUS;
      flare.lifeTime = OMEN_FLARE_MS;
      flare.color = [...OMEN_ICE];
      flare.fillAlpha = 55;
      this.game.objectManager.addObject(flare);
    }

    // The ring says how far it reached, whoever it caught — same two-layer
    // honesty as the Locket dome: reach on the ring, victims on the flares.
    const ring = new AoePulse(this.owner);
    ring.position = this.owner.position.copy();
    ring.radius = RANDUIN_RADIUS;
    ring.lifeTime = OMEN_RING_MS;
    ring.color = [...OMEN_ICE];
    ring.fillAlpha = 28;
    this.game.objectManager.addObject(ring);
  }
}
