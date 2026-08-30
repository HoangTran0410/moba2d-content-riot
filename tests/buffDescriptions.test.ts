import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * A buff this pack invents has to say what it does.
 *
 * Core describes the generic ones for nothing: a control effect's sentence is
 * derived from the status flags it sets, and a `StatAmp`'s from the `bonuses`
 * it builds its modifier from (`buffs/describeBuff.ts`). So a pack extending
 * `Slow`, `Shield`, `DamageOverTime` or `StatAmp` inherits a correct tooltip
 * without writing one, and most of this pack's buffs do exactly that.
 *
 * The population this checks is the remainder: a class extending the **bare**
 * `Buff`, which by definition sets no flags and grants no stats, so there is
 * nothing to derive from and the hover panel falls back to a name and a
 * countdown. Bùa Đỏ was the clearest case — an `onHit` and nothing else, the
 * single most consequential blessing on the map, and its tooltip said "Bùa Đỏ
 * · còn 62 giây".
 *
 * `hudVisible = false` is the honest exemption and not a loophole: those never
 * reach the buff row at all. They are permanently-armed item passives whose
 * inventory slot is already the icon — six of this pack's eleven item buffs.
 */
const ROOT = resolve(__dirname, '..');

/** `export class X extends Buff {` … up to the matching close at column 0. */
const BARE_BUFF_CLASS = /export class (\w+) extends Buff \{([\s\S]*?)\n\}/g;

const sourcesIn = (dir: string): [string, string][] =>
  readdirSync(join(ROOT, dir))
    .filter(name => name.endsWith('.ts'))
    .map(name => [`${dir}/${name}`, readFileSync(join(ROOT, dir, name), 'utf8')]);

describe('a buff this pack invents', () => {
  const bareBuffs = (): { where: string; name: string; body: string }[] => {
    const found: { where: string; name: string; body: string }[] = [];
    for (const [where, source] of [...sourcesIn('spells'), ...sourcesIn('monsters')]) {
      for (const [, name, body] of source.matchAll(BARE_BUFF_CLASS)) {
        found.push({ where, name, body });
      }
    }
    return found;
  };

  it('is a real population, not an empty one', () => {
    // Without this the case below passes for ever the day the regex stops
    // matching — which it would, silently, if the pack changed how it writes a
    // buff class.
    expect(bareBuffs().length).toBeGreaterThan(5);
  });

  it('says what it does, or is not on the buff row at all', () => {
    const mute = bareBuffs()
      .filter(({ body }) => !/hudVisible\s*=\s*false/.test(body))
      // Status flags count as speaking: core derives the sentence from them
      // (`deniesMovement` and friends), so a buff that sets them is described.
      .filter(({ body }) => !/statusFlagsTo(Enable|Disable)\s*=/.test(body))
      .filter(({ body }) => !/\bdescription\s*(\?\?)?=/.test(body))
      .map(({ where, name }) => `${where}: ${name}`);

    expect(
      mute,
      `these would hover as a name and a countdown:\n  ${mute.join('\n  ')}`
    ).toEqual([]);
  });
});
