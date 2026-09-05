import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { enemyChampionsAround } from './Item_FrozenHeart';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Slow = api.buffs.Slow;
const Speedup = api.buffs.Speedup;
const AoePulse = api.AoePulse;

/**
 * Chùy Phản Kích's active — the bruiser's gap-closer that is honest about
 * being a gap-closer for someone with no dash: everyone around the wearer is
 * hit and held back, and the wearer gets a short push of speed to spend the
 * gap they just made. Khiên Băng Randuin is the same button pressed for the
 * opposite reason — that one keeps a fight from leaving, this one catches a
 * fight that has not started.
 *
 * The enemy sweep is Tim Băng's (`enemyChampionsAround`), the shared "every
 * enemy standing with me" the tank shelf already agreed on. Champions only,
 * exactly as Randuin argues: the item's *passive* half (Rìu Tiamat's cleave,
 * re-sold the way Khiên Thái Dương re-sells Thiêu Đốt) is where the waves
 * are, and the active is for the person running away.
 */

export const STRIDEBREAKER_DAMAGE = 8;

export const STRIDEBREAKER_SLOW_PERCENT = 0.3;

export const STRIDEBREAKER_SLOW_MS = 2_500;

/** The wearer's own push, spent chasing what was just slowed. */
export const STRIDEBREAKER_HASTE_PERCENT = 0.2;
export const STRIDEBREAKER_HASTE_MS = 1_500;

/** Same "standing with me" reach as the other self-burst buttons. */
export const STRIDEBREAKER_RADIUS = 240;

/** Inside the actives' 10-18s band; the practice room's ceiling is 20s. */
export const STRIDEBREAKER_COOLDOWN_MS = 14_000;

export const STRIDEBREAKER_SLOW_STACK_ID = 'item_stridebreaker_slow';
export const STRIDEBREAKER_HASTE_STACK_ID = 'item_stridebreaker_haste';

export const STRIDE_RING_MS = 460;
export const STRIDE_FLARE_RADIUS = 36;
export const STRIDE_FLARE_MS = 280;

// Storm-rust orange: an angrier, warmer ring than Randuin's ice, so the two
// halt buttons never read as one item in a scrum.
const GALE_RUST: [number, number, number] = [240, 150, 90];

export default class Item_Stridebreaker extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_stridebreaker');
  name = 'Chùy Phản Kích (Item_Stridebreaker)';
  description =
    `Kích hoạt: gây ${STRIDEBREAKER_DAMAGE} sát thương vật lý và làm chậm ` +
    `${pct(STRIDEBREAKER_SLOW_PERCENT)}% tướng địch xung quanh trong ` +
    `${secs(STRIDEBREAKER_SLOW_MS)} giây; bản thân tăng ${pct(STRIDEBREAKER_HASTE_PERCENT)}%` +
    ` tốc chạy trong chốc lát`;
  coolDown = STRIDEBREAKER_COOLDOWN_MS;
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
    const caught = enemyChampionsAround(this.owner, STRIDEBREAKER_RADIUS);

    for (const enemy of caught) {
      enemy.takeDamage(STRIDEBREAKER_DAMAGE, this.owner, 'PHYSICAL', 'Chùy Phản Kích');
      if (enemy.isDead || enemy.toRemove) continue;

      // One press, one slow — RENEW_EXISTING on a fixed stackId (the Ekko Q /
      // Singed W rule), so a second press rewinds instead of compounding.
      const slow = new Slow(STRIDEBREAKER_SLOW_MS, this.owner, enemy);
      slow.percent = STRIDEBREAKER_SLOW_PERCENT;
      slow.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      slow.stackId = STRIDEBREAKER_SLOW_STACK_ID;
      enemy.addBuff(slow);

      const flare = new AoePulse(this.owner);
      flare.position = enemy.position.copy();
      flare.radius = STRIDE_FLARE_RADIUS;
      flare.lifeTime = STRIDE_FLARE_MS;
      flare.color = [...GALE_RUST];
      flare.fillAlpha = 55;
      this.game.objectManager.addObject(flare);
    }

    // Its own slot, so it neither evicts nor is evicted by Kiếm Ma Youmuu or
    // Khúc Ca Shurelya — buying two chase buttons must not make one dead.
    const stride = new Speedup(STRIDEBREAKER_HASTE_MS, this.owner, this.owner);
    stride.name = 'Chùy Phản Kích';
    stride.percent = STRIDEBREAKER_HASTE_PERCENT;
    stride.stackId = STRIDEBREAKER_HASTE_STACK_ID;
    stride.image = this.image;
    this.owner.addBuff(stride);

    const ring = new AoePulse(this.owner);
    ring.position = this.owner.position.copy();
    ring.radius = STRIDEBREAKER_RADIUS;
    ring.lifeTime = STRIDE_RING_MS;
    ring.color = [...GALE_RUST];
    ring.fillAlpha = 26;
    this.game.objectManager.addObject(ring);
  }
}
