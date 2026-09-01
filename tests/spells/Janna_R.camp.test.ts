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
import Janna_R, { KNOCKBACK_DISTANCE } from '../../spells/Janna_R';

installSketchMathGlobals();
installSpellObjectGlobals();

const api = buildTestApi();
const { Monster } = api.units;

/**
 * Monsoon against a jungle camp, end to end — the bug as it was reported from a
 * real match: the camp was pushed out of its pit, took no damage (Monsoon deals
 * none, by design, in the source game too), never changed state, and never
 * walked back.
 *
 * Two halves met to produce that, and each is fixed on its own side. Core walks
 * a *shoved* camp back to its point rather than only to the edge of its leash
 * circle — the pits this pack ships are 200 and 250 wide against a 260 knockback,
 * so the throw usually left it inside its own circle and `isOutsideCamp()`
 * answered false. And this knockback used to write the camp's `destination`
 * from outside on landing, which pinned it exactly where it was thrown even
 * once core wanted it home.
 *
 * Kept out of `Janna_R.test.ts` deliberately: that file mocks the VFX surface
 * to watch telegraphs, and this case wants a plain world with a real camp in it.
 */
describe('Monsoon against a camp', () => {
  let game: TestGame;
  beforeEach(() => {
    game = createGame();
    vi.stubGlobal('deltaTime', 16);
  });

  const camp = (x: number, overrides: Record<string, unknown> = {}) =>
    new Monster({
      game,
      preset: {
        name: 'Camp',
        avatar: null,
        camp: { x, y: 0, r: 250 },
        speed: 3,
        size: 40,
        attackRange: 50,
        reviveTime: 100,
        health: 300,
        // Movable: a legless camp is anchored by default and refuses the shove
        // outright, which is a different (already correct) path.
        anchored: false,
        ...overrides,
      },
    } as never);

  it('throws it, then leaves it walking home rather than standing where it landed', () => {
    const janna = createUnit(game, 0, 'blue');
    game.setPlayer(janna);
    const pit = camp(150);
    indexObjects(game, [janna, pit]);

    expect(pressSpell(new Janna_R(janna))).toBe(true);

    let furthest = 0;
    for (let frame = 0; frame < 40; frame++) {
      pit.update();
      furthest = Math.max(furthest, Math.abs(pit.position.x - 150));
    }
    expect(furthest, 'Monsoon did not move the camp at all').toBeGreaterThan(
      KNOCKBACK_DISTANCE / 3
    );

    for (let frame = 0; frame < 400; frame++) pit.update();

    expect(Math.hypot(pit.position.x - 150, pit.position.y)).toBeLessThanOrEqual(20);
  });

  /**
   * The other half of the same override: `Dash` refuses to move an anchored
   * body, and Monsoon used to replace that check rather than run it.
   */
  it('does not move a camp the engine has already said cannot be moved', () => {
    const janna = createUnit(game, 0, 'blue');
    game.setPlayer(janna);
    const boss = camp(150, { anchored: true });
    indexObjects(game, [janna, boss]);

    expect(pressSpell(new Janna_R(janna))).toBe(true);
    for (let frame = 0; frame < 60; frame++) boss.update();

    expect(Math.hypot(boss.position.x - 150, boss.position.y)).toBeLessThanOrEqual(20);
  });
});
