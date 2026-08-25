import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Item_Ghostblade, { SPEED_PERCENT } from '../../spells/Item_Ghostblade';
import Item_Quicksilver from '../../spells/Item_Quicksilver';
import Item_Thornmail, { REFLECT_PERCENT, REFLECT_STACK_ID } from '../../spells/Item_Thornmail';
import Item_Zhonyas, { DURATION_MS as ZHONYAS_DURATION_MS } from '../../spells/Item_Zhonyas';

const api = buildTestApi();
const { DamageReflect, Root, Speedup, Stasis, Stun } = api.buffs;

/**
 * The four spells the shop's items bring, driven the way a key press drives
 * them.
 *
 * Every case goes through `pressSpell`, never `onSpellCast` — the
 * `spell-runtime-drive` seam bans the second, and the reason is that calling a
 * hook by hand runs that hook alone: no activation pattern, no resource
 * commit, no cooldown, no refusal. An item active that cannot actually be
 * *pressed* is the failure worth catching, and it is the one a direct hook
 * call cannot see.
 *
 * Tuning values arrive as imported constants, so retuning an item is not
 * editing a test. The numbers written out longhand below are the ones a
 * *probe* needs — a hit of 20 and a resulting 95 health — because a probe
 * computed from the constant it is checking agrees with itself however wrong
 * the constant becomes.
 */

type AnyBuff = InstanceType<typeof api.buffs.Buff>;

/** The buffs actually still on a unit — `deactivateBuff` marks, it does not splice. */
const live = (unit: { buffs: AnyBuff[] }): AnyBuff[] => unit.buffs.filter(b => !b.toRemove);

const hasBuff = (
  unit: { buffs: AnyBuff[] },
  kind: abstract new (...args: never[]) => AnyBuff
): boolean => {
  for (const buff of live(unit)) {
    if (buff instanceof kind) return true;
  }
  return false;
};

describe('the shop item spells', () => {
  let game: TestGame;

  beforeEach(() => {
    installSpellObjectGlobals();
    game = createGame();
  });

  describe('Item_Zhonyas', () => {
    it('puts the caster in stasis and nobody else', () => {
      const caster = createUnit(game, 0);
      const ally = createUnit(game, 120);
      const enemy = createUnit(game, 240, 'red');

      expect(pressSpell(new Item_Zhonyas(caster))).toBe(true);

      expect(hasBuff(caster, Stasis)).toBe(true);
      expect(live(ally)).toHaveLength(0);
      expect(live(enemy)).toHaveLength(0);
    });

    it('holds it for the tuned duration, not forever', () => {
      const caster = createUnit(game, 0);
      pressSpell(new Item_Zhonyas(caster));

      const stasis = live(caster)[0];
      expect(stasis.duration).toBe(ZHONYAS_DURATION_MS);
    });
  });

  describe('Item_Ghostblade', () => {
    it('hastes the caster and nobody else', () => {
      const caster = createUnit(game, 0);
      const ally = createUnit(game, 120);
      const enemy = createUnit(game, 240, 'red');

      expect(pressSpell(new Item_Ghostblade(caster))).toBe(true);

      expect(hasBuff(caster, Speedup)).toBe(true);
      expect(live(ally)).toHaveLength(0);
      expect(live(enemy)).toHaveLength(0);
    });

    it('grants the tuned share of movement speed', () => {
      const caster = createUnit(game, 0);
      pressSpell(new Item_Ghostblade(caster));

      const haste = live(caster)[0] as InstanceType<typeof Speedup>;
      expect(haste.percent).toBe(SPEED_PERCENT);
    });
  });

  describe('Item_Quicksilver', () => {
    it("takes off an enemy's stun and leaves the caster's own stasis alone", () => {
      const caster = createUnit(game, 0);
      const enemy = createUnit(game, 240, 'red');

      const stun = new Stun(3_000, enemy, caster);
      caster.addBuff(stun);
      // Self-cast, so `cleanse()` must skip it: one item cancelling another is
      // a bug with two buttons.
      const ownStasis = new Stasis(ZHONYAS_DURATION_MS, caster, caster);
      caster.addBuff(ownStasis);

      expect(pressSpell(new Item_Quicksilver(caster))).toBe(true);

      expect(stun.toRemove).toBe(true);
      expect(ownStasis.toRemove).toBe(false);
    });

    /**
     * The case the item exists for, and the one the two tests around it do not
     * reach: they add the buff and press in the same breath, and a stun's
     * lockout only lands on the unit's next `update` — so the caster is still
     * free to act when they press.
     *
     * Stun it *properly* and the whole gate applies: `Spell.castCancelCheck`
     * refuses while `owner.canCast` is false, which
     * `Stats.updateActionState` clears for Stunned. Without
     * `castableWhileControlled` this press returns false and the stun stays,
     * which is an item that does nothing on the only occasion anybody buys
     * one.
     */
    it('can be pressed *while the stun is actually in effect*, which is the point of it', () => {
      const caster = createUnit(game, 0);
      const enemy = createUnit(game, 240, 'red');

      const stun = new Stun(3_000, enemy, caster);
      caster.addBuff(stun);
      caster.update();
      expect(caster.canCast, 'the stun never took hold, so this proves nothing').toBe(false);

      expect(pressSpell(new Item_Quicksilver(caster)), 'the cast was refused').toBe(true);
      expect(stun.toRemove).toBe(true);
    });

    it('takes off every crowd control an enemy applied, not only the first', () => {
      const caster = createUnit(game, 0);
      const enemy = createUnit(game, 240, 'red');

      const stun = new Stun(3_000, enemy, caster);
      const root = new Root(3_000, enemy, caster);
      caster.addBuff(stun);
      caster.addBuff(root);

      pressSpell(new Item_Quicksilver(caster));

      expect(stun.toRemove).toBe(true);
      expect(root.toRemove).toBe(true);
    });

    it('touches no one else, even an enemy standing in exactly the same crowd control', () => {
      const caster = createUnit(game, 0);
      const enemy = createUnit(game, 240, 'red');

      const onTheCaster = new Stun(3_000, enemy, caster);
      const onTheEnemy = new Stun(3_000, caster, enemy);
      caster.addBuff(onTheCaster);
      enemy.addBuff(onTheEnemy);

      pressSpell(new Item_Quicksilver(caster));

      expect(onTheCaster.toRemove).toBe(true);
      expect(onTheEnemy.toRemove).toBe(false);
    });
  });

  describe('Item_Thornmail', () => {
    it('hangs the reflect on the holder, not on whoever hits them', () => {
      const holder = createUnit(game, 0);
      const attacker = createUnit(game, 120, 'red');

      expect(pressSpell(new Item_Thornmail(holder))).toBe(true);

      expect(hasBuff(holder, DamageReflect)).toBe(true);
      expect(live(attacker)).toHaveLength(0);
    });

    it('pays out on a hit, measured on the swing', () => {
      const holder = createUnit(game, 0);
      const attacker = createUnit(game, 120, 'red');
      pressSpell(new Item_Thornmail(holder));

      // 20 in, no armour anywhere, so 20 lands; a quarter of the swing goes
      // back, which is 5 off a 100-point pool. Written out rather than derived
      // from REFLECT_PERCENT: a probe that recomputes the rule it is checking
      // agrees with the rule however wrong the rule is.
      holder.takeDamage(20, attacker);

      expect(holder.stats.health.baseValue).toBe(80);
      expect(attacker.stats.health.baseValue).toBe(95);
    });

    it('does not pay out to the holder for damage the holder did to itself', () => {
      const holder = createUnit(game, 0);
      pressSpell(new Item_Thornmail(holder));

      holder.takeDamage(20, holder);

      expect(holder.stats.health.baseValue).toBe(80);
    });

    it('is permanent — ten minutes of match time does not age it out', () => {
      const holder = createUnit(game, 0);
      pressSpell(new Item_Thornmail(holder));
      const reflect = live(holder)[0];

      expect(reflect.duration).toBe(0);
      vi.stubGlobal('deltaTime', 1_000);
      for (let second = 0; second < 600; second++) reflect.update();

      expect(reflect.toRemove).toBe(false);
    });

    it('carries its own stack id, so a champion ability that also reflects cannot evict it', () => {
      const holder = createUnit(game, 0);
      pressSpell(new Item_Thornmail(holder));

      // What Rammus W does: a second DamageReflect, tagged as its own.
      const fromAnAbility = new DamageReflect(5_000, holder, holder);
      fromAnAbility.stackId = 'rammus_w_reflect';
      fromAnAbility.percent = 0.8;
      holder.addBuff(fromAnAbility);

      expect(live(holder)).toHaveLength(2);
      const item = live(holder)[0] as InstanceType<typeof DamageReflect>;
      expect(item.stackId).toBe(REFLECT_STACK_ID);
      expect(item.percent).toBe(REFLECT_PERCENT);
    });
  });
});
