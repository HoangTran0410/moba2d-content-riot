import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import { data } from '../../pack';
import { POOL, SLAM, SPIT } from '../../monsters/Baron';
import { VENOM, WEB } from '../../monsters/Vilemaw';

/**
 * Vilemaw fights like Baron, because it is paid like Baron and then some.
 *
 * The report was "Vilemaw yếu quá, đánh không thấm gì", and the table agreed
 * once anybody added it up: 900 health and an 8-damage signature against
 * Baron's 1000 and a kit that opens with 18-plus-poison. Vilemaw was landing
 * about seventy per cent of Baron's damage while paying a **three-minute**
 * blessing on a **sixty-second** respawn — against Baron's two minutes on
 * three. The more generous objective was the easier one.
 *
 * ## Why this is computed and not read
 *
 * `campPower.test.ts` measures a camp's swing by building a real `Monster`,
 * and says in its own header that "no reading of the data table can see a
 * kit" — which is exactly why both bosses were excluded from its comparison,
 * and exactly how this drifted. A boss *is* its kit. So the swing is still
 * measured the way that file measures it, and the abilities are summed from
 * the constants each one exports, in one formula that applies to both.
 *
 * Nothing here says what the numbers should be. It says the two bosses must
 * land within sight of each other, and it fails when a retune moves one.
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

const MINUTE_MS = 60_000;

/**
 * Damage a camp's basic attacks alone put out in a minute.
 *
 * Built as a real `Monster` rather than read off the table, because a body may
 * leave `damage` and `attackInterval` out and core then derives them — the
 * derivation stays core's and this file never copies it.
 */
const swingPerMinute = (id: string): number => {
  const monster = data.monsters?.[id];
  expect(monster, `the pack has no camp called ${id}`).toBeTruthy();
  return monster!.members.reduce((total, member) => {
    const body = new Monster({
      game,
      preset: { ...member, camp: { x: 0, y: 0, r: 100 } },
    } as never);
    return total + (body.damage / (body.attackInterval / 1_000)) * 60;
  }, 0);
};

/** What one ability contributes in a minute, if every cast lands in full. */
const abilityPerMinute = (cooldownMs: number, damagePerCast: number): number =>
  (MINUTE_MS / cooldownMs) * damagePerCast;

/** How much health a camp has to be chewed through. */
const poolOf = (id: string): number =>
  (data.monsters?.[id]?.members ?? []).reduce((total, m) => total + (m.health ?? 0), 0);

const baronPerMinute = (): number =>
  swingPerMinute('baron') +
  abilityPerMinute(SPIT.cooldownMs, SPIT.damage + SPIT.poisonTotal) +
  abilityPerMinute(SLAM.cooldownMs, SLAM.damage) +
  abilityPerMinute(POOL.cooldownMs, POOL.damagePerTick * POOL.ticks);

const vilemawPerMinute = (): number =>
  swingPerMinute('vilemaw') +
  abilityPerMinute(WEB.cooldownMs, WEB.damage) +
  abilityPerMinute(
    VENOM.cooldownMs,
    VENOM.damagePerTick * (VENOM.durationMs / VENOM.tickEveryMs)
  );

describe('the two rooted bosses', () => {
  it('put out damage within a quarter of each other', () => {
    const baron = baronPerMinute();
    const vilemaw = vilemawPerMinute();

    // A band, not equality: they are different fights on purpose — Baron's
    // pressure is area you stand in, Vilemaw's is a place you get dragged to —
    // and identical totals would mean one of them had stopped being itself.
    // A quarter is wide enough for that and narrow enough that "yếu quá" fails.
    expect(vilemaw / baron, `baron ${baron.toFixed(0)}/min, vilemaw ${vilemaw.toFixed(0)}/min`)
      .toBeGreaterThan(0.8);
    expect(vilemaw / baron).toBeLessThan(1.25);
  });

  it('take about as long to kill', () => {
    expect(poolOf('vilemaw') / poolOf('baron')).toBeGreaterThan(0.9);
  });

  /**
   * And the objective is not cheaper than the boss guarding it. Vilemaw pays a
   * longer blessing on a shorter respawn than Baron does; a weaker fight on top
   * of that is a strictly better objective for strictly less work, which is
   * the shape the report was feeling.
   */
  it('is not the easier one despite paying the richer blessing', () => {
    const baron = data.monsters?.baron?.members[0];
    const vilemaw = data.monsters?.vilemaw?.members[0];

    expect(vilemaw!.reviveTime!).toBeLessThan(baron!.reviveTime!);
    expect(vilemawPerMinute()).toBeGreaterThanOrEqual(baronPerMinute() * 0.8);
  });
});
