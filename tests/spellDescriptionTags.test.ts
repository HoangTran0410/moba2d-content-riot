import { describe, expect, it } from 'vitest';
import { spellCatalog } from '../generated/spellCatalog';

/**
 * `class="damage"` is a claim, and this pack is the one making it.
 *
 * Core reads that class as "a flat number `takeDamage` will multiply by this
 * caster's ability power" and rescales it for the HUD
 * (`combat/Amplification.ts`'s `amplifiedDamageText`), because a description
 * is authored text with its damage baked in and the bar otherwise promises
 * first-frame numbers for the whole match.
 *
 * Which makes a mis-tagged span expensive in a way it never used to be. Only
 * `takeDamage` amplifies — a heal, a shield and a duration do not — so a
 * healing number wearing the damage class now reads back to the player as a
 * heal that grows with ability power, which is a lie the cast path will not
 * honour. It was already the wrong colour; now it is also the wrong number.
 *
 * Five spans in this pack were exactly that when the rescaling landed (two
 * shields on Shen's ultimate, three heals across Soraka's kit and Master Yi's
 * W). This is what stops a sixth.
 */

/**
 * Units that mean the figure in front of them is **not** ability damage.
 *
 * `%` is deliberately absent: core refuses a percentage on its own, and
 * "damage from 40% to 100% of 30" is a sentence where colouring the shares as
 * damage reads correctly.
 */
const NOT_DAMAGE = ['máu', 'lá chắn', 'khiên', 'giây', 'px'];

/** `<span class="damage">…</span>`, non-greedy so two on a line stay two. */
const DAMAGE_SPAN = /<span class="damage">([\s\S]*?)<\/span>/g;

/** The flat figure a span opens with, if it opens with one. */
const LEADING_NUMBER = /^\s*(\d+(?:\.\d+)?)(?![\d.])\s*(.*)$/;

describe('every damage span this pack ships', () => {
  const offenders = (): string[] => {
    const found: string[] = [];
    for (const [id, spell] of Object.entries(spellCatalog)) {
      for (const [, inner] of spell.description.matchAll(DAMAGE_SPAN)) {
        const match = LEADING_NUMBER.exec(inner);
        if (!match) continue;
        const unit = NOT_DAMAGE.find(word => match[2].startsWith(word));
        if (unit) found.push(`${id}: "${inner}" — ${unit} is not amplified`);
      }
    }
    return found;
  };

  it('holds a number ability power actually multiplies', () => {
    expect(offenders()).toEqual([]);
  });

  it('and this scan can see one, so the case above means something', () => {
    // The falsification. A reader that matched nothing would make the check
    // above pass for ever, and this file exists precisely because five real
    // spans went unnoticed until a feature started reading the class.
    const inner = '<span class="damage">80 máu</span>';
    const match = LEADING_NUMBER.exec([...inner.matchAll(DAMAGE_SPAN)][0][1]);
    expect(match).toBeTruthy();
    expect(NOT_DAMAGE.some(word => match![2].startsWith(word))).toBe(true);
  });

  it('reads enough spells to be worth running at all', () => {
    const tagged = Object.values(spellCatalog).filter(spell =>
      spell.description.includes('class="damage"')
    );
    expect(tagged.length).toBeGreaterThan(150);
  });
});
