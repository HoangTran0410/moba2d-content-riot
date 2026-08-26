import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const AoePulse = api.AoePulse;

/**
 * Bình Minh & Hoàng Hôn — the doubling passive: every real swing applies the
 * wearer's ON-HIT EFFECTS twice. Simpler than Cuồng Đao Guinsoo's phantom (no
 * rage, no rhythm — every swing), and priced for it: the item is the shop's
 * most expensive, and its other half is a slab of health.
 *
 * A propagator, so `OnHit.ts`'s rule: the second application is `echo: true`
 * and this buff refuses to act on an echo. Beside Guinsoo, both double the
 * same real swing independently — payloads land three times at full rage on
 * the third hit, never more, because neither propagator acts on the other's
 * echo.
 */

const DAWN_GOLD: [number, number, number] = [255, 215, 130];
const DUSK_VIOLET: [number, number, number] = [150, 110, 220];

export class Item_DuskAndDawn_Twin extends Buff {
  name = 'Bình Minh & Hoàng Hôn';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // A permanent armed state: the inventory slot already shows the item, so
  // this stays off the HUD buff row and the overhead strip (Buff.hudVisible).
  hudVisible = false;

  onHit(hit: OnHitEvent): void {
    if (hit.echo) return;
    api.combat.applyOnHitEffects({ ...hit, echo: true });
    this.showTwinFlash(hit);
  }

  /**
   * Two offset rings, dawn's gold over dusk's violet — the doubling drawn as
   * the two halves the item is named for, and nothing else: the doubled
   * effects already paint their own procs.
   */
  private showTwinFlash(hit: OnHitEvent): void {
    const dawn = new AoePulse(this.targetUnit);
    dawn.position = hit.victim.position.copy();
    dawn.radius = 38;
    dawn.lifeTime = 220;
    dawn.color = [...DAWN_GOLD];
    dawn.fillAlpha = 24;
    this.game.objectManager.addObject(dawn);

    const dusk = new AoePulse(this.targetUnit);
    dusk.position = hit.victim.position.copy();
    dusk.radius = 52;
    dusk.lifeTime = 260;
    dusk.color = [...DUSK_VIOLET];
    dusk.fillAlpha = 0;
    this.game.objectManager.addObject(dusk);
  }
}

export default class Item_DuskAndDawn extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_dusk_and_dawn');
  name = 'Bình Minh & Hoàng Hôn (Item_DuskAndDawn)';
  description = 'Nội tại: các hiệu ứng đòn đánh của bạn kích hoạt 2 lần mỗi đòn đánh';
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
    const twin = new Item_DuskAndDawn_Twin(0, this.owner, this.owner);
    twin.stackId = 'item_dusk_and_dawn';
    twin.image = this.image;
    twin.sourceSpell = this;
    this.owner.addBuff(twin);
  }
}
