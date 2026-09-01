import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Item_GrievousStrike, { WOUND_MS, WOUND_PERCENT } from '../../spells/Item_GrievousStrike';
import Item_GrievousMagic from '../../spells/Item_GrievousMagic';
import Item_BrambleVest from '../../spells/Item_BrambleVest';
import Item_Thornmail from '../../spells/Item_Thornmail';
import Item_SerpentsFang, { FANG_PERCENT } from '../../spells/Item_SerpentsFang';

installSketchMathGlobals();
installSpellObjectGlobals();

const api = buildTestApi();
const { HealCut, Shield, ShieldCut } = api.buffs;

/**
 * Vết Thương Sâu, as this pack sells it: three passives, six items, one
 * mechanic that lives in core (`combat/Healing.ts`).
 *
 * What is worth testing here is only the pack's half — **which hits wound
 * whom**. That the wound then reduces healing is core's own contract and core
 * tests it; the one case below that reaches through to a heal is there because
 * the two halves are in different repositories and the seam between them is
 * exactly the thing a version bump can break silently.
 */
const wounded = (unit: { buffs: { toRemove: boolean }[] }): boolean =>
  unit.buffs.some(buff => buff instanceof HealCut && !buff.toRemove);

describe('the wound shelf', () => {
  let game: TestGame;

  beforeEach(() => {
    game = createGame();
  });

  describe('Item_GrievousStrike — the physical half', () => {
    it('wounds whoever the holder damages with a physical hit', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      expect(pressSpell(new Item_GrievousStrike(holder))).toBe(true);

      victim.takeDamage(20, holder, 'PHYSICAL');

      expect(wounded(victim)).toBe(true);
      expect(wounded(holder), 'the holder wounded itself').toBe(false);
    });

    /**
     * True damage counts as physical, the same way core's `lifesteal` pays out
     * of it — an armour-shredding build is exactly who buys this item, and a
     * type that wounded nobody would be a hole in the shelf rather than a
     * design.
     */
    it('counts true damage as physical', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      pressSpell(new Item_GrievousStrike(holder));

      victim.takeDamage(20, holder, 'TRUE');

      expect(wounded(victim)).toBe(true);
    });

    it('leaves a magic hit to the other half of the shelf', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      pressSpell(new Item_GrievousStrike(holder));

      victim.takeDamage(20, holder, 'MAGIC');

      expect(wounded(victim)).toBe(false);
    });

    it('carries the duration the item advertises', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      pressSpell(new Item_GrievousStrike(holder));

      victim.takeDamage(20, holder, 'PHYSICAL');

      const wound = victim.buffs.find(buff => buff instanceof HealCut);
      expect(wound?.duration).toBe(WOUND_MS);
      expect((wound as unknown as { healCut: number }).healCut).toBe(WOUND_PERCENT);
    });
  });

  describe('Item_GrievousMagic — the mage half', () => {
    it('wounds on magic damage, which no on-hit item could have done', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      expect(pressSpell(new Item_GrievousMagic(holder))).toBe(true);

      victim.takeDamage(20, holder, 'MAGIC');

      expect(wounded(victim)).toBe(true);
    });

    it('leaves a physical hit alone', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      pressSpell(new Item_GrievousMagic(holder));

      victim.takeDamage(20, holder, 'PHYSICAL');

      expect(wounded(victim)).toBe(false);
    });
  });

  describe('Item_BrambleVest — the one that answers being hit', () => {
    it('wounds whoever hurts the holder, whatever the damage was', () => {
      const holder = createUnit(game, 0);
      const attacker = createUnit(game, 120, 'red');
      expect(pressSpell(new Item_BrambleVest(holder))).toBe(true);

      holder.takeDamage(20, attacker, 'MAGIC');

      expect(wounded(attacker)).toBe(true);
      expect(wounded(holder)).toBe(false);
    });

    it('does not wound the holder for a cost the holder paid itself', () => {
      const holder = createUnit(game, 0);
      pressSpell(new Item_BrambleVest(holder));

      holder.takeDamage(20, holder, 'TRUE');

      expect(wounded(holder)).toBe(false);
    });

    it('has nobody to wound when the map itself does the damage', () => {
      const holder = createUnit(game, 0);
      pressSpell(new Item_BrambleVest(holder));

      expect(() => holder.takeDamage(20, undefined, 'TRUE')).not.toThrow();
    });
  });

  /**
   * The recipe's promise. Giáp Gai builds out of Áo Choàng Gai, and combining
   * swaps the parts' whole contribution for the finished item's — so the
   * upgrade has to keep the wound as well as add the spikes, or the shop
   * charges 450 gold to lose the reason the component was bought.
   */
  describe('Item_Thornmail — the upgrade keeps the component’s wound', () => {
    it('wounds the attacker and still pays the spikes back', () => {
      const holder = createUnit(game, 0);
      const attacker = createUnit(game, 120, 'red');
      pressSpell(new Item_Thornmail(holder));

      holder.takeDamage(20, attacker, 'PHYSICAL');

      expect(wounded(attacker), 'the upgrade dropped Áo Choàng Gai’s wound').toBe(true);
      expect(attacker.stats.health.baseValue, 'the spikes stopped paying').toBe(95);
    });
  });

  /**
   * The shield's own counter. Kẻ Săn Mồi Tàn Nhẫn already strips what is
   * standing; this one is about what the enemy team casts *next*, which is why
   * both can exist in the same game.
   */
  describe('Item_SerpentsFang — the shield’s counter', () => {
    it('cracks the guard of whoever it hits with physical damage', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      expect(pressSpell(new Item_SerpentsFang(holder))).toBe(true);

      victim.takeDamage(20, holder, 'PHYSICAL');

      expect(victim.buffs.some(buff => buff instanceof ShieldCut && !buff.toRemove)).toBe(true);
    });

    it('halves a shield the enemy team casts afterwards, and not one already up', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      pressSpell(new Item_SerpentsFang(holder));

      // Typed to magic so the physical hit below cannot eat any of it: the
      // only thing that could move this number is the crack, which is the
      // whole claim.
      const standing = new Shield(5_000, victim, victim);
      standing.amount = 60;
      standing.absorbs = ['MAGIC'];
      victim.addBuff(standing);

      victim.takeDamage(20, holder, 'PHYSICAL');

      const rescued = new Shield(5_000, victim, victim);
      rescued.amount = 60;
      rescued.stackId = 'a-second-shield';
      victim.addBuff(rescued);

      expect(standing.amount, 'reached backwards into a shield already up').toBe(60);
      expect(rescued.amount).toBe(60 * (1 - FANG_PERCENT));
    });

    it('leaves a magic hit to nobody — it is an attack-damage item', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      pressSpell(new Item_SerpentsFang(holder));

      victim.takeDamage(20, holder, 'MAGIC');

      expect(victim.buffs.some(buff => buff instanceof ShieldCut)).toBe(false);
    });
  });

  /**
   * The one case that reaches all the way through core. The two halves ship
   * from different repositories, so "the pack applies a buff" and "the buff
   * reduces healing" can pass separately while the seam between them is
   * broken by a version bump.
   */
  describe('the seam into core', () => {
    it('leaves a wounded champion healing for less', () => {
      const holder = createUnit(game, 0);
      const victim = createUnit(game, 120, 'red');
      pressSpell(new Item_GrievousStrike(holder));
      victim.stats.maxHealth.baseValue = 200;
      victim.stats.health.baseValue = 100;

      victim.takeDamage(20, holder, 'PHYSICAL');
      const afterHit = victim.stats.health.baseValue;
      victim.takeHeal(50);

      // 50 heal, 40% of it taken by the wound. Written out rather than derived
      // from WOUND_PERCENT: a probe that recomputes the rule it checks agrees
      // with the rule however wrong the rule is.
      expect(victim.stats.health.baseValue - afterHit).toBe(30);
    });
  });
});
