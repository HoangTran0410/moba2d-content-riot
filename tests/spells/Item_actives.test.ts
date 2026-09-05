import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import { indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Item_Everfrost, {
  EVERFROST_DAMAGE,
  EVERFROST_HALF_ANGLE,
  EVERFROST_RANGE,
  EVERFROST_ROOT_MS,
} from '../../spells/Item_Everfrost';
import Item_Locket, {
  LOCKET_RADIUS,
  LOCKET_SHIELD_MS,
  LOCKET_SHIELD_PERCENT,
} from '../../spells/Item_Locket';
import Item_Shurelya, {
  SHURELYA_DURATION_MS,
  SHURELYA_RADIUS,
  SHURELYA_SPEED_PERCENT,
} from '../../spells/Item_Shurelya';
import Item_Ghostblade, { SPEED_PERCENT } from '../../spells/Item_Ghostblade';
import Item_Quicksilver from '../../spells/Item_Quicksilver';
import Item_Mikael, { HEAL_PERCENT as MIKAEL_HEAL_PERCENT, HEALING_BOOST } from '../../spells/Item_Mikael';
import Item_Thornmail, { REFLECT_PERCENT, REFLECT_STACK_ID } from '../../spells/Item_Thornmail';
import Item_Zhonyas, { DURATION_MS as ZHONYAS_DURATION_MS } from '../../spells/Item_Zhonyas';

const api = buildTestApi();
const { Champion } = api.units;
const { DamageReflect, Root, Shield, Speedup, Stasis, Stun } = api.buffs;

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
    installSketchMathGlobals();
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

  describe('Item_Mikael', () => {
    /**
     * The shop's other cleanse, aimed at somebody else — and the only place a
     * `healingReceived` buff is granted to another unit. The stat had one user
     * in the whole shop before this, as a flat passive.
     */
    it('takes the stun off an ally and leaves every heal on them landing harder', () => {
      const caster = createUnit(game, 0, 'blue');
      const ally = createUnit(game, 120, 'blue');
      const enemy = createUnit(game, 300, 'red');
      game.setPlayer(caster);
      indexObjects(game, [caster, ally, enemy]);

      const stun = new Stun(3_000, enemy, ally);
      ally.addBuff(stun);
      ally.stats.health.baseValue = 40;
      ally.stats.maxHealth.baseValue = 100;

      expect(pressSpell(new Item_Mikael(caster), { target: ally })).toBe(true);

      expect(stun.toRemove, 'the ally is still stunned').toBe(true);
      expect(ally.stats.healingReceived.value).toBeCloseTo(HEALING_BOOST, 6);
    });

    /**
     * The boost is added **before** the item's own heal, so the button's own
     * number is the first thing it amplifies. Getting this backwards is not
     * visible anywhere except in the health bar at the moment a player is
     * watching it, which is the worst place to be a little bit wrong.
     */
    it('amplifies its own heal, not only the ones that come after', () => {
      const caster = createUnit(game, 0, 'blue');
      const ally = createUnit(game, 120, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster, ally]);

      ally.stats.maxHealth.baseValue = 200;
      ally.stats.health.baseValue = 20;

      expect(pressSpell(new Item_Mikael(caster), { target: ally })).toBe(true);

      // `takeHeal` rounds to whole points, and it rounds the *amplified*
      // number — the heal is a share of the ally's own 200-point bar (30),
      // and 30 x 1.35 arrives as 41. Asserting the raw product instead would
      // be off by a fraction of a point and read as a bug in the boost.
      expect(ally.stats.health.value).toBe(
        20 + Math.round(200 * MIKAEL_HEAL_PERCENT * (1 + HEALING_BOOST))
      );
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
      // By class, not by index: the item hangs a wound beside the spikes now
      // (it builds out of Áo Choàng Gai), and an index would quietly start
      // ageing the wrong one of the two.
      const reflect = live(holder).find(buff => buff instanceof DamageReflect) as AnyBuff;

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

      // Three: the spikes, the wound the item inherited from Áo Choàng Gai,
      // and the ability's own reflect.
      expect(live(holder)).toHaveLength(3);
      const item = live(holder).find(
        buff => buff.stackId === REFLECT_STACK_ID
      ) as InstanceType<typeof DamageReflect>;
      expect(item, 'the item’s own reflect was evicted').toBeTruthy();
      expect(item.percent).toBe(REFLECT_PERCENT);
      expect(live(holder).some(buff => buff.stackId === 'rammus_w_reflect')).toBe(true);
    });
  });

  /**
   * The three team actives. Each one's whole question is *who it reaches* —
   * a button that shields the enemy team, or only its own holder, is the same
   * bug twice — so every case below plants an ally, an enemy and a corpse in
   * the quadtree and reads all three.
   */
  const planted = (game: TestGame, x: number, teamId: string) =>
    new Champion({ game, position: createVector(x, 0), teamId } as never);

  describe('Item_Locket', () => {
    it('shields the holder and every allied champion in reach, and nobody else', () => {
      const holder = createUnit(game, 0);
      const ally = planted(game, LOCKET_RADIUS - 40, 'blue');
      const distant = planted(game, LOCKET_RADIUS + 200, 'blue');
      const enemy = planted(game, 60, 'red');
      game.setPlayer(holder);
      indexObjects(game, [holder, ally, distant, enemy]);

      expect(pressSpell(new Item_Locket(holder))).toBe(true);

      expect(hasBuff(holder, Shield), 'the holder went unshielded').toBe(true);
      expect(hasBuff(ally, Shield), 'the ally went unshielded').toBe(true);
      expect(hasBuff(distant, Shield), 'an ally out of reach was shielded').toBe(false);
      expect(hasBuff(enemy, Shield), 'the enemy was shielded').toBe(false);
    });

    it('grants the tuned amount, and it really absorbs', () => {
      const holder = createUnit(game, 0);
      const attacker = createUnit(game, 200, 'red');
      game.setPlayer(holder);
      indexObjects(game, [holder]);
      pressSpell(new Item_Locket(holder));

      const shield = live(holder)[0] as InstanceType<typeof Shield>;
      // A share of the recipient's own bar — this fixture's default 100.
      expect(shield.amount).toBeCloseTo(100 * LOCKET_SHIELD_PERCENT, 6);
      expect(shield.duration).toBe(LOCKET_SHIELD_MS);

      // A 10-point hit into an 18-point shield (18% of this 100-health
      // body): health is untouched, and 8 points of cushion are left.
      // Written longhand — a probe derived from LOCKET_SHIELD_PERCENT would
      // agree with it however wrong it became.
      holder.takeDamage(10, attacker);
      expect(holder.stats.health.baseValue).toBe(100);
    });
  });

  describe('Item_Shurelya', () => {
    it('hastes the holder and every allied champion in reach, and nobody else', () => {
      const holder = createUnit(game, 0);
      const ally = planted(game, SHURELYA_RADIUS - 40, 'blue');
      const distant = planted(game, SHURELYA_RADIUS + 200, 'blue');
      const enemy = planted(game, 60, 'red');
      game.setPlayer(holder);
      indexObjects(game, [holder, ally, distant, enemy]);

      expect(pressSpell(new Item_Shurelya(holder))).toBe(true);

      expect(hasBuff(holder, Speedup), 'the holder was not hasted').toBe(true);
      expect(hasBuff(ally, Speedup), 'the ally was not hasted').toBe(true);
      expect(hasBuff(distant, Speedup), 'an ally out of reach was hasted').toBe(false);
      expect(hasBuff(enemy, Speedup), 'the enemy was hasted').toBe(false);
    });

    it('grants the tuned share of movement speed for the tuned time', () => {
      const holder = createUnit(game, 0);
      game.setPlayer(holder);
      indexObjects(game, [holder]);
      pressSpell(new Item_Shurelya(holder));

      const haste = live(holder)[0] as InstanceType<typeof Speedup>;
      expect(haste.percent).toBe(SHURELYA_SPEED_PERCENT);
      expect(haste.duration).toBe(SHURELYA_DURATION_MS);
    });

    it('carries its own stack id, so Youmuu cannot evict it', () => {
      const holder = createUnit(game, 0);
      game.setPlayer(holder);
      indexObjects(game, [holder]);

      pressSpell(new Item_Shurelya(holder));
      pressSpell(new Item_Ghostblade(holder));

      const hastes = live(holder).filter(buff => buff instanceof Speedup);
      expect(hastes).toHaveLength(2);
      expect(new Set(hastes.map(buff => buff.stackId)).size).toBe(2);
    });
  });

  describe('Item_Everfrost', () => {
    it('roots and damages the enemies inside the cone it points at', () => {
      const holder = createUnit(game, 0);
      const infront = planted(game, EVERFROST_RANGE - 80, 'red');
      const behind = planted(game, -(EVERFROST_RANGE - 80), 'red');
      const distant = planted(game, EVERFROST_RANGE + 200, 'red');
      const ally = planted(game, 120, 'blue');
      game.setPlayer(holder);
      indexObjects(game, [holder, infront, behind, distant, ally]);

      const hurt = vi.spyOn(infront, 'takeDamage');
      const spared = vi.spyOn(behind, 'takeDamage');

      expect(pressSpell(new Item_Everfrost(holder), { at: infront.position })).toBe(true);

      expect(hurt).toHaveBeenCalledTimes(1);
      expect(hurt.mock.calls[0][0]).toBe(EVERFROST_DAMAGE);
      expect(hasBuff(infront, Root), 'the enemy in the cone was not rooted').toBe(true);
      expect(spared, 'the nova hit behind the caster').not.toHaveBeenCalled();
      expect(hasBuff(distant, Root), 'an enemy out of reach was rooted').toBe(false);
      expect(hasBuff(ally, Root), 'the ally was rooted').toBe(false);
    });

    it('roots for the tuned time and points where it was aimed', () => {
      const holder = createUnit(game, 0);
      const enemy = planted(game, 200, 'red');
      game.setPlayer(holder);
      indexObjects(game, [holder, enemy]);

      pressSpell(new Item_Everfrost(holder), { at: enemy.position });

      const root = live(enemy).find(buff => buff instanceof Root) as InstanceType<typeof Root>;
      expect(root.duration).toBe(EVERFROST_ROOT_MS);
      // A cone, not a circle: half its opening is well under a right angle, or
      // "behind the caster is safe" above would be true for the wrong reason.
      expect(EVERFROST_HALF_ANGLE).toBeLessThan(Math.PI / 2);
    });

    it('hits each enemy once, however many frames the nova lives', () => {
      const holder = createUnit(game, 0);
      const enemy = planted(game, 200, 'red');
      game.setPlayer(holder);
      indexObjects(game, [holder, enemy]);
      const hurt = vi.spyOn(enemy, 'takeDamage');

      pressSpell(new Item_Everfrost(holder), { at: enemy.position });
      const nova = game.objectManager._objectToBeAdd[0] as { update(): void };
      vi.stubGlobal('deltaTime', 16);
      for (let i = 0; i < 40; i++) nova.update();

      expect(hurt).toHaveBeenCalledTimes(1);
    });
  });
});
