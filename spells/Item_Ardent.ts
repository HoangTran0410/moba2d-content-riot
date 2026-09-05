import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { alliedChampionsAround } from './Item_Shurelya';
import { pct, secs } from '../text';

const Spell = api.Spell;
const StatAmp = api.buffs.StatAmp;
const AoePulse = api.AoePulse;

/**
 * Lư Hương Sôi Sục's active — the fourth team button, and the missing verb
 * after Vòng Sắt (shield), Khúc Ca (run) and Chuộc Tội (heal): *swing*.
 * Everyone standing with the wearer attacks faster and hits a little harder
 * for a few seconds, which is the enchanter buying the marksman's next trade
 * instead of their own.
 *
 * The ally sweep is Khúc Ca Shurelya's own (`alliedChampionsAround`) — four
 * buttons that mean "and everyone with me" must agree about who that is.
 * The grant is a `StatAmp`: `attackSpeed` on `percentBaseBonus`, the share-
 * of-the-wearer's-base slot core's own item grant uses, so the censer is
 * worth more swings to the fed marksman than to the support pressing it —
 * which is the point of an enchanter item; and `onHitDamage` flat, the same
 * stat Cung Gỗ sells, folded into each swing as physical.
 */

/** Attack-speed share of each ally's own base rate. */
export const ARDENT_ATTACK_SPEED = 0.25;

/** Flat on-hit folded into every swing while the fervor lasts. */
export const ARDENT_ON_HIT = 2;

export const ARDENT_DURATION_MS = 5_000;

/** Same reach as the other three team buttons. */
export const ARDENT_RADIUS = 300;

/** Inside the actives' 10-18s band; the practice room's ceiling is 20s. */
export const ARDENT_COOLDOWN_MS = 15_000;

export const ARDENT_STACK_ID = 'item_ardent_fervor';

export const ARDENT_RING_MS = 500;
export const ARDENT_FLARE_RADIUS = 34;
export const ARDENT_FLARE_MS = 320;

// Censer rose-gold: warmer than Chuộc Tội's dawn white, and never the heal
// green — this is swings, not health.
const FERVOR: [number, number, number] = [255, 170, 130];

export default class Item_Ardent extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_ardent_censer');
  name = 'Lư Hương Sôi Sục (Item_Ardent)';
  description =
    `Kích hoạt: bản thân và đồng minh xung quanh tăng ${pct(ARDENT_ATTACK_SPEED)}% tốc đánh` +
    ` và đòn đánh gây thêm ${ARDENT_ON_HIT} sát thương trong ${secs(ARDENT_DURATION_MS)} giây`;
  coolDown = ARDENT_COOLDOWN_MS;
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
    const kindled: AttackableUnit[] = [
      this.owner,
      ...alliedChampionsAround(this.owner, ARDENT_RADIUS),
    ];

    for (const ally of kindled) {
      if (ally.isDead || ally.toRemove) continue;

      // RENEW_EXISTING on a fixed stackId: two censers in one team rewind
      // the fervor instead of stacking two attack-speed grants nobody priced.
      const fervor = new StatAmp(ARDENT_DURATION_MS, this.owner, ally);
      fervor.bonuses = {
        attackSpeed: { percentBaseBonus: ARDENT_ATTACK_SPEED },
        onHitDamage: { flatBonus: ARDENT_ON_HIT },
      };
      fervor.name = 'Lư Hương Sôi Sục';
      fervor.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      fervor.stackId = ARDENT_STACK_ID;
      fervor.image = this.image;
      ally.addBuff(fervor);

      const flare = new AoePulse(this.owner);
      flare.position = ally.position.copy();
      flare.radius = ARDENT_FLARE_RADIUS;
      flare.lifeTime = ARDENT_FLARE_MS;
      flare.color = [...FERVOR];
      flare.fillAlpha = 50;
      this.game.objectManager.addObject(flare);
    }

    // Reach on the ring, recipients on the flares — the Locket/Randuin
    // two-layer honesty.
    const ring = new AoePulse(this.owner);
    ring.position = this.owner.position.copy();
    ring.radius = ARDENT_RADIUS;
    ring.lifeTime = ARDENT_RING_MS;
    ring.color = [...FERVOR];
    ring.fillAlpha = 24;
    this.game.objectManager.addObject(ring);
  }
}
