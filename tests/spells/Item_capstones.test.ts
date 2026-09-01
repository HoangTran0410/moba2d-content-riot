import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Item_Rabadon, { RABADON_PERCENT } from '../../spells/Item_Rabadon';
import Item_Steraks, {
  STERAK_SHIELD_PERCENT,
  STERAK_THRESHOLD,
} from '../../spells/Item_Steraks';
import Item_FrozenHeart, {
  FROZEN_HEART_RADIUS,
  FROZEN_HEART_SLOW,
  FROZEN_HEART_TICK_MS,
} from '../../spells/Item_FrozenHeart';

installSketchMathGlobals();
installSpellObjectGlobals();

const api = buildTestApi();
const { Champion } = api.units;
const { Shield } = api.buffs;

const planted = (game: TestGame, x: number, teamId: string) =>
  new Champion({ game, position: createVector(x, 0), teamId } as never);

/** Runs a champion's buffs for `ms`, the way a frame does. */
const tick = (unit: { updateBuffs: () => void }, ms: number, step = 16) => {
  vi.stubGlobal('deltaTime', step);
  for (let elapsed = 0; elapsed < ms; elapsed += step) unit.updateBuffs();
};

describe('the three shapes this shop did not have', () => {
  let game: TestGame;

  beforeEach(() => {
    game = createGame();
    vi.stubGlobal('deltaTime', 16);
  });

  /**
   * A multiplier, in a shop where every other ability item adds. The claim is
   * specifically that it reads what the *rest of the build* bought — an item
   * that granted a flat 0.25 would pass a test written against an empty build.
   */
  describe('Item_Rabadon', () => {
    it('is worth a share of the ability power already on the champion', () => {
      const holder = createUnit(game, 0);
      holder.stats.abilityPower.flatBonus = 2;

      expect(pressSpell(new Item_Rabadon(holder))).toBe(true);

      expect(holder.stats.abilityPower.value).toBeCloseTo(2 * (1 + RABADON_PERCENT), 6);
    });

    it('is worth nothing at all on a champion carrying no other ability item', () => {
      const holder = createUnit(game, 0);
      pressSpell(new Item_Rabadon(holder));

      expect(holder.stats.abilityPower.value).toBe(0);
    });
  });

  describe('Item_Steraks', () => {
    const holderAt = (share: number) => {
      const holder = createUnit(game, 0);
      holder.stats.maxHealth.baseValue = 200;
      holder.stats.health.baseValue = 200 * share;
      return holder;
    };

    it('does nothing while the health bar is above the line', () => {
      const holder = holderAt(1);
      const attacker = createUnit(game, 120, 'red');
      pressSpell(new Item_Steraks(holder));

      holder.takeDamage(20, attacker, 'PHYSICAL');

      expect(holder.buffs.some(buff => buff instanceof Shield)).toBe(false);
    });

    it('shields for its share of maximum health once the hit takes it under', () => {
      const holder = holderAt(STERAK_THRESHOLD + 0.05);
      const attacker = createUnit(game, 120, 'red');
      pressSpell(new Item_Steraks(holder));

      holder.takeDamage(20, attacker, 'PHYSICAL');

      const shield = holder.buffs.find(buff => buff instanceof Shield) as { amount: number };
      expect(shield, 'nothing shielded the holder').toBeTruthy();
      expect(shield.amount).toBeCloseTo(200 * STERAK_SHIELD_PERCENT, 6);
    });

    /**
     * The reason it holds a clock rather than a flag: a damage-over-time tick
     * arrives every frame, and a passive that re-armed on each one would be a
     * champion who cannot be killed while it is running.
     */
    it('does not fire a second time while it is still on cooldown', () => {
      const holder = holderAt(STERAK_THRESHOLD + 0.05);
      const attacker = createUnit(game, 120, 'red');
      pressSpell(new Item_Steraks(holder));

      holder.takeDamage(20, attacker, 'PHYSICAL');
      const first = holder.buffs.filter(buff => buff instanceof Shield).length;
      holder.buffs.filter(buff => buff instanceof Shield).forEach(buff => buff.deactivateBuff());
      tick(holder, 2_000);
      holder.takeDamage(5, attacker, 'PHYSICAL');

      expect(first).toBe(1);
      expect(holder.buffs.filter(buff => buff instanceof Shield && !buff.toRemove)).toHaveLength(0);
    });
  });

  describe('Item_FrozenHeart', () => {
    it('slows the attack speed of enemies standing in it, and nobody else', () => {
      const holder = createUnit(game, 0);
      const enemy = planted(game, FROZEN_HEART_RADIUS - 40, 'red');
      const distant = planted(game, FROZEN_HEART_RADIUS + 200, 'red');
      const ally = planted(game, 60, 'blue');
      for (const unit of [enemy, distant, ally]) unit.stats.attackSpeed.baseValue = 1;
      game.setPlayer(holder);
      indexObjects(game, [holder, enemy, distant, ally]);

      expect(pressSpell(new Item_FrozenHeart(holder))).toBe(true);
      tick(holder, FROZEN_HEART_TICK_MS + 32);

      expect(enemy.stats.attackSpeed.value).toBeCloseTo(1 - FROZEN_HEART_SLOW, 6);
      expect(distant.stats.attackSpeed.value, 'reached an enemy out of range').toBe(1);
      expect(ally.stats.attackSpeed.value, 'chilled its own team').toBe(1);
    });

    /** One instance, refreshed — not one per tick, which would stack to zero. */
    it('refreshes one chill rather than stacking a new one every tick', () => {
      const holder = createUnit(game, 0);
      const enemy = planted(game, 60, 'red');
      enemy.stats.attackSpeed.baseValue = 1;
      game.setPlayer(holder);
      indexObjects(game, [holder, enemy]);
      pressSpell(new Item_FrozenHeart(holder));

      tick(holder, FROZEN_HEART_TICK_MS * 4 + 32);
      // The enemy has to run its own buffs for the expiry sweep to happen.
      tick(enemy, 16);

      expect(enemy.buffs.filter(buff => !buff.toRemove)).toHaveLength(1);
      expect(enemy.stats.attackSpeed.value).toBeCloseTo(1 - FROZEN_HEART_SLOW, 6);
    });
  });
});
