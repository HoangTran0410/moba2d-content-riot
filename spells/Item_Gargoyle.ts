import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { secs } from '../text';

const Spell = api.Spell;
const StatAmp = api.buffs.StatAmp;
const AoePulse = api.AoePulse;

/**
 * Thú Tượng Thạch Giáp's active — hoá đá: four seconds of being the statue
 * the fight breaks against.
 *
 * The item's stats are both resistances at once and its button is *more of
 * both, now*: the moment the whole enemy team turns on the wearer, one press
 * buys the peel window everything else on this shelf is passive about. A
 * `StatAmp` and nothing else — no damage, no crowd control — because the
 * purchase is time, and time is what resistances are.
 *
 * `REPLACE_EXISTING` on its own stackId: pressing again mid-buff (two
 * Gargoyles, a sell-rebuy trick) refreshes the stone rather than stacking a
 * double wall nobody priced.
 */

/** Flat points of both resistances while the stone holds. */
export const GARGOYLE_BONUS_RESISTS = 25;

export const GARGOYLE_MS = 4_000;

/** Inside the actives' 10-18s band; the practice room's ceiling is 20s. */
export const GARGOYLE_COOLDOWN_MS = 16_000;

export const GARGOYLE_STACK_ID = 'item_gargoyle_stone';

// Weathered granite — deliberately grey in a shop of golds and blues, so
// "that tank just turned to stone" reads at a glance.
const GRANITE: [number, number, number] = [185, 190, 200];

/** The press flash: a tight shell snapping shut around the wearer. */
export const STONE_SHELL_RADIUS = 52;
export const STONE_SHELL_MS = 320;

export default class Item_Gargoyle extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_gargoyle_stoneplate');
  name = 'Thú Tượng Thạch Giáp (Item_Gargoyle)';
  description =
    `Kích hoạt: tăng ${GARGOYLE_BONUS_RESISTS} giáp và ${GARGOYLE_BONUS_RESISTS} kháng phép ` +
    `trong ${secs(GARGOYLE_MS)} giây`;
  coolDown = GARGOYLE_COOLDOWN_MS;
  manaCost = 0;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: this.coolDown },
    };
  }

  onSpellCast() {
    const stone = new StatAmp(GARGOYLE_MS, this.owner, this.owner);
    stone.bonuses = {
      armor: { flatBonus: GARGOYLE_BONUS_RESISTS },
      magicResist: { flatBonus: GARGOYLE_BONUS_RESISTS },
    };
    stone.name = 'Thú Tượng Thạch Giáp';
    stone.buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
    stone.stackId = GARGOYLE_STACK_ID;
    stone.image = this.image;
    this.owner.addBuff(stone);

    const shell = new AoePulse(this.owner);
    shell.position = this.owner.position.copy();
    shell.radius = STONE_SHELL_RADIUS;
    shell.lifeTime = STONE_SHELL_MS;
    shell.color = [...GRANITE];
    shell.fillAlpha = 60;
    this.game.objectManager.addObject(shell);
  }
}
