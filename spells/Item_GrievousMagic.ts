import type { AttackableUnit, CastSpec, DamageType } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const HealCut = api.buffs.HealCut;

/**
 * Vết Thương Sâu on the **magic** side — Ngọc Quên Lãng and Quỷ Thư Morello.
 *
 * The mage half of the shelf, and the reason core grew `Buff.onDamageDealt` at
 * all: `Buff.onHit` fires for basic attacks only, so a wound item hung there
 * would have been sold to a mage who never swings. See
 * `Item_GrievousStrike.ts` for why one file serves several items and why the
 * split is by damage type rather than by "ability or attack".
 */

/** Share of every heal the wound takes. The physical half charges the same. */
export const WOUND_PERCENT = 0.4;

/** How long it lasts after the hit that applied it. */
export const WOUND_MS = 3_000;

/** Its own tag, kept apart from the physical half's armed passive. */
export const WOUND_STACK_ID = 'item_grievous_magic';

export class Item_GrievousMagic_Wound extends Buff {
  name = 'Quỷ Thư Morello';
  description =
    `Sát thương phép bạn gây ra đặt <span class="buff">Vết Thương Sâu</span>: ` +
    `giảm <span class="buff">${pct(WOUND_PERCENT)}%</span> mọi hiệu ứng hồi máu của mục tiêu trong ` +
    `<span class="time">${secs(WOUND_MS)} giây</span>.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  onDamageDealt(_swung: number, _landed: number, victim: AttackableUnit, type: DamageType): void {
    if (type !== 'MAGIC') return;
    if (victim.isDead || victim.toRemove) return;

    const wound = new HealCut(WOUND_MS, this.targetUnit, victim);
    wound.healCut = WOUND_PERCENT;
    victim.addBuff(wound);
  }
}

export default class Item_GrievousMagic extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_oblivion_orb');
  name = 'Ngọc Quên Lãng (Item_GrievousMagic)';
  description =
    `Nội tại: sát thương phép gây ra đặt Vết Thương Sâu, giảm ${pct(WOUND_PERCENT)}% lượng hồi máu` +
    ` của mục tiêu trong ${secs(WOUND_MS)} giây`;
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
    const wound = new Item_GrievousMagic_Wound(0, this.owner, this.owner);
    wound.stackId = WOUND_STACK_ID;
    wound.image = this.image;
    wound.hudVisible = false;
    wound.sourceSpell = this;
    this.owner.addBuff(wound);
  }
}
