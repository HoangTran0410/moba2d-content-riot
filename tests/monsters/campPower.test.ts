import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import { data } from '../../pack';

/**
 * How hard each camp actually hits, measured rather than read.
 *
 * A `MonsterBody` may leave `damage` and `attackInterval` out, and core then
 * derives them — `min(25, max(3, health / 25))` and 1500ms. Six of this
 * pack's nine camps do exactly that, so the numbers written in `data.ts` are
 * *not* the numbers that reach a fight, and reading the table is how the
 * dragon came to be the weakest thing in the jungle without anybody noticing.
 *
 * So every camp here is built as a real `Monster` and asked what it does.
 * The derivation stays core's, and this file never copies it.
 */

const api = buildTestApi();
const { Monster } = api.units;

let game: TestGame;

beforeEach(() => {
  installSpellObjectGlobals();
  installSketchMathGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame();
});

/** Damage per second the whole camp puts out with its basic attacks alone. */
const campDps = (id: string): number => {
  const monster = data.monsters?.[id];
  expect(monster, `the pack has no camp called ${id}`).toBeTruthy();
  return monster!.members.reduce((total, member) => {
    const body = new Monster({
      game,
      preset: { ...member, camp: { x: 0, y: 0, r: 100 } },
    } as never);
    return total + body.damage / (body.attackInterval / 1_000);
  }, 0);
};

describe('the dragon fights like a boss', () => {
  /*
   * Its whole fight is the basic attack. `makeDragonAbilities` returns one
   * entry and that entry is the blessing paid on death — a reward, never cast
   * (`range: -1`). Baron and Vilemaw are excluded from the comparison below
   * for exactly that reason: their basic attacks are similarly modest because
   * `monsters/Baron.ts` and `monsters/Vilemaw.ts` carry the rest of their
   * damage in a kit, which no reading of the data table can see.
   *
   * The dragon has no such second half, so its swing has to stand on its own.
   */
  const FARM_CAMPS = ['blue', 'red', 'gromp', 'wolves', 'raptors', 'krugs'];

  it('out-damages every farm camp it shares the jungle with', () => {
    const dragon = campDps('dragon');
    for (const camp of FARM_CAMPS) {
      expect(dragon, `${camp} out-damages the dragon`).toBeGreaterThan(campDps(camp));
    }
  });

  it('and lands near the boss with a kit, rather than far under it', () => {
    // Baron's own total is its swing plus roughly 8.6 dps of spit, slam and
    // pool (`monsters/Baron.ts`'s SPIT/SLAM/POOL, written longhand here so
    // this is a probe rather than a restatement of the thing it checks).
    const baronTotal = campDps('baron') + 8.6;
    expect(campDps('dragon')).toBeGreaterThan(baronTotal * 0.85);
  });

  it('keeps a single swing dodgeable rather than merely large', () => {
    // The swing is a `breath` cone with a wind-up that re-checks reach before
    // it lands, so a big number rewards the movement it telegraphs. It still
    // must not one-shot a share of a ~100 health champion that no amount of
    // moving could survive twice.
    const [body] = data.monsters!.dragon.members;
    const dragon = new Monster({
      game,
      preset: { ...body, camp: { x: 0, y: 0, r: 100 } },
    } as never);
    expect(dragon.damage).toBeLessThanOrEqual(25);
  });
});
