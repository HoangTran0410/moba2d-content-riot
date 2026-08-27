import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SpellbladeBuff, SPELLBLADE_ICD_MS } from './Item_Sheen';

const Spell = api.Spell;

/**
 * Tam Hợp Kiếm — the finished spellblade, tuned for the champions who weave an
 * ability between every swing (Ezreal, Jax, Irelia in the source material).
 *
 * The whole file is `payload()`: the family's charge window, internal
 * cooldown, echo rule and proc flash all live in `SpellbladeBuff`
 * (`Item_Sheen.ts`), so what Tam Hợp Kiếm *is* — twice Thủy Kiếm's ratio, in
 * gold — is the only thing written here.
 */

/** The empowered hit: this share of the wearer's base attack damage, physical. */
export const TRINITY_BASE_AD_RATIO = 1.0;

const TRINITY_GOLD: [number, number, number] = [255, 205, 110];

export class Item_TrinityForce_Blade extends SpellbladeBuff {
  name = 'Tam Hợp Kiếm';
  flashColor: [number, number, number] = TRINITY_GOLD;

  protected payload(hit: OnHitEvent): void {
    const base = this.targetUnit.stats.attackDamage.baseValue;
    hit.victim.takeDamage(base * TRINITY_BASE_AD_RATIO, this.targetUnit, 'PHYSICAL');
  }
}

export default class Item_TrinityForce extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_trinity_force');
  name = 'Tam Hợp Kiếm (Item_TrinityForce)';
  description =
    `Nội tại: sau khi dùng chiêu, đòn đánh kế tiếp gây thêm sát thương vật lý bằng` +
    ` ${TRINITY_BASE_AD_RATIO * 100}% công cơ bản (hồi ${SPELLBLADE_ICD_MS / 1000} giây)`;
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
    const blade = new Item_TrinityForce_Blade(0, this.owner, this.owner);
    blade.stackId = 'item_spellblade';
    blade.image = this.image;
    blade.sourceSpell = this;
    this.owner.addBuff(blade);
  }
}
