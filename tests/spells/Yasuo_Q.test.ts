import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSpellObjectGlobals,
  installSketchMathGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Yasuo_Q, { Q_RANGE } from '../../spells/Yasuo_Q';

const __api = buildTestApi();
type AttackableUnit = InstanceType<typeof __api.units.AttackableUnit>;

describe('Yasuo Q stack machine', () => {
  let game: TestGame;
  let yasuo: AttackableUnit;
  let spell: Yasuo_Q;

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('createVector', (x = 0, y = 0) => new (p5 as any).Vector(x, y));
    game = createGame();
    yasuo = createUnit(game, 0, 'blue');
    yasuo.stats.size.baseValue = 20;
    game.setPlayer(yasuo);
    spell = new Yasuo_Q(yasuo);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function dummyAt(x: number, y = 0): AttackableUnit {
    const enemy = createUnit(game, x, 'red');
    enemy.position.set(x, y);
    enemy.stats.size.baseValue = 20;
    enemy.stats.health.baseValue = 100_000;
    game.objectManager.addObject(enemy);
    game.objectManager.update();
    return enemy;
  }

  /** One press that lands, driven the way a key press drives it. */
  function castAndLand(): void {
    spell.currentCooldown = 0;
    yasuo.position.set(0, 0);
    expect(pressSpell(spell, { at: { x: Q_RANGE, y: 0 } })).toBe(true);
    for (let frame = 0; frame < 10; frame++) {
      game.objectManager.update();
      spell.update();
    }
  }

  it('re-arms Q2/Q3 after a tornado is thrown, cast after cast', () => {
    dummyAt(100);

    castAndLand();
    expect(spell.phase).toBe(spell.PHASES.Q2);

    castAndLand();
    expect(spell.phase).toBe(spell.PHASES.Q3);

    // The tornado consumes the combo: back to Q1 with an empty counter.
    castAndLand();
    expect(spell.phase).toBe(spell.PHASES.Q1);
    expect(spell.hitStackCount).toBe(0);

    // ...and the very next landed thrust must start the combo over. This is the
    // one the game showed: it worked once, then never again.
    castAndLand();
    expect(spell.phase).toBe(spell.PHASES.Q2);

    castAndLand();
    expect(spell.phase).toBe(spell.PHASES.Q3);
  });

  it('counts one thrust as one stack even when it sweeps several bodies', () => {
    dummyAt(80, -10);
    dummyAt(120, 10);

    castAndLand();
    expect(spell.hitStackCount).toBe(1);
    expect(spell.phase).toBe(spell.PHASES.Q2);
  });
});
