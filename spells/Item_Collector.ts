import type { AttackableUnit, CastSpec, DamageType } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const AoePulse = api.AoePulse;
const Champion = api.units.Champion;

/**
 * Súng Hải Tặc — the execute. Any damage the wearer deals that leaves an
 * enemy champion under the line finishes them, so the kill that was about to
 * slip out at a sliver of health is collected instead.
 *
 * `Buff.onDamageDealt` is the hook because the trigger is *the wearer's own
 * hit having just resolved* — the same seam the wound shelf reads — and the
 * finisher is `TRUE` damage of exactly the health that remains, dealt through
 * `takeDamage` with the wearer as source so the kill is credited and the
 * death recap can name the item. True, not physical: an execute that the
 * victim's armour could shave would sometimes leave its target alive on a
 * rounding error, which is a coin-flip sold as a guarantee.
 *
 * Re-entry is closed by the same guards that make it correct: the finisher
 * kills, so the hook's next firing sees `isDead` and returns — and the
 * `collecting` latch makes that contract explicit rather than load-bearing
 * on death being synchronous.
 */

/** The line, as a share of the victim's maximum health. */
export const COLLECTOR_THRESHOLD = 0.05;

export const COLLECTOR_STACK_ID = 'item_the_collector';

/** The coin-flash on a collected kill. */
export const COLLECTOR_FLASH_RADIUS = 40;
export const COLLECTOR_FLASH_MS = 300;

// Pirate silver-gold: a pale coin glint, nothing like the red of the hit
// that brought the target to the line.
const COIN_GLINT: [number, number, number] = [235, 220, 160];

export class Item_Collector_Debt extends Buff {
  name = 'Súng Hải Tặc';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  /** True while the finisher itself is in flight — see the header. */
  private collecting = false;

  onDamageDealt(_swung: number, _landed: number, victim: AttackableUnit, _type: DamageType): void {
    if (this.collecting) return;
    if (!(victim instanceof Champion)) return;
    if (victim.isDead || victim.toRemove) return;
    if (victim.teamId === this.targetUnit.teamId) return;

    const max = victim.stats.maxHealth.value;
    const left = victim.stats.health.baseValue;
    if (max <= 0 || left <= 0) return;
    if (left > max * COLLECTOR_THRESHOLD) return;

    this.collecting = true;
    victim.takeDamage(left, this.targetUnit, 'TRUE', 'Súng Hải Tặc');
    this.collecting = false;

    const flash = new AoePulse(this.targetUnit);
    flash.position = victim.position.copy();
    flash.radius = COLLECTOR_FLASH_RADIUS;
    flash.lifeTime = COLLECTOR_FLASH_MS;
    flash.color = [...COIN_GLINT];
    flash.fillAlpha = 55;
    this.game.objectManager.addObject(flash);
  }
}

export default class Item_Collector extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_the_collector');
  name = 'Súng Hải Tặc (Item_Collector)';
  description =
    `Nội tại: sát thương bạn gây ra kết liễu tướng địch còn dưới ` +
    `${pct(COLLECTOR_THRESHOLD)}% máu tối đa`;
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
    const debt = new Item_Collector_Debt(0, this.owner, this.owner);
    debt.stackId = COLLECTOR_STACK_ID;
    debt.image = this.image;
    debt.sourceSpell = this;
    this.owner.addBuff(debt);
  }
}
