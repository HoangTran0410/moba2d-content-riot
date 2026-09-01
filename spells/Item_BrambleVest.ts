import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const HealCut = api.buffs.HealCut;

/**
 * Áo Choàng Gai: the wound the *wearer* does not have to land anything for.
 *
 * The other two wound items ask their owner to hit somebody. This one answers
 * being hit, which is the whole reason a tank can carry the counter to
 * sustain: the champion who is being auto-attacked all fight is rarely the one
 * choosing what to damage.
 *
 * `onDamageTaken` rather than an on-hit hook: a buff on the *victim* has no
 * on-hit seam — `Buff.onHit` walks the attacker's buffs — and the sentence
 * this item wants is "whoever is hurting me stops healing off it", which is
 * every kind of damage, not only a swing. That is broader than League's
 * version and deliberately so; the item is 650 gold of armour on a shelf where
 * the two attacker-side wounds cost more and do more.
 *
 * The reflect half is Giáp Gai's (`Item_Thornmail.ts`), which arms this same
 * wound alongside its spikes — combining the two must not lose what the
 * component did.
 */

/** Share of every heal the wound takes. Same number across the whole shelf. */
export const WOUND_PERCENT = 0.4;

/** How long it lasts after the hit that applied it. */
export const WOUND_MS = 3_000;

/** Its own tag: Giáp Gai arms this buff too, and one wearer means one instance. */
export const WOUND_STACK_ID = 'item_bramble_vest';

export class Item_BrambleVest_Wound extends Buff {
  name = 'Áo Choàng Gai';
  description =
    `Kẻ đánh trúng bạn dính <span class="buff">Vết Thương Sâu</span>: giảm ` +
    `<span class="buff">${pct(WOUND_PERCENT)}%</span> mọi hiệu ứng hồi máu của chúng trong ` +
    `<span class="time">${secs(WOUND_MS)} giây</span>.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  onDamageTaken(_swung: number, _landed: number, attacker?: AttackableUnit): void {
    // No attacker is a burn, a fountain, the map itself — nothing with a body
    // to wound. Self-damage is a cost the wearer paid, not an attack on them.
    if (!attacker || attacker === this.targetUnit) return;
    if (attacker.isDead || attacker.toRemove) return;

    const wound = new HealCut(WOUND_MS, this.targetUnit, attacker);
    wound.healCut = WOUND_PERCENT;
    attacker.addBuff(wound);
  }
}

export default class Item_BrambleVest extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_bramble_vest');
  name = 'Áo Choàng Gai (Item_BrambleVest)';
  description =
    `Nội tại: kẻ đánh trúng bạn dính Vết Thương Sâu, giảm ${pct(WOUND_PERCENT)}% lượng hồi máu` +
    ` của chúng trong ${secs(WOUND_MS)} giây`;
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
    const wound = new Item_BrambleVest_Wound(0, this.owner, this.owner);
    wound.stackId = WOUND_STACK_ID;
    wound.image = this.image;
    wound.hudVisible = false;
    wound.sourceSpell = this;
    this.owner.addBuff(wound);
  }
}
