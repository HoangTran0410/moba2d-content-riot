import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const StatAmp = api.buffs.StatAmp;
const Champion = api.units.Champion;
const PredefinedFilters = api.combat.PredefinedFilters;

/**
 * Tim Băng — the shop's first **aura**: a thing that is on the enemies standing
 * near you rather than on you.
 *
 * Every other defensive item in this shop makes its holder harder to kill. An
 * aura makes the *fight* smaller, which is a different purchase: it is worth
 * nothing in a duel the holder loses anyway and a great deal in the five-body
 * scrum around a turret, and it is the only item here that a teammate benefits
 * from without the holder pressing anything.
 *
 * Applied as a short `StatAmp` refreshed while the enemy stays in range, not
 * as a permanent buff added on entry and removed on exit. Entry/exit
 * bookkeeping needs a membership set that survives a body dying, being
 * untargetable, teleporting, or the item being sold mid-frame; a chill that
 * simply expires 300ms after the last refresh needs none of that and is wrong
 * for at most a fifth of a second.
 */

/** How far the chill reaches. Slightly further than a melee body's own reach. */
export const FROZEN_HEART_RADIUS = 190;

/** Share of attack speed taken off every enemy inside it. */
export const FROZEN_HEART_SLOW = 0.2;

/** How long one application lasts if the holder walks away. */
export const FROZEN_HEART_CHILL_MS = 300;

/** How often the ring is re-applied. Four times a second, like the bot brain. */
export const FROZEN_HEART_TICK_MS = 250;

export const FROZEN_HEART_STACK_ID = 'item_frozen_heart';
export const FROZEN_HEART_CHILL_STACK_ID = 'item_frozen_heart_chill';

/** Enemy champions inside the ring — the mirror of Khúc Ca Shurelya's ally sweep. */
function enemyChampionsAround(unit: AttackableUnit, radius: number): AttackableUnit[] {
  const found = unit.game.objectManager.queryObjects({
    area: new api.utils.Quadtree.Circle({ x: unit.position.x, y: unit.position.y, r: radius }),
    filters: [PredefinedFilters.type(Champion), PredefinedFilters.excludeDead],
  }) as AttackableUnit[];

  const out: AttackableUnit[] = [];
  for (const other of found) {
    if (other === unit || other.toRemove) continue;
    if (other.teamId === unit.teamId) continue;
    out.push(other);
  }
  return out;
}

export class Item_FrozenHeart_Aura extends Buff {
  name = 'Tim Băng';
  description =
    `Kẻ địch đứng gần bị giảm <span class="buff">${pct(FROZEN_HEART_SLOW)}%</span> tốc đánh.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  sinceTick = 0;

  onUpdate(): void {
    this.sinceTick += deltaTime;
    if (this.sinceTick < FROZEN_HEART_TICK_MS) return;
    this.sinceTick = 0;

    const holder = this.targetUnit;
    if (holder.isDead || holder.toRemove) return;

    for (const enemy of enemyChampionsAround(holder, FROZEN_HEART_RADIUS)) {
      const chill = new StatAmp(FROZEN_HEART_CHILL_MS, holder, enemy);
      // `percentBonus`, not a flat subtraction: attack speed is a rate with a
      // cap in core, and a flat -0.3 is most of a slow champion's whole swing
      // rate and a rounding error on a fast one.
      chill.bonuses = { attackSpeed: { percentBonus: -FROZEN_HEART_SLOW } };
      chill.name = 'Tim Băng';
      // `REPLACE_EXISTING`, not `StatAmp`'s own default. `STACKS_AND_CONTINUE`
      // deactivates only `preBuffs[0]` and relies on the sweep in the target's
      // `updateBuffs` to clear the rest — so between this tick and the enemy's
      // next frame two chills are live at once and their modifiers *add*. The
      // ring re-applies four times a second, which is exactly often enough to
      // stay ahead of that sweep.
      chill.buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
      chill.stackId = FROZEN_HEART_CHILL_STACK_ID;
      chill.image = this.image;
      enemy.addBuff(chill);
    }
  }
}

export default class Item_FrozenHeart extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_frozen_heart');
  name = 'Tim Băng (Item_FrozenHeart)';
  description = `Nội tại: kẻ địch đứng gần bị giảm ${pct(FROZEN_HEART_SLOW)}% tốc đánh`;
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
    const aura = new Item_FrozenHeart_Aura(0, this.owner, this.owner);
    aura.stackId = FROZEN_HEART_STACK_ID;
    aura.image = this.image;
    aura.hudVisible = false;
    aura.sourceSpell = this;
    this.owner.addBuff(aura);
  }
}
