import type { CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

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

/**
 * Both resistances while the stone holds, as a share of what the wearer
 * already has (the outer multiplier slot) — stone armour over real armour,
 * so the button is worth the most on the tank who committed to the shelf
 * and never rots into a flat 25 late. ~24 bonus armour on a mid-game tank
 * (~95 giáp with this item's own 40 on).
 */
export const GARGOYLE_RESIST_RATIO = 0.25;

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
    `Kích hoạt: tăng ${pct(GARGOYLE_RESIST_RATIO)}% giáp và kháng phép ` +
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
      armor: { percentBonus: GARGOYLE_RESIST_RATIO },
      magicResist: { percentBonus: GARGOYLE_RESIST_RATIO },
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
