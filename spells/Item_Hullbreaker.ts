import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { alliedChampionsAround } from './Item_Shurelya';
import { pct } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const StatsModifier = api.units.StatsModifier;

/**
 * Búa Tiến Công — the item for the champion who is somewhere else. While no
 * allied champion stands with the wearer, the hull plates are up: bonus
 * armour and magic resist for exactly as long as the wearer is genuinely
 * alone. Walk back to the team and the plates come off.
 *
 * The check re-queries on a slow clock rather than keeping entry/exit
 * bookkeeping — Tim Băng's argument, `Item_Immolate.ts` restates it — and
 * the ally sweep is Khúc Ca Shurelya's own (`alliedChampionsAround`), because
 * "is anyone with me" and "who runs with me" must be the same question with
 * the radius as the only difference.
 *
 * ## Why the grant is a raw `StatsModifier`, not a re-issued buff
 *
 * Giáp Người Chết's momentum states the rule: state that flips on and off
 * with a condition owns one modifier and swaps it, because a buff re-applied
 * from `onUpdate` is a clock being wound forever. The watcher below owns the
 * modifier, adds it when the wearer becomes alone, removes it when company
 * arrives or the item is sold (`onDeactivate` — selling must not leave
 * phantom resistances behind).
 */

/**
 * Armour and magic resist while alone, as a share of what the wearer already
 * has — the outer multiplier slot, so it multiplies the resists the rest of
 * the build bought rather than adding a flat 15 that late-game damage walks
 * through. ~15 bonus armour on a mid-game bruiser with one armour item
 * (~60 giáp); the magic-resist half runs softer early on the same body and
 * catches up with the build, which is the point.
 */
export const HULLBREAKER_RESISTS_RATIO = 0.25;

/** "Alone" means no allied champion within this range. */
export const HULLBREAKER_ALLY_RADIUS = 350;

/** How often the question is re-asked. */
export const HULLBREAKER_CHECK_MS = 500;

export const HULLBREAKER_STACK_ID = 'item_hullbreaker';

// Weathered iron: a dim, heavy grey-blue — plating, not a spell.
const IRON_PLATE: [number, number, number] = [170, 185, 205];

export class Item_Hullbreaker_Plates extends Buff {
  name = 'Búa Tiến Công';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  /** Whether the plates are currently worn. */
  platesUp = false;
  private sinceCheck = HULLBREAKER_CHECK_MS;
  private modifier = new StatsModifier();

  onCreate(): void {
    this.modifier = new StatsModifier();
    this.modifier.armor.percentBonus = HULLBREAKER_RESISTS_RATIO;
    this.modifier.magicResist.percentBonus = HULLBREAKER_RESISTS_RATIO;
  }

  onUpdate(): void {
    this.sinceCheck += deltaTime;
    if (this.sinceCheck < HULLBREAKER_CHECK_MS) return;
    this.sinceCheck = 0;

    const holder = this.targetUnit;
    if (holder.isDead || holder.toRemove) {
      this.setPlates(false);
      return;
    }
    const alone = alliedChampionsAround(holder, HULLBREAKER_ALLY_RADIUS).length === 0;
    this.setPlates(alone);
  }

  onDeactivate(): void {
    this.setPlates(false);
  }

  private setPlates(up: boolean): void {
    if (up === this.platesUp) return;
    this.platesUp = up;
    if (up) this.targetUnit.stats.addModifier(this.modifier);
    else this.targetUnit.stats.removeModifier(this.modifier);
  }

  /** The worn state, on the rim: two heavy plating arcs while the bonus is real. */
  draw(): void {
    if (!this.platesUp || this.targetUnit.isDead) return;
    const pos = this.targetUnit.position;
    const radius = this.targetUnit.animatedValues.displaySize / 2 + 6;
    const [r, g, b] = IRON_PLATE;

    push();
    noFill();
    stroke(r, g, b, 120);
    strokeWeight(4);
    for (let i = 0; i < 2; i++) {
      const start = HALF_PI / 2 + i * PI;
      arc(pos.x, pos.y, radius * 2, radius * 2, start, start + 1.3);
    }
    pop();
  }
}

export default class Item_Hullbreaker extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_hullbreaker');
  name = 'Búa Tiến Công (Item_Hullbreaker)';
  description =
    `Nội tại: khi không có đồng minh nào đứng gần, tăng ` +
    `${pct(HULLBREAKER_RESISTS_RATIO)}% giáp và kháng phép`;
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
    const plates = new Item_Hullbreaker_Plates(0, this.owner, this.owner);
    plates.stackId = HULLBREAKER_STACK_ID;
    plates.image = this.image;
    plates.sourceSpell = this;
    this.owner.addBuff(plates);
  }
}
