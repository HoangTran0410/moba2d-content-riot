import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import LeeSin_W, { IRON_WILL_OMNIVAMP, LeeSin_W_IronWill } from '../../spells/LeeSin_W';

const __api = buildTestApi();
type AnyUnit = InstanceType<typeof __api.units.AttackableUnit>;

/**
 * Two things this ability said it did and did not.
 *
 * Iron Will shipped as a heal-over-time, under a comment explaining that "this
 * game has no basic attacks" so omnivamp could not be expressed. That had
 * stopped being true long before anybody looked — and the two were never the
 * same shape anyway: a fixed drip pays out whether or not he is fighting, and
 * Iron Will is supposed to pay *because* he is.
 *
 * Safeguard dashed to the ally nearest Lee Sin, which meant the ability chose
 * its own destination. Standing in a wave it took whichever minion happened to
 * be closest to his feet, and there was no way to say "that one, behind me" —
 * which is the escape the ability exists for.
 */
describe('Lee Sin W (Safeguard / Iron Will)', () => {
  let game: TestGame;
  let lee: AnyUnit;

  const ally = (x: number, y = 0): AnyUnit => {
    const unit = createUnit(game, x, 'blue');
    unit.position.y = y;
    unit.destination.y = y;
    return unit;
  };

  const aimAt = (x: number, y: number) => {
    (game as unknown as { worldMouse: unknown }).worldMouse = createVector(x, y);
  };

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    game = createGame();
    lee = ally(0);
    game.setPlayer(lee);
    aimAt(0, 0);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Iron Will', () => {
    const ironWill = (): LeeSin_W_IronWill => {
      const w = new LeeSin_W(lee);
      w.phase = 'W2';
      expect(pressSpell(w), 'the recast was refused').toBe(true);
      const buff = lee.buffs.find(b => b instanceof LeeSin_W_IronWill) as LeeSin_W_IronWill;
      expect(buff, 'the recast left no Iron Will').toBeDefined();
      return buff;
    };

    it('grants omnivamp rather than a heal on a timer', () => {
      indexObjects(game, [lee]);
      ironWill();
      expect(lee.stats.omnivamp.value).toBeCloseTo(IRON_WILL_OMNIVAMP, 5);
    });

    it('pays out of damage he actually deals, and nothing while he stands still', () => {
      const victim = createUnit(game, 150, 'red');
      victim.stats.maxHealth.baseValue = 500;
      victim.stats.health.baseValue = 500;
      indexObjects(game, [lee, victim]);

      lee.stats.maxHealth.baseValue = 200;
      lee.stats.health.baseValue = 100;
      lee.stats.healthRegen.baseValue = 0;
      ironWill();

      const idle = lee.stats.health.value;
      lee.update();
      expect(lee.stats.health.value, 'the drip is still paying out for doing nothing').toBe(idle);

      victim.takeDamage(40, lee, 'PHYSICAL');
      expect(lee.stats.health.value).toBe(idle + Math.round(40 * IRON_WILL_OMNIVAMP));
    });

    it('takes the omnivamp back when it lapses', () => {
      indexObjects(game, [lee]);
      const buff = ironWill();
      buff.deactivateBuff();
      expect(lee.stats.omnivamp.value).toBe(0);
    });
  });

  describe('Safeguard', () => {
    it('dashes to the ally under the cursor, not the one under his feet', () => {
      const underfoot = ally(60);
      const wanted = ally(-300);
      indexObjects(game, [lee, underfoot, wanted]);
      aimAt(-310, 0);

      const w = new LeeSin_W(lee);
      expect(w.findAllyNearCursor()).toBe(wanted);
    });

    it('still only offers allies inside its own range', () => {
      const reachable = ally(200);
      const tooFar = ally(2_000);
      indexObjects(game, [lee, reachable, tooFar]);
      // Cursor on the distant one: range gates *which* allies are candidates,
      // the cursor only picks among them.
      aimAt(2_000, 0);

      expect(new LeeSin_W(lee).findAllyNearCursor()).toBe(reachable);
    });

    it('finds nobody when he is alone, which is the self-cast', () => {
      indexObjects(game, [lee]);
      expect(new LeeSin_W(lee).findAllyNearCursor()).toBeNull();
    });
  });
});
