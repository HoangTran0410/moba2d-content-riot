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
import ChoGath_R, {
  CHAMPION_FEAST_STACKS,
  MAX_HEALTH_PER_STACK,
} from '../../spells/ChoGath_R';
import Nasus_Q, { CHAMPION_SLAY_STACKS as NASUS_CHAMPION_SLAY_STACKS } from '../../spells/Nasus_Q';

installSketchMathGlobals();
installSpellObjectGlobals();

const api = buildTestApi();
void api;

/**
 * A champion is a meal; a minion is a snack.
 *
 * One flat +75 per feast, minion or not, out-grew Trái Tim Khổng Thần
 * twenty-five-fold off creep waves alone — the owner's own report. The split
 * this pins is the fix: every devour is one stack's worth of growth except a
 * devoured CHAMPION, which is `CHAMPION_FEAST_STACKS` of them — told apart by
 * `killCredit`, the codebase's own answer to "does this count as a champion".
 */
describe("Cho'Gath grows by what he actually ate", () => {
  let game: TestGame;

  beforeEach(() => {
    vi.stubGlobal('deltaTime', 16);
    game = createGame();
  });

  const feastOn = (killCredit: 'minion' | 'champion') => {
    const cho = createUnit(game, 0, 'blue');
    const victim = createUnit(game, 50, 'red');
    victim.stats.maxHealth.baseValue = 30;
    victim.stats.health.baseValue = 5; // dies to the 40-true bite
    (victim as { killCredit: string }).killCredit = killCredit;

    const spell = new ChoGath_R(cho);
    vi.spyOn(spell, 'findVictim').mockReturnValue(victim);
    const before = cho.stats.maxHealth.value;
    pressSpell(spell);
    return { grown: cho.stats.maxHealth.value - before, victim };
  };

  it('gains one stack of health off a minion', () => {
    const { grown, victim } = feastOn('minion');
    expect(victim.isDead).toBe(true);
    expect(grown).toBe(MAX_HEALTH_PER_STACK);
  });

  it('gains the whole meal off a champion', () => {
    const { grown, victim } = feastOn('champion');
    expect(victim.isDead).toBe(true);
    expect(grown).toBe(MAX_HEALTH_PER_STACK * CHAMPION_FEAST_STACKS);
  });

  it('gains nothing at all from a bite that killed nobody', () => {
    const cho = createUnit(game, 0, 'blue');
    const victim = createUnit(game, 50, 'red');
    victim.stats.maxHealth.baseValue = 200;
    victim.stats.health.baseValue = 200;

    const spell = new ChoGath_R(cho);
    vi.spyOn(spell, 'findVictim').mockReturnValue(victim);
    const before = cho.stats.maxHealth.value;
    pressSpell(spell);

    expect(victim.isDead).toBe(false);
    expect(cho.stats.maxHealth.value).toBe(before);
  });
});

/**
 * Nasus wears the identical split, caught by the identical report: +5 per
 * last hit, uncapped, farmed a creep wave into +100 damage a minute.
 */
describe('Nasus banks by what the strike actually slew', () => {
  let game: TestGame;

  beforeEach(() => {
    vi.stubGlobal('deltaTime', 16);
    game = createGame();
  });

  const slay = (killCredit: 'minion' | 'champion') => {
    const nasus = createUnit(game, 0, 'blue');
    const victim = createUnit(game, 50, 'red');
    victim.stats.maxHealth.baseValue = 30;
    victim.stats.health.baseValue = 5;
    victim.stats.armor.baseValue = 0;
    (victim as { killCredit: string }).killCredit = killCredit;

    const spell = new Nasus_Q(nasus);
    vi.spyOn(spell, 'findVictim').mockReturnValue(victim);
    pressSpell(spell);
    return spell;
  };

  it('banks one stack off a minion', () => {
    expect(slay('minion').stacks).toBe(1);
  });

  it('banks the whole meal off a champion', () => {
    expect(slay('champion').stacks).toBe(NASUS_CHAMPION_SLAY_STACKS);
  });
});
