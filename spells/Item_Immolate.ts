import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const PredefinedFilters = api.combat.PredefinedFilters;

/**
 * Thiêu Đốt — the burn aura, and like the wound shelf it is one spell worn by
 * two items: Khiên Thái Dương (giáp/máu) and Áo Choàng Hắc Quang (kháng
 * phép/máu). The mechanic is the purchase either way — a tank whose *presence*
 * costs something — and which resistance rides along is the item's decision,
 * not this file's, exactly the way `Item_GrievousStrike` serves three swords.
 *
 * The tick reaches minions and monsters as well as champions, on purpose:
 * half of what an immolate item buys in the source game is holding a wave and
 * clearing a camp, and a burn that only warmed champions would be a worse
 * item wearing the same sentence. Turrets and other structures stay out — the
 * query walks the three unit classes, so a building cannot be set on fire.
 *
 * Modelled on Tim Băng's aura (`Item_FrozenHeart.ts`): re-queried on a slow
 * clock rather than entry/exit bookkeeping, damage dealt from `onUpdate` —
 * never from `draw`, which is skipped off-screen and unattributed
 * (`tests/vfxRules.test.ts`).
 */

/** How far the heat reaches. A shade under Tim Băng's chill. */
export const IMMOLATE_RADIUS = 170;

/** One tick a second — slow enough to read each number as it lands. */
export const IMMOLATE_TICK_MS = 1_000;

/**
 * Magic damage per tick, per victim: a floor plus a small share of the
 * WEARER's maximum health, because the burn rides tank items and health is
 * what their wearer actually builds. ~2 per tick on a mid-game tank
 * (~260 máu) — the flat number it replaced — and still a real cost to stand
 * beside a full-build one, which the flat 2 was not.
 */
export const IMMOLATE_BASE_PER_TICK = 1;
export const IMMOLATE_MAX_HEALTH_RATIO_PER_TICK = 0.004;

export const IMMOLATE_STACK_ID = 'item_immolate';

/** The recap groups by this — one mechanic, whichever item armed it. */
export const IMMOLATE_SOURCE = 'Thiêu Đốt';

// Low embers, not a spell's fireball: warm, dim, and under everything.
const EMBER: [number, number, number] = [255, 140, 70];

/** Burnable enemies around the wearer: champions, minions, monsters. Never structures. */
function burnableEnemiesAround(unit: AttackableUnit, radius: number): AttackableUnit[] {
  const found = unit.game.objectManager.queryObjects({
    area: new api.utils.Quadtree.Circle({ x: unit.position.x, y: unit.position.y, r: radius }),
    filters: [PredefinedFilters.type(api.units.AttackableUnit), PredefinedFilters.excludeDead],
  }) as AttackableUnit[];

  const out: AttackableUnit[] = [];
  for (const other of found) {
    if (other === unit || other.toRemove) continue;
    if (other.teamId === unit.teamId) continue;
    const burnable =
      other instanceof api.units.Champion ||
      other instanceof api.units.Minion ||
      other instanceof api.units.Monster;
    if (!burnable) continue;
    out.push(other);
  }
  return out;
}

export class Item_Immolate_Aura extends Buff {
  name = 'Thiêu Đốt';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  sinceTick = 0;

  onUpdate(): void {
    this.sinceTick += deltaTime;
    if (this.sinceTick < IMMOLATE_TICK_MS) return;
    this.sinceTick = 0;

    const holder = this.targetUnit;
    if (holder.isDead || holder.toRemove) return;

    const tick =
      IMMOLATE_BASE_PER_TICK + holder.stats.maxHealth.value * IMMOLATE_MAX_HEALTH_RATIO_PER_TICK;
    for (const enemy of burnableEnemiesAround(holder, IMMOLATE_RADIUS)) {
      enemy.takeDamage(tick, holder, 'MAGIC', IMMOLATE_SOURCE);
    }
  }

  /**
   * The warning label: a faint ember ring at the true radius, on the wearer.
   * Decoration only — the tick above never depends on anyone looking, and a
   * culled wearer still burns (`onUpdate` runs either way).
   */
  draw(): void {
    const holder = this.targetUnit;
    if (holder.isDead) return;
    const [r, g, b] = EMBER;
    const flicker = 22 + 8 * Math.sin(frameCount / 7);

    push();
    noFill();
    stroke(r, g, b, flicker);
    strokeWeight(4);
    circle(holder.position.x, holder.position.y, IMMOLATE_RADIUS * 2);
    pop();
  }
}

export default class Item_Immolate extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_sunfire_aegis');
  name = 'Thiêu Đốt (Item_Immolate)';
  description =
    `Nội tại: thiêu đốt kẻ địch đứng gần, gây ${IMMOLATE_BASE_PER_TICK} + ` +
    `${pct(IMMOLATE_MAX_HEALTH_RATIO_PER_TICK)}% máu tối đa của bản thân sát thương phép mỗi giây`;
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
    const aura = new Item_Immolate_Aura(0, this.owner, this.owner);
    aura.stackId = IMMOLATE_STACK_ID;
    aura.image = this.image;
    aura.sourceSpell = this;
    this.owner.addBuff(aura);
  }
}
