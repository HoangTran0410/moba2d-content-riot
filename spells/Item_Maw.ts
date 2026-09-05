import type { AttackableUnit, CastSpec, DamageType } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const Shield = api.buffs.Shield;

/**
 * Chùy Gai Malmortius — Móng Vuốt Sterak for the fighter who is dying to a
 * *mage* in particular.
 *
 * Same threshold shape as `Item_Steraks.ts` (a purchase that is worth nothing
 * while winning and a health bar while losing), with two deliberate
 * differences: only **magic** damage can trip it, and the shield it fires
 * blocks only magic in turn (`Shield.absorbs`). Sterak answers being bursted;
 * this answers being bursted *by ability power*, on an item whose stats are
 * attack damage — the bruiser's way to buy into this shelf.
 *
 * The type test lives in `modifyIncomingDamage` (the one hook told the type)
 * and only latches; `onDamageTaken`, after the hit has fully resolved,
 * re-checks the real health bar and fires. The re-check matters: a shield may
 * have eaten the hit, in which case the lifeline must keep its powder dry.
 * Same split as `Item_ForceOfNature.ts`.
 */

/** Below this share of maximum health, the lifeline fires. */
export const MAW_THRESHOLD = 0.35;

/** A quarter of the pool, flat — bigger than Sterak's only against magic. */
export const MAW_SHIELD = 25;

export const MAW_SHIELD_MS = 4_000;

/** Real time, exactly as Sterak's — never a hit counter. */
export const MAW_COOLDOWN_MS = 30_000;

export const MAW_STACK_ID = 'item_maw';
export const MAW_SHIELD_STACK_ID = 'item_maw_shield';

// Hot violet — magic's own colour on the damage text, worn as a counter.
const MALMORTIUS: [number, number, number] = [190, 130, 255];

export class Item_Maw_Lifeline extends Buff {
  name = 'Chùy Gai Malmortius';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  /** Milliseconds before it can fire again; 0 means armed. */
  cooldownLeft = 0;
  /** Set by the chain link when a magic hit is about to cross the line. */
  private sawLethalMagic = false;

  onUpdate(): void {
    if (this.cooldownLeft > 0) this.cooldownLeft -= deltaTime;
  }

  modifyIncomingDamage(damage: number, attacker?: AttackableUnit, type?: DamageType): number {
    // Observe, never modify — the latch is spent below, once the hit settled.
    if (this.cooldownLeft <= 0 && type === 'MAGIC' && damage > 0) {
      if (attacker && attacker.teamId !== this.targetUnit.teamId) this.sawLethalMagic = true;
    }
    return damage;
  }

  onDamageTaken(): void {
    if (!this.sawLethalMagic) return;
    this.sawLethalMagic = false;
    if (this.cooldownLeft > 0) return;

    const unit = this.targetUnit;
    const max = unit.stats.maxHealth.value;
    if (max <= 0 || unit.isDead) return;
    if (unit.stats.health.baseValue > max * MAW_THRESHOLD) return;

    this.cooldownLeft = MAW_COOLDOWN_MS;

    const shield = new Shield(MAW_SHIELD_MS, unit, unit);
    shield.amount = MAW_SHIELD;
    shield.absorbs = ['MAGIC'];
    shield.name = 'Chùy Gai Malmortius';
    // Its own slot, as Sterak's: never evict a teammate's shield at the
    // exact moment both were needed.
    shield.stackId = MAW_SHIELD_STACK_ID;
    shield.color = [...MALMORTIUS];
    shield.image = this.image;
    unit.addBuff(shield);
  }
}

export default class Item_Maw extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_maw_of_malmortius');
  name = 'Chùy Gai Malmortius (Item_Maw)';
  description =
    `Nội tại: khi sát thương phép đưa máu xuống dưới ${pct(MAW_THRESHOLD)}%, nhận lá chắn phép ` +
    `${MAW_SHIELD} trong ${secs(MAW_SHIELD_MS)} giây (hồi lại sau ${secs(MAW_COOLDOWN_MS)} giây)`;
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
    const lifeline = new Item_Maw_Lifeline(0, this.owner, this.owner);
    lifeline.stackId = MAW_STACK_ID;
    lifeline.image = this.image;
    lifeline.sourceSpell = this;
    this.owner.addBuff(lifeline);
  }
}
