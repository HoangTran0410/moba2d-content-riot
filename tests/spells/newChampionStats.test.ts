import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';

import Vladimir_W, { SPELL_VAMP } from '../../spells/Vladimir_W';
import DrMundo_R, {
  HEAL_PER_TICK,
  HEALING_RECEIVED_BONUS,
  REGEN_TICK_MS,
} from '../../spells/DrMundo_R';
import Trundle_R, { R_RESIST_STEAL_PERCENT } from '../../spells/Trundle_R';
import KogMaw_W, { W_ON_HIT_DAMAGE } from '../../spells/KogMaw_W';

installSketchMathGlobals();
installSpellObjectGlobals();

const api = buildTestApi();
const { HealCut, StatAmp } = api.buffs;

/**
 * **Why these four champions were added, asserted.**
 *
 * Each was written to reach a stat core models that no spell in this pack
 * touched. That is a claim about the *engine seam* each kit goes through, and
 * it is exactly the kind of claim that stays true in a file's prose long after
 * it has stopped being true in its code — a heal moved off `takeHeal` onto raw
 * arithmetic still heals, and nothing anywhere reports that the whole
 * counter-play shelf stopped applying to it.
 *
 * So this file does not check that the abilities are good. It checks that they
 * are still plugged into the thing they were built for.
 */

const live = (unit: { buffs: { toRemove: boolean }[] }) => unit.buffs.filter(b => !b.toRemove);

const ampOn = (unit: { buffs: unknown[] }, stat: string) =>
  (live(unit as never) as unknown as { bonuses?: Record<string, unknown> }[]).find(
    b => b.bonuses?.[stat] !== undefined
  ) as unknown as { bonuses: Record<string, { baseBonus?: number; flatBonus?: number; percentBonus?: number }> } | undefined;

describe('the stats these champions were added to reach', () => {
  let game: TestGame;

  beforeEach(() => {
    game = createGame();
    vi.stubGlobal('deltaTime', 16);
  });

  /**
   * `spellVamp` had **no spell in the pack** granting it and one item. Vladimir
   * is the champion whose whole identity is healing off his own ability damage,
   * so the pool grants the stat and lets core's own vamp funnel
   * (`combat/Vamp.ts`) pay out of the MAGIC ticks — rather than the file
   * computing a heal itself, which would look identical and be invisible to
   * every wound in the shop.
   */
  it('Vladimir’s pool grants spell vamp rather than healing him by hand', () => {
    const vlad = createUnit(game, 0, 'blue');
    game.setPlayer(vlad);

    expect(pressSpell(new Vladimir_W(vlad))).toBe(true);

    const amp = ampOn(vlad, 'spellVamp');
    expect(amp, 'nothing granted spellVamp').toBeTruthy();
    expect(amp!.bonuses.spellVamp.baseBonus).toBe(SPELL_VAMP);
    expect(vlad.stats.spellVamp.value).toBeCloseTo(SPELL_VAMP, 6);
  });

  /**
   * Mundo is the body the wound shelf exists to argue with, which only works
   * while every point he heals goes through `takeHeal`. A file that put health
   * back with `stats.health.baseValue += n` would heal exactly the same and be
   * immune to every Vết Thương Sâu in the shop, silently.
   */
  it('Dr. Mundo’s ultimate heals through the seam a wound can reach', () => {
    /**
     * Against a **control**, deliberately. The first version of this asserted
     * only that the wounded tick healed less than an uncut one would in
     * theory — and swapping `takeHeal` for `stats.health.baseValue += n`, the
     * exact regression it exists to catch, kept it green, because a raw five
     * points is also less than an amplified six. Two bodies and a comparison
     * is the only shape that cannot be satisfied by ignoring the seam.
     */
    const tickOnce = (wounded: boolean): number => {
      const mundo = createUnit(game, 0, 'blue');
      game.setPlayer(mundo);
      mundo.stats.maxHealth.baseValue = 300;
      mundo.stats.health.baseValue = 100;

      expect(pressSpell(new DrMundo_R(mundo))).toBe(true);

      if (wounded) {
        // Landed *after* the ultimate is running, which is the realistic
        // order: he presses R, and then somebody answers it.
        const enemy = createUnit(game, 300, 'red');
        const cut = new HealCut(5_000, enemy, mundo);
        cut.healCut = 0.4;
        mundo.addBuff(cut);
      }

      const before = mundo.stats.health.value;
      vi.stubGlobal('deltaTime', REGEN_TICK_MS);
      for (const buff of [...mundo.buffs]) buff.update();
      vi.stubGlobal('deltaTime', 16);
      return mundo.stats.health.value - before;
    };

    const healthy = tickOnce(false);
    const wounded = tickOnce(true);

    expect(healthy, 'the tick did not heal at all').toBeGreaterThan(0);
    expect(wounded, 'the wound did not reach the ultimate').toBeLessThan(healthy);
    // And the healthy tick is his own `healingReceived` amplifying his own
    // heal — both multiply, so the order they arrive in cannot change the
    // answer (`combat/Healing.ts`).
    expect(healthy).toBe(Math.round(HEAL_PER_TICK * (1 + HEALING_RECEIVED_BONUS)));
  });

  it('Dr. Mundo’s ultimate also raises the healing he receives from anywhere', () => {
    const mundo = createUnit(game, 0, 'blue');
    game.setPlayer(mundo);

    expect(pressSpell(new DrMundo_R(mundo))).toBe(true);

    expect(mundo.stats.healingReceived.value).toBeCloseTo(HEALING_RECEIVED_BONUS, 6);
  });

  /**
   * Nothing else in the pack moves a resistance in both directions at once.
   * The two sides have to be the same number, and the reduction has to sit on
   * `percentBonus` — the inner slot only scales base and baseBonus, so a
   * reduction written there ignores every point of armour the victim bought.
   * That exact mistake shipped in this pack once.
   */
  it('Trundle’s ultimate takes resistance off the victim and puts it on himself', () => {
    const trundle = createUnit(game, 0, 'blue');
    const victim = createUnit(game, 150, 'red');
    game.setPlayer(trundle);
    victim.stats.armor.baseValue = 40;
    victim.stats.magicResist.baseValue = 20;

    expect(pressSpell(new Trundle_R(trundle), { target: victim })).toBe(true);

    const drained = live(victim).find(b => b instanceof StatAmp) as unknown as {
      bonuses: Record<string, { percentBonus?: number }>;
    };
    expect(drained, 'the victim lost nothing').toBeTruthy();
    expect(drained.bonuses.armor.percentBonus).toBeCloseTo(-R_RESIST_STEAL_PERCENT, 6);

    // The other half, and the reason the ability is worth writing: what came
    // off the victim is on Trundle, as points, snapshotted at cast.
    expect(victim.stats.armor.value).toBeCloseTo(40 * (1 - R_RESIST_STEAL_PERCENT), 4);
    expect(trundle.stats.armor.value).toBeCloseTo(40 * R_RESIST_STEAL_PERCENT, 4);
    expect(trundle.stats.magicResist.value).toBeCloseTo(20 * R_RESIST_STEAL_PERCENT, 4);
  });

  /**
   * The shop grew an on-hit shelf in the same pass; Kog'Maw is the champion
   * who wants it. `Buff.onHit` is basic-attacks-only by construction, which is
   * the whole point of Bio-Arcane Barrage.
   */
  it('Kog’Maw’s W turns his swing into on-hit magic damage', () => {
    const kog = createUnit(game, 0, 'blue');
    const victim = createUnit(game, 200, 'red');
    game.setPlayer(kog);
    victim.stats.health.baseValue = 100;
    victim.stats.maxHealth.baseValue = 100;

    expect(pressSpell(new KogMaw_W(kog))).toBe(true);

    const before = victim.stats.health.value;
    for (const buff of [...kog.buffs]) {
      (buff as unknown as { onHit?: (hit: unknown) => void }).onHit?.({
        attacker: kog,
        victim,
        damage: 10,
        ranged: true,
        crit: false,
        echo: false,
      });
    }

    expect(before - victim.stats.health.value).toBeGreaterThan(0);
    expect(before - victim.stats.health.value).toBeLessThanOrEqual(W_ON_HIT_DAMAGE);
  });
});
