import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { enemyChampionsAround } from './Item_FrozenHeart';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Slow = api.buffs.Slow;
const AoePulse = api.AoePulse;

/**
 * Tụ Bão Zeke's active — the storm the wearer *carries*. Khiên Băng Randuin
 * is one clap of cold on whoever is already in reach; this is a walking
 * front: for a few seconds everything the wearer closes on is slowed, so the
 * support can herd a fight rather than photograph it.
 *
 * The aura is a timed self-buff whose tick re-applies a short `Slow` —
 * `RENEW_EXISTING` on a fixed stackId, the Singed W shape, because an aura
 * that stacks its own slow ten deep is a standstill sold as 30%
 * (`AGENTS.md`'s re-applied-slow trap, word for word). The sweep is Tim
 * Băng's `enemyChampionsAround`: champions only, and one definition of
 * "standing with me" across the whole shelf.
 */

export const ZEKE_SLOW_PERCENT = 0.3;

/** How long the storm is carried. */
export const ZEKE_DURATION_MS = 4_000;

/** The front's reach — tighter than Randuin's clap; it has four seconds. */
export const ZEKE_RADIUS = 200;

/** Re-application cadence; each application outlives one gap comfortably. */
export const ZEKE_TICK_MS = 400;
export const ZEKE_SLOW_MS = 700;

/** Inside the actives' 10-18s band; the practice room's ceiling is 20s. */
export const ZEKE_COOLDOWN_MS = 15_000;

export const ZEKE_STACK_ID = 'item_zeke_storm';
export const ZEKE_SLOW_STACK_ID = 'item_zeke_slow';

// Frost-lightning blue: paler than Randuin's deep ice — a haze, not a clap.
const STORMFROST: [number, number, number] = [160, 200, 250];

export class Item_Zeke_Storm extends Buff {
  name = 'Tụ Bão Zeke';
  description =
    `Làm chậm <span class="buff">${pct(ZEKE_SLOW_PERCENT)}%</span> các tướng địch đứng gần bạn.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  private sinceTick = ZEKE_TICK_MS;

  onUpdate(): void {
    this.sinceTick += deltaTime;
    if (this.sinceTick < ZEKE_TICK_MS) return;
    this.sinceTick = 0;

    const holder = this.targetUnit;
    if (holder.isDead || holder.toRemove) return;

    for (const enemy of enemyChampionsAround(holder, ZEKE_RADIUS)) {
      const slow = new Slow(ZEKE_SLOW_MS, holder, enemy);
      slow.percent = ZEKE_SLOW_PERCENT;
      slow.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      slow.stackId = ZEKE_SLOW_STACK_ID;
      enemy.addBuff(slow);
    }
  }

  /** The storm's true reach, faint, while it is carried — the warning label. */
  draw(): void {
    const holder = this.targetUnit;
    if (holder.isDead) return;
    const [r, g, b] = STORMFROST;

    push();
    noFill();
    stroke(r, g, b, 30 + 10 * Math.sin(frameCount / 8));
    strokeWeight(4);
    circle(holder.position.x, holder.position.y, ZEKE_RADIUS * 2);
    pop();
  }
}

export default class Item_Zeke extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_zekes_convergence');
  name = 'Tụ Bão Zeke (Item_Zeke)';
  description =
    `Kích hoạt: trong ${secs(ZEKE_DURATION_MS)} giây, làm chậm ${pct(ZEKE_SLOW_PERCENT)}%` +
    ` các tướng địch đứng gần bạn`;
  coolDown = ZEKE_COOLDOWN_MS;
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
    const storm = new Item_Zeke_Storm(ZEKE_DURATION_MS, this.owner, this.owner);
    storm.stackId = ZEKE_STACK_ID;
    storm.image = this.image;
    storm.sourceSpell = this;
    this.owner.addBuff(storm);

    const ring = new AoePulse(this.owner);
    ring.position = this.owner.position.copy();
    ring.radius = ZEKE_RADIUS;
    ring.lifeTime = 420;
    ring.color = [...STORMFROST];
    ring.fillAlpha = 26;
    this.game.objectManager.addObject(ring);
  }
}
