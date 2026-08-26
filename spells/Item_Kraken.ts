import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const AoePulse = api.AoePulse;

/**
 * Móc Diệt Thủy Quái — the rhythm weapon: every third CONSECUTIVE swing into
 * the same target lands the harpoon. Switching targets resets the count, so
 * the item asks for commitment — the count and the reset are the whole
 * mechanic, and both live on this one buff.
 *
 * Echoed applications do not advance the count: a phantom hit is the same
 * swing arriving twice, and counting it would turn "every third attack" into
 * "every other attack" the moment Cuồng Đao Guinsoo shares the bag. They do
 * not *fire* the harpoon either — the proc is the count reaching three, which
 * only a real swing can do. (Bình Minh & Hoàng Hôn doubling the proc itself
 * is a different thing, and works: the harpoon's damage is dealt in `onHit`,
 * so the doubling item re-runs it as an echo... which this guard then skips.
 * Deliberate — a triple-proc chain across three items is the balance cliff
 * the source game also fences off.)
 */

/** Which swing lands the harpoon. */
export const KRAKEN_HIT_INTERVAL = 3;

/** The harpoon: flat physical damage. */
export const KRAKEN_PROC_DAMAGE = 12;

const KRAKEN_DEEP_BLUE: [number, number, number] = [110, 170, 255];

export class Item_Kraken_Harpoon extends Buff {
  name = 'Móc Diệt Thủy Quái';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  /** Consecutive swings into `lastVictim`, 0..2 — the third fires and resets. */
  hitCount = 0;
  lastVictim: unknown = null;

  onHit(hit: OnHitEvent): void {
    if (hit.echo) return;

    if (hit.victim !== this.lastVictim) {
      this.lastVictim = hit.victim;
      this.hitCount = 0;
    }
    this.hitCount++;
    if (this.hitCount < KRAKEN_HIT_INTERVAL) return;
    this.hitCount = 0;

    hit.victim.takeDamage(KRAKEN_PROC_DAMAGE, this.targetUnit, 'PHYSICAL');

    // The proc has to be tellable from an ordinary swing at a glance — a
    // sharp little burst of spokes, the harpoon's own blue.
    const burst = new AoePulse(this.targetUnit);
    burst.position = hit.victim.position.copy();
    burst.radius = 46;
    burst.lifeTime = 260;
    burst.color = [...KRAKEN_DEEP_BLUE];
    burst.style = 'shards';
    burst.spokes = 6;
    burst.fillAlpha = 0;
    this.game.objectManager.addObject(burst);
  }
}

export default class Item_Kraken extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_kraken_slayer');
  name = 'Móc Diệt Thủy Quái (Item_Kraken)';
  description =
    `Nội tại: mỗi đòn đánh thứ ${KRAKEN_HIT_INTERVAL} liên tiếp lên cùng một mục tiêu gây thêm` +
    ` ${KRAKEN_PROC_DAMAGE} sát thương vật lý; đổi mục tiêu thì đếm lại từ đầu`;
  coolDown = 0;
  manaCost = 0;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: 0 },
    };
  }

  onSpellCast() {
    const harpoon = new Item_Kraken_Harpoon(0, this.owner, this.owner);
    harpoon.stackId = 'item_kraken';
    harpoon.image = this.image;
    harpoon.sourceSpell = this;
    this.owner.addBuff(harpoon);
  }
}
