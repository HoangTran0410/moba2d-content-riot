import type { AttackableUnit, CastSpec, DamageType } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const HealCut = api.buffs.HealCut;

/**
 * Vết Thương Sâu on the **physical** side — the passive behind Gươm Đồ Tể and
 * everything built out of it.
 *
 * ## One spell, three items
 *
 * Gươm Đồ Tể, Lời Nhắc Tử Vong and Cưa Xích Hóa Kỹ all say the same sentence
 * in the shop, because they are the same mechanic sold to three builds — a
 * cheap component, a crit finisher and a bruiser's slab. Three copies of this
 * file would be three places to retune one number, and the two that were not
 * retuned would be the ones a player buys. The *stats* are what differ, and
 * those live in `data.ts` where a designer is already reading them.
 *
 * Holding two of them at once is legal and does nothing extra: both arm this
 * buff, both apply the same `HealCut`, and core's `RENEW_EXISTING` keeps one
 * wound on the victim rather than two.
 *
 * ## Why the split is by damage type
 *
 * League splits its wound items by "physical damage" and "magic damage", and
 * this engine's one damage funnel carries exactly that — `DamageType` is what
 * arrives at `onDamageDealt`, and what dealt the hit is not. `TRUE` counts as
 * physical here for the same reason core's `lifesteal` pays out of it
 * (`combat/Vamp.ts`): it is what an armour-shredding build deals, and the
 * player who bought this item is the one dealing it.
 */

/** Share of every heal the wound takes. Core's own default, said out loud. */
export const WOUND_PERCENT = 0.4;

/** How long it lasts after the hit that applied it. */
export const WOUND_MS = 3_000;

/** Its own tag: two wound items in one bag are one armed passive, not two. */
export const WOUND_STACK_ID = 'item_grievous_strike';

export class Item_GrievousStrike_Wound extends Buff {
  name = 'Gươm Đồ Tể';
  description =
    `Sát thương vật lý bạn gây ra đặt <span class="buff">Vết Thương Sâu</span>: ` +
    `giảm <span class="buff">${pct(WOUND_PERCENT)}%</span> mọi hiệu ứng hồi máu của mục tiêu trong ` +
    `<span class="time">${secs(WOUND_MS)} giây</span>.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  onDamageDealt(_swung: number, _landed: number, victim: AttackableUnit, type: DamageType): void {
    // Magic is the other item's half of the shelf. Answering both would make
    // one 600-gold component the whole counter to sustain in the game.
    if (type === 'MAGIC') return;
    if (victim.isDead || victim.toRemove) return;

    const wound = new HealCut(WOUND_MS, this.targetUnit, victim);
    wound.healCut = WOUND_PERCENT;
    victim.addBuff(wound);
  }
}

export default class Item_GrievousStrike extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_executioners_calling');
  name = 'Gươm Đồ Tể (Item_GrievousStrike)';
  description =
    `Nội tại: sát thương vật lý gây ra đặt Vết Thương Sâu, giảm ${pct(WOUND_PERCENT)}% lượng hồi máu` +
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
    const wound = new Item_GrievousStrike_Wound(0, this.owner, this.owner);
    wound.stackId = WOUND_STACK_ID;
    wound.image = this.image;
    // Armed for as long as the item is held: the inventory slot already says
    // so, and a permanent icon on the bar says it a second time every frame.
    wound.hudVisible = false;
    // Tied to the item rather than to the life, or a sold Gươm Đồ Tể keeps
    // wounding for the rest of the match.
    wound.sourceSpell = this;
    this.owner.addBuff(wound);
  }
}
