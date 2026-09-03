import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import { data } from '../../pack';
import makeDragonAbilities, {
  ELDER,
  ELEMENTS,
  ROTATION,
  dragonCycle,
  resetDragonRotation,
  scaledBonuses,
} from '../../monsters/Dragon';

/**
 * **Which drake opens the pit, and why it is not always the infernal.**
 *
 * The cycle was `[...ELEMENTS, ELDER]` written down once, so every match on
 * every map opened the same way and scouting the pit told you nothing you did
 * not already know.
 *
 * The obvious fix is `Math.random()`, and it is wrong here in a way nothing in
 * this pack would ever report. A LAN client **builds** its own jungle rather
 * than receiving one — `ClientSession` matches the two sides by construction
 * order — so a local draw gives the host an infernal and the client an ocean:
 * two different creatures paying two different buffs for the same kill, with
 * nothing in the protocol able to notice. That shipped once, as
 * `[...ELEMENTS].sort(() => Math.random() - 0.5)` at module scope, and was
 * reverted.
 *
 * So the order is drawn from `Game.matchSeed`, which the host puts in the
 * handshake (`core/src/game/matchSeed.ts`). The pair of properties that makes
 * that work is what this file holds: **the same seed always draws the same
 * order**, and **different seeds usually draw different ones**.
 */

const api = buildTestApi();
const { Monster } = api.units;

let game: TestGame;

/**
 * The order a pit runs, read the way the game reads it: spawn a body into the
 * pit — which is what draws the order — then ask the pit.
 *
 * A fresh `camp` object per call because the pit's *identity* is that object
 * by reference, exactly as `elementFor` keys on it.
 */
const orderFor = (seed: number | undefined, at = { x: 0, y: 0 }): string[] => {
  game = createGame() as TestGame;
  (game as unknown as { matchSeed?: number }).matchSeed = seed;

  const camp = { ...at, r: 100 };
  resetDragonRotation(camp);
  const dragon = new Monster({
    game,
    preset: {
      ...data.monsters!.dragon.members[0],
      camp,
      reviveTime: 100,
      abilities: makeDragonAbilities(api),
    },
  } as never);
  dragon.update(); // `onSpawn` fires on the first frame of a life

  return dragonCycle(camp).map(drake => drake.id);
};

/** Just the six, without the Elder that always tails them. */
const elementalsOf = (order: string[]): string[] => order.slice(0, ELEMENTS.length);

beforeEach(() => {
  installSpellObjectGlobals();
  installSketchMathGlobals();
  vi.stubGlobal('deltaTime', 16);
  vi.stubGlobal('frameCount', 0);
  game = createGame() as TestGame;
});

describe('the drake order a pit draws', () => {
  it('holds every elemental exactly once', () => {
    const elementals = elementalsOf(orderFor(4_242));
    expect([...elementals].sort()).toEqual(ELEMENTS.map(drake => drake.id).sort());
  });

  /** The Elder is the seventh drake, not one of the six: it means the cycle went round. */
  it('leaves the Elder last, never shuffled into the six', () => {
    for (let seed = 0; seed < 24; seed += 1) {
      const order = orderFor(seed);
      expect(order.at(-1)).toBe(ELDER.id);
      expect(elementalsOf(order)).not.toContain(ELDER.id);
    }
  });

  it('is the same for the same seed — which is what a LAN client depends on', () => {
    expect(orderFor(987_654)).toEqual(orderFor(987_654));
  });

  it('is not the same order every match', () => {
    const orders = new Set([...Array(24).keys()].map(seed => orderFor(seed).join(',')));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('does not always open with the infernal any more', () => {
    const openings = new Set([...Array(24).keys()].map(seed => orderFor(seed)[0]));
    expect(openings.size).toBeGreaterThan(1);
  });

  /** Two pits on one map must not run the same order in lockstep. */
  it('differs between two pits of the same match', () => {
    const seed = 555;
    expect(orderFor(seed, { x: 0, y: 0 })).not.toEqual(orderFor(seed, { x: 4_000, y: 3_000 }));
  });

  /**
   * A headless context has no match to have seeded, and neither does a pit
   * nothing has spawned into. Everything that read the written order before
   * this existed still reads it.
   */
  it('falls back to the written order when there is no seed', () => {
    expect(orderFor(undefined)).toEqual(ROTATION.map(drake => drake.id));
  });
});

/**
 * The blessing is sized against a ~100 health pool, where +8 attack damage is
 * a real swing. It stayed that size for the whole match while the shop did
 * not — four items in, one of them sells more attack damage than the pit pays,
 * and a team that fought for a drake had bought better with the gold it cost.
 */
describe('a blessing taken later is worth more', () => {
  const AD = (bonuses: ReturnType<typeof scaledBonuses>): number =>
    (bonuses as Record<string, Record<string, number>>).attackDamage?.flatBonus ?? 0;

  const infernal = ELEMENTS.find(drake => drake.id === 'infernal')!;
  const cloud = ELEMENTS.find(drake => drake.id === 'cloud')!;

  it('pays the authored number at the opening whistle', () => {
    // The half that was said to be right already: an early pit is not changed.
    expect(scaledBonuses(infernal.bonuses, 0)).toEqual(infernal.bonuses);
  });

  it('doubles by fifteen minutes and stops at triple', () => {
    expect(AD(scaledBonuses(infernal.bonuses, 15 * 60_000))).toBeCloseTo(AD(infernal.bonuses) * 2);
    expect(AD(scaledBonuses(infernal.bonuses, 30 * 60_000))).toBeCloseTo(AD(infernal.bonuses) * 3);
    // Capped, not merely slowed: an hour-long practice match must not hand out
    // a blessing worth six items.
    expect(AD(scaledBonuses(infernal.bonuses, 90 * 60_000))).toBeCloseTo(AD(infernal.bonuses) * 3);
  });

  it('leaves a share-of-the-wearer bonus exactly where it was', () => {
    // `percentBonus` multiplies what the wearer already has, so it grew with
    // the build by construction and never went stale. Scaling it would treble
    // the wind drake's move speed, which is a different game rather than a
    // bigger reward — and it is the only drake using that slot.
    expect(cloud.bonuses).toHaveProperty('speed.percentBonus');
    expect(scaledBonuses(cloud.bonuses, 40 * 60_000)).toEqual(cloud.bonuses);
  });

  it('scales every drake and the Elder, since all of them go through the pit', () => {
    for (const drake of ROTATION) {
      const late = scaledBonuses(drake.bonuses, 30 * 60_000) as Record<
        string,
        Record<string, number>
      >;
      for (const [stat, slots] of Object.entries(
        drake.bonuses as Record<string, Record<string, number>>
      )) {
        for (const [slot, amount] of Object.entries(slots)) {
          const want = slot === 'percentBonus' ? amount : amount * 3;
          expect(late[stat][slot], `${drake.id}.${stat}.${slot}`).toBeCloseTo(want);
        }
      }
    }
  });
});
