import type { AttackableUnit, CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SpellbladeBuff, SPELLBLADE_ICD_MS } from './Item_Sheen';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Slow = api.buffs.Slow;
const PredefinedFilters = api.combat.PredefinedFilters;

/**
 * Găng Tay Băng Giá — the tank's spellblade. Thủy Kiếm's own ratio (this is
 * the fist that holds the gauntlet, not a damage upgrade), and the proc's
 * point is the frost: everyone standing at the target slows, which is the
 * bruiser-tank's way of *keeping* the fight it walked into.
 *
 * A `SpellbladeBuff` subclass exactly as Tam Hợp Kiếm is — the family's
 * charge window, internal cooldown, echo rule and armed shimmer all live in
 * `Item_Sheen.ts`, and the shared `item_spellblade` stackId is what keeps two
 * spellblade items from double-proccing one swing. What is written here is
 * only what this one's empowered hit *does*.
 */

/** The empowered hit: Thủy Kiếm's own share of base attack damage. */
export const ICEBORN_BASE_AD_RATIO = 0.5;

export const ICEBORN_SLOW_PERCENT = 0.25;

export const ICEBORN_SLOW_MS = 1_500;

/** The frost field around the struck target. */
export const ICEBORN_FIELD_RADIUS = 120;

export const ICEBORN_SLOW_STACK_ID = 'item_iceborn_slow';

// Glacier blue-white — colder than Sheen's, so the two procs read apart.
const GLACIER: [number, number, number] = [170, 225, 255];

/** Enemy champions in the frost — around the *victim*, not the wearer. */
function enemyChampionsNear(
  attacker: AttackableUnit,
  center: AttackableUnit,
  radius: number
): AttackableUnit[] {
  const found = attacker.game.objectManager.queryObjects({
    area: new api.utils.Quadtree.Circle({ x: center.position.x, y: center.position.y, r: radius }),
    filters: [PredefinedFilters.type(api.units.Champion), PredefinedFilters.excludeDead],
  }) as AttackableUnit[];

  const out: AttackableUnit[] = [];
  for (const other of found) {
    if (other === center || other.toRemove) continue;
    if (other.teamId === attacker.teamId) continue;
    out.push(other);
  }
  return out;
}

export class Item_Iceborn_Blade extends SpellbladeBuff {
  name = 'Găng Tay Băng Giá';
  description =
    `Sau khi dùng một chiêu thức, đòn đánh kế tiếp gây thêm ` +
    `<span class="buff">${pct(ICEBORN_BASE_AD_RATIO)}%</span> công cơ bản và làm chậm ` +
    `<span class="buff">${pct(ICEBORN_SLOW_PERCENT)}%</span> các kẻ địch quanh mục tiêu trong ` +
    `<span class="time">${secs(ICEBORN_SLOW_MS)} giây</span>.`;
  flashColor: [number, number, number] = GLACIER;

  protected payload(hit: OnHitEvent): void {
    const base = this.targetUnit.stats.attackDamage.baseValue;
    hit.victim.takeDamage(
      base * ICEBORN_BASE_AD_RATIO,
      this.targetUnit,
      'PHYSICAL',
      'Găng Tay Băng Giá'
    );

    // The struck target first, then everyone stood with it. RENEW_EXISTING on
    // one stackId: a spellblade re-proccing every 1.5s must rewind the same
    // slow, not stack a second one (the Ekko Q / Singed W rule).
    const chilled: AttackableUnit[] = [
      hit.victim,
      ...enemyChampionsNear(this.targetUnit, hit.victim, ICEBORN_FIELD_RADIUS),
    ];
    for (const enemy of chilled) {
      if (enemy.isDead || enemy.toRemove) continue;
      const slow = new Slow(ICEBORN_SLOW_MS, this.targetUnit, enemy);
      slow.percent = ICEBORN_SLOW_PERCENT;
      slow.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      slow.stackId = ICEBORN_SLOW_STACK_ID;
      enemy.addBuff(slow);
    }
  }
}

export default class Item_Iceborn extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_iceborn_gauntlet');
  name = 'Găng Tay Băng Giá (Item_Iceborn)';
  description =
    `Nội tại: sau khi dùng chiêu, đòn đánh kế tiếp gây thêm ${pct(ICEBORN_BASE_AD_RATIO)}% công ` +
    `cơ bản và làm chậm ${pct(ICEBORN_SLOW_PERCENT)}% các kẻ địch quanh mục tiêu trong ` +
    `${secs(ICEBORN_SLOW_MS)} giây (hồi ${secs(SPELLBLADE_ICD_MS)} giây)`;
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
    const blade = new Item_Iceborn_Blade(0, this.owner, this.owner);
    blade.stackId = 'item_spellblade';
    blade.image = this.image;
    blade.sourceSpell = this;
    this.owner.addBuff(blade);
  }
}
