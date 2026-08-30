import { describe, expect, it } from 'vitest';
import { spellCatalog } from '../generated/spellCatalog';
import { data } from '../pack';
import { pct, secs } from '../text';

/**
 * The number a player reads, not the number JavaScript computed.
 *
 * Every `percent`-shaped constant in this pack is a fraction — `0.28` is a 28%
 * slow — and every description that printed one wrote `${SLOW_PERCENT * 100}%`.
 * In binary floating point `0.28 * 100` is `28.000000000000004`, so Lissandra's
 * Q advertised **làm chậm 28.000000004%** on the card a player reads before
 * picking her. Durations had the same shape one division over: a 166ms tick
 * printed as `0.166 giây`.
 *
 * Exactly one of the sixty percentage sites was visibly broken when this was
 * written, and that is the argument for the scan rather than against it. Which
 * fractions survive `* 100` intact is a property of their binary
 * representation and of nothing a person can see: `0.3` is fine, `0.28` is
 * not, so the next value anybody retunes is a coin flip. The failure is
 * silent, cosmetic, and in the shop window.
 *
 * ## Why this scans the rendered catalogue
 *
 * `pct` and `secs` are the fix, but a test that only checked the helpers would
 * pass forever while a new spell wrote `${X * 100}` by hand — which is what
 * every one of these files did before, because it is the obvious thing to
 * write. What has to hold is a property of the *output*, so that is what is
 * measured: no number a player is shown carries a binary tail.
 */

/**
 * Three decimals, not two.
 *
 * Two would refuse legitimate figures — a 12.5% share is a number an ability
 * may honestly have — while a binary tail is always long: `28.000000000000004`,
 * `0.30000000000000004`. Three is comfortably past anything hand-written and
 * comfortably short of anything floating point produces by accident.
 */
const BINARY_TAIL = /\d+\.\d{3,}/;

const shipped = (): [string, string][] => [
  ...Object.entries(spellCatalog).map(([id, spell]): [string, string] => [id, spell.description]),
  ...Object.values(data.items ?? {}).map((item): [string, string] => [
    `item ${item.id}`,
    item.description ?? '',
  ]),
];

describe('every number this pack prints', () => {
  it('carries no floating-point tail', () => {
    const offenders: string[] = [];
    for (const [id, description] of shipped()) {
      const found = BINARY_TAIL.exec(description);
      if (found) offenders.push(`${id}: ${found[0]}`);
    }
    expect(offenders, 'a description is showing a binary tail — use pct() or secs()').toEqual([]);
  });
});

describe('the helpers that stop it', () => {
  it('turns the fraction that started this into a whole percent', () => {
    // 0.28 * 100 is 28.000000000000004 and always will be.
    expect(pct(0.28)).toBe('28');
  });

  it('keeps a real half-percent rather than rounding it away', () => {
    // Whole-number rounding would print 8%, which is a different ability.
    expect(pct(0.075)).toBe('7.5');
  });

  it('drops the trailing zero a whole number would otherwise carry', () => {
    expect(pct(0.3)).toBe('30');
    expect(secs(5_000)).toBe('5');
  });

  it('rounds a tick interval to something a player can hold in their head', () => {
    // The 166ms tick that printed as `0.166 giây`.
    expect(secs(166)).toBe('0.2');
    expect(secs(1_500)).toBe('1.5');
  });
});
