import { describe, expect, it } from 'vitest';
import { spellCatalog } from '../generated/spellCatalog';
import { data } from '../pack';

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
 * Nine spans in this pack were exactly that when the rescaling landed — two
 * shields on Shen's ultimate, heals across Soraka's kit, Master Yi's W,
 * Janna's ultimate and Tryndamere's Q. This is what stops a tenth.
 *
 * Item text is scanned beside spell text, for a **weaker** reason that is
 * worth stating rather than assuming. Core does *not* rescale an item
 * description — `economy/ItemShop` builds every item ability with
 * `damageScalesWithAbilityPower = false`, since they already read
 * `attackDamage` — so on the shelf this class is a colour and nothing more.
 * It is still worth holding: a heal or a stat wearing the damage colour reads
 * to a player as damage, which is the same lie one panel earlier.
 *
 * An item's *stat* line is the trap on that side. "Tăng 6 sát thương công" is
 * a number the item grants you, not a hit it deals, and the whole shelf is
 * full of them — which is why `NOT_DAMAGE` below names the stats as well as
 * the heals.
 */

/**
 * Units that mean the figure in front of them is **not** ability damage.
 *
 * `%` is deliberately absent: core refuses a percentage on its own, and
 * "damage from 40% to 100% of 30" is a sentence where colouring the shares as
 * damage reads correctly.
 */
const NOT_DAMAGE = [
  // Restored, absorbed or waited out — never dealt.
  'máu',
  'lá chắn',
  'khiên',
  'giây',
  'px',
  // Granted. Every one of these appears on the item shelf, where a sentence is
  // mostly stats and a `damage` span among them is almost always a slip.
  'giáp',
  'kháng phép',
  'tốc chạy',
  'năng lượng',
  'đòn đánh',
  'sát thương công',
  'sát thương chiêu thức',
  'tỉ lệ chí mạng',
];

/**
 * **Not** on that list, and it looked as though it belonged: "sát thương chí
 * mạng". On the shelf it is the crit-*damage* stat; in a spell it is damage
 * actually dealt, and Jhin's ultimate says exactly that — `60 sát thương chí
 * mạng` — which this scan flagged the moment the word was added. The stat
 * spelling is always a percentage and core refuses those on its own, so the
 * word buys nothing and costs a false positive on a real ability.
 */

/** `<span class="damage">…</span>`, non-greedy so two on a line stay two. */
const DAMAGE_SPAN = /<span class="damage">([\s\S]*?)<\/span>/g;

/** The flat figure a span opens with, if it opens with one. */
const LEADING_NUMBER = /^\s*(\d+(?:\.\d+)?)(?![\d.])\s*(.*)$/;

describe('every damage span this pack ships', () => {
  /** Every description this pack ships, spell and item alike, by id. */
  const shipped = (): [string, string][] => [
    ...Object.entries(spellCatalog).map(([id, spell]): [string, string] => [id, spell.description]),
    ...Object.values(data.items ?? {}).map((item): [string, string] => [
      `item ${item.id}`,
      item.description ?? '',
    ]),
  ];

  const offenders = (): string[] => {
    const found: string[] = [];
    for (const [id, description] of shipped()) {
      for (const [, inner] of description.matchAll(DAMAGE_SPAN)) {
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
    // above pass for ever, and this file exists precisely because nine real
    // spans went unnoticed until a feature started reading the class.
    const inner = '<span class="damage">80 máu</span>';
    const match = LEADING_NUMBER.exec([...inner.matchAll(DAMAGE_SPAN)][0][1]);
    expect(match).toBeTruthy();
    expect(NOT_DAMAGE.some(word => match![2].startsWith(word))).toBe(true);
  });

  it('reads enough of them to be worth running at all', () => {
    const tagged = shipped().filter(([, text]) => text.includes('class="damage"'));
    expect(tagged.length).toBeGreaterThan(150);
  });

  it('and reaches the item shelf, not only the spell list', () => {
    // If the shelf ever stops being read, this is the case that says so.
    const items = shipped().filter(([id]) => id.startsWith('item '));
    expect(items.length).toBeGreaterThan(20);
    expect(items.some(([, text]) => text.includes('class="damage"'))).toBe(true);
  });

  it('gives every number an item states a colour a reader can pick out', () => {
    // The bug this half was added for. Spell descriptions have been tagged
    // since they were written and item descriptions never were, so the item
    // panel rendered as one flat grey paragraph beside a spell panel with
    // three colours in it — the same HTML pipeline, the same stylesheet, and
    // nothing in the text for either to work on.
    //
    // Written as "any digit outside a span is untagged" rather than "every
    // item has a span", because an item's *stats* left the prose when core
    // grew a stat list of its own (`hud/itemStatLines.ts`) — six components
    // now have no description at all, and demanding a span of them would
    // demand a sentence they have no reason to carry. What is left is the
    // passive and the active, where every number is one this pack chose to
    // print and should therefore have coloured.
    const untagged = shipped()
      .filter(([id]) => id.startsWith('item '))
      .filter(([, text]) => /\d/.test(text.replace(/<span class="[a-z]+">[^<]*<\/span>/g, '')))
      .map(([id]) => id);

    expect(untagged).toEqual([]);
  });
});
