import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * A spell that tells the player what kind of damage it deals has to deal it.
 *
 * ## What this caught
 *
 * Four, on the day it was written, and every one of them the same shape: the
 * *word* was in the tooltip, the *constant* was named for it, sometimes the
 * *comment above the call* said it outright — and the call passed `'MAGIC'`.
 *
 *   - `MasterYi_E`: a constant called `BONUS_TRUE_DAMAGE`, a tooltip promising
 *     "sát thương chuẩn", and a magic hit.
 *   - `Camille_Q`: `// True damage Q2` directly above `takeDamage(…, 'MAGIC')`.
 *   - `Garen_R`: Công Lý Demacia, an execute that is true damage in the game
 *     this borrows from and says so in its own description.
 *   - `Sett_W`: "dải trung tâm gây sát thương chuẩn", dealt as magic.
 *
 * Three of the four were *already commented correctly*. Nobody was confused
 * about the intent; the argument was simply never updated when
 * `takeDamage` grew a damage type, and nothing in the toolchain compares a
 * sentence to an argument.
 *
 * ## What it does not check
 *
 * Silence. Most abilities in this pack say only "sát thương" and take the
 * engine's default (`MAGIC`), and this says nothing about whether that default
 * is the *right* type for them — that is a balance question per ability, not a
 * contradiction. What is checkable, and what this checks, is that a spell
 * making a claim is not contradicted by its own code.
 */

const SPELLS = resolve(__dirname, '../../spells');

/**
 * Every way a spell says what kind of damage it deals — the tooltip a player
 * reads, and the names and comments the code uses about itself.
 *
 * Both halves are needed, and each caught something the other missed. Only
 * `MasterYi_E` and `Sett_W` promise "sát thương chuẩn" to the player;
 * `Camille_Q` says it in a constant (`CAMILLE_Q_TRUE_DAMAGE`) and a comment,
 * and `Garen_R` only in prose at the top of its file. An intent stated in a
 * comment and contradicted three lines later is exactly as much a defect as
 * one stated in a tooltip — more, if anything, because the person who wrote
 * it believed it.
 *
 * English prose for the two *ordinary* types is deliberately not on this list.
 * `MAGIC` is the engine's default, so a file mentioning it proves nothing
 * about intent, and "magic damage" turns up in comments about unrelated
 * things — `Item_EssenceReaver` explains that violet is the colour the combat
 * text uses for it, three lines above a `'PHYSICAL'` hit, and was the first
 * thing this flagged. `TRUE` is never a default and never incidental: writing
 * it down is always a decision.
 */
const CLAIMS: [RegExp, string][] = [
  [/sát thương chuẩn|true damage|TRUE_DAMAGE/i, 'TRUE'],
  [/sát thương vật lý|PHYSICAL_DAMAGE/i, 'PHYSICAL'],
  [/sát thương phép/i, 'MAGIC'],
];

const spellFiles = (): string[] =>
  readdirSync(SPELLS)
    .filter(name => name.endsWith('.ts'))
    .map(name => join(SPELLS, name));

describe('a spell that names a damage type', () => {
  it('is checking a real population, not an empty one', () => {
    const claiming = spellFiles().filter(file => {
      const source = readFileSync(file, 'utf8');
      return CLAIMS.some(([phrase]) => phrase.test(source)) && source.includes('takeDamage(');
    });
    expect(claiming.length, 'no spell claims a damage type — the regexes have rotted').toBeGreaterThan(3);
  });

  it('deals the kind it says it deals', () => {
    const lying: string[] = [];

    for (const file of spellFiles()) {
      const source = readFileSync(file, 'utf8');
      const dealt = new Set(
        [...source.matchAll(/takeDamage\([^)]*?'(PHYSICAL|MAGIC|TRUE)'/gs)].map(m => m[1])
      );
      if (!dealt.size) continue;

      for (const [phrase, type] of CLAIMS) {
        if (!phrase.test(source)) continue;
        if (dealt.has(type)) continue;
        lying.push(
          `${file.split('/').pop()}: says ${type} damage, deals only ${[...dealt].join(', ')}`
        );
      }
    }

    expect(
      lying,
      `these say one thing and deal another:\n  ${lying.join('\n  ')}`
    ).toEqual([]);
  });
});
